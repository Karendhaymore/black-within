import os
import re
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine,
    String,
    DateTime,
    UniqueConstraint,
    select,
    delete,
    Integer,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError


# -----------------------------
# Config
# -----------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

# Render sometimes provides postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Force SQLAlchemy to use psycopg (v3)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com,http://localhost:3000")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

# Optional regex to allow Render preview domains
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "")  # e.g. https://.*\.onrender\.com

AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "15"))
AUTH_PREVIEW_MODE = os.getenv("AUTH_PREVIEW_MODE", "true").lower() in ("1", "true", "yes")
AUTH_USERID_PEPPER = os.getenv("AUTH_USERID_PEPPER", "")

# Simple paging defaults for notifications
NOTIFICATIONS_LIMIT = int(os.getenv("NOTIFICATIONS_LIMIT", "200"))

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# -----------------------------
# Database models
# -----------------------------
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # profile id
    owner_user_id: Mapped[str] = mapped_column(String(40), index=True)  # user who owns it
    display_name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int] = mapped_column(Integer)
    city: Mapped[str] = mapped_column(String(80))
    state_us: Mapped[str] = mapped_column(String(30))
    photo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    identity_preview: Mapped[str] = mapped_column(String(500))
    intention: Mapped[str] = mapped_column(String(80))
    tags_csv: Mapped[str] = mapped_column(String(800), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),)


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)      # actor
    profile_id: Mapped[str] = mapped_column(String(50), index=True)   # liked profile id
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)  # recipient user id
    type: Mapped[str] = mapped_column(String(20), default="like")
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LoginCode(Base):
    __tablename__ = "login_codes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True, unique=True)
    code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(engine)


# -----------------------------
# Schemas
# -----------------------------
class ProfileAction(BaseModel):
    user_id: str
    profile_id: str


class UpsertProfilePayload(BaseModel):
    owner_user_id: str
    display_name: str
    age: int
    city: str
    state_us: str
    photo: Optional[str] = None
    identity_preview: str
    intention: str
    tags: List[str] = Field(default_factory=list)


class IdListResponse(BaseModel):
    ids: List[str]


class RequestCodePayload(BaseModel):
    email: str


class VerifyCodePayload(BaseModel):
    email: str
    code: str


class NotificationItem(BaseModel):
    id: str
    user_id: str
    type: str
    message: str
    created_at: str


class NotificationsResponse(BaseModel):
    items: List[NotificationItem]


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Black Within API", version="0.1.0")

cors_kwargs = dict(
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
if CORS_ORIGIN_REGEX.strip():
    cors_kwargs["allow_origin_regex"] = CORS_ORIGIN_REGEX.strip()

app.add_middleware(CORSMiddleware, **cors_kwargs)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="A valid email is required")
    return email


def _make_user_id_from_email(email: str) -> str:
    raw = f"{AUTH_USERID_PEPPER}:{email}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:40]


def _new_id() -> str:
    return secrets.token_hex(20)[:40]


def _ensure_user(user_id: str) -> str:
    user_id = (user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            session.add(User(id=user_id))
            session.commit()

    return user_id


@app.get("/health")
def health():
    return {"status": "ok"}


# -----------------------------
# AUTH
# -----------------------------
@app.post("/auth/request-code")
def request_code(payload: RequestCodePayload):
    email = _normalize_email(payload.email)

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)
    now = datetime.utcnow()

    with Session(engine) as session:
        existing = session.execute(
            select(LoginCode).where(LoginCode.email == email)
        ).scalar_one_or_none()

        if existing:
            existing.code = code
            existing.expires_at = expires_at
            existing.created_at = now
        else:
            session.add(
                LoginCode(
                    id=_new_id(),
                    email=email,
                    code=code,
                    expires_at=expires_at,
                    created_at=now,
                )
            )

        session.commit()

    if AUTH_PREVIEW_MODE:
        return {"ok": True, "devCode": code}

    return {"ok": True}


@app.post("/auth/verify-code")
def verify_code(payload: VerifyCodePayload):
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()

    if not code or len(code) != 6:
        raise HTTPException(status_code=400, detail="A 6-digit code is required")

    with Session(engine) as session:
        row = session.execute(
            select(LoginCode).where(LoginCode.email == email)
        ).scalar_one_or_none()

        if not row:
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        if datetime.utcnow() > row.expires_at:
            session.execute(delete(LoginCode).where(LoginCode.email == email))
            session.commit()
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        if row.code != code:
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        session.execute(delete(LoginCode).where(LoginCode.email == email))
        session.commit()

    user_id = _make_user_id_from_email(email)
    _ensure_user(user_id)
    return {"ok": True, "userId": user_id}


# -----------------------------
# Profiles (create + browse)
# -----------------------------
@app.post("/profiles")
def upsert_profile(payload: UpsertProfilePayload):
    owner_user_id = _ensure_user(payload.owner_user_id)

    # create a stable profile id for the user
    profile_id = f"p_{owner_user_id}"

    tags_csv = ",".join([t.strip() for t in payload.tags if t.strip()])

    with Session(engine) as session:
        existing = session.get(Profile, profile_id)
        if existing:
            existing.display_name = payload.display_name
            existing.age = payload.age
            existing.city = payload.city
            existing.state_us = payload.state_us
            existing.photo = payload.photo
            existing.identity_preview = payload.identity_preview
            existing.intention = payload.intention
            existing.tags_csv = tags_csv
        else:
            session.add(
                Profile(
                    id=profile_id,
                    owner_user_id=owner_user_id,
                    display_name=payload.display_name,
                    age=payload.age,
                    city=payload.city,
                    state_us=payload.state_us,
                    photo=payload.photo,
                    identity_preview=payload.identity_preview,
                    intention=payload.intention,
                    tags_csv=tags_csv,
                    created_at=datetime.utcnow(),
                )
            )
        session.commit()

    return {"ok": True, "profile_id": profile_id}


@app.get("/profiles")
def list_profiles(limit: int = 50, offset: int = 0):
    with Session(engine) as session:
        rows = session.execute(
            select(Profile).order_by(Profile.created_at.desc()).limit(limit).offset(offset)
        ).scalars().all()

        def to_dict(p: Profile):
            return {
                "id": p.id,
                "owner_user_id": p.owner_user_id,
                "displayName": p.display_name,
                "age": p.age,
                "city": p.city,
                "stateUS": p.state_us,
                "photo": p.photo,
                "identityPreview": p.identity_preview,
                "intention": p.intention,
                "tags": [t for t in (p.tags_csv or "").split(",") if t],
                "isAvailable": True,
            }

        return {"items": [to_dict(p) for p in rows]}


# -----------------------------
# Saved profiles
# -----------------------------
@app.get("/saved", response_model=IdListResponse)
def get_saved(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        rows = session.execute(
            select(SavedProfile.profile_id).where(SavedProfile.user_id == user_id)
        ).all()
        return IdListResponse(ids=[r[0] for r in rows])


@app.post("/saved")
def save_profile(payload: ProfileAction):
    user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        existing = session.execute(
            select(SavedProfile).where(
                SavedProfile.user_id == user_id,
                SavedProfile.profile_id == profile_id,
            )
        ).scalar_one_or_none()

        if existing:
            return {"ok": True}

        session.add(
            SavedProfile(
                user_id=user_id,
                profile_id=profile_id,
                created_at=datetime.utcnow(),
            )
        )

        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return {"ok": True}

    return {"ok": True}


@app.delete("/saved")
def unsave_profile(user_id: str = Query(...), profile_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    profile_id = (profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        session.execute(
            delete(SavedProfile).where(
                SavedProfile.user_id == user_id,
                SavedProfile.profile_id == profile_id,
            )
        )
        session.commit()

    return {"ok": True}


# -----------------------------
# Notifications (DB-backed)
# -----------------------------
@app.get("/notifications", response_model=NotificationsResponse)
def get_notifications(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        rows = session.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(NOTIFICATIONS_LIMIT)
        ).scalars().all()

        items = [
            NotificationItem(
                id=str(n.id),
                user_id=n.user_id,
                type=n.type or "notice",
                message=n.message,
                created_at=n.created_at.isoformat(),
            )
            for n in rows
        ]
        return NotificationsResponse(items=items)


@app.delete("/notifications")
def clear_notifications(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        session.execute(delete(Notification).where(Notification.user_id == user_id))
        session.commit()
    return {"ok": True}


# -----------------------------
# Likes
# -----------------------------
@app.get("/likes", response_model=IdListResponse)
def get_likes(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        rows = session.execute(
            select(Like.profile_id).where(Like.user_id == user_id)
        ).all()
        return IdListResponse(ids=[r[0] for r in rows])


@app.post("/likes")
def like(payload: ProfileAction):
    actor_user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        # Ensure profile exists and find recipient
        prof = session.get(Profile, profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="Profile not found")

        recipient_user_id = prof.owner_user_id
        _ensure_user(recipient_user_id)

        # Prevent duplicate likes from same actor to same profile
        existing = session.execute(
            select(Like).where(Like.user_id == actor_user_id, Like.profile_id == profile_id)
        ).scalar_one_or_none()
        if existing:
            return {"ok": True}

        session.add(Like(user_id=actor_user_id, profile_id=profile_id, created_at=datetime.utcnow()))

        # Notification belongs to the RECIPIENT
        session.add(
            Notification(
                user_id=recipient_user_id,
                type="like",
                message="Someone liked your profile.",
                created_at=datetime.utcnow(),
            )
        )

        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return {"ok": True}

    return {"ok": True}
