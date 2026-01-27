import os
import re
import secrets
import hashlib
import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sqlalchemy import (
    create_engine,
    String,
    DateTime,
    UniqueConstraint,
    select,
    delete,
    Integer,
    Text,
    Boolean,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError

# SendGrid (library already in your requirements.txt)
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


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

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "15"))
AUTH_PREVIEW_MODE = os.getenv("AUTH_PREVIEW_MODE", "true").lower() in ("1", "true", "yes")
AUTH_USERID_PEPPER = os.getenv("AUTH_USERID_PEPPER", "")

NOTIFICATIONS_LIMIT = int(os.getenv("NOTIFICATIONS_LIMIT", "200"))

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip()
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "").strip()
SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "Black Within").strip()


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
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String(40), index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    age: Mapped[int] = mapped_column(Integer)
    city: Mapped[str] = mapped_column(String(80))
    state_us: Mapped[str] = mapped_column(String(80))
    photo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    identity_preview: Mapped[str] = mapped_column(String(500))
    intention: Mapped[str] = mapped_column(String(120))
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(60), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),)


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)       # liker
    profile_id: Mapped[str] = mapped_column(String(60), index=True)    # liked profile
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)       # recipient
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


# -----------------------------
# Engine + create tables (MUST come after Base/models)
# -----------------------------
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

# Ensure all tables exist (MVP auto-create)
Base.metadata.create_all(bind=engine)


# -----------------------------
# Schemas
# -----------------------------
class MeResponse(BaseModel):
    user_id: str


class ProfileAction(BaseModel):
    user_id: str
    profile_id: str


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


class ProfileItem(BaseModel):
    id: str
    owner_user_id: str
    displayName: str
    age: int
    city: str
    stateUS: str
    photo: Optional[str] = None
    identityPreview: str
    intention: str
    tags: List[str]
    isAvailable: bool


class ProfilesResponse(BaseModel):
    items: List[ProfileItem]


# Accept BOTH camelCase and snake_case (frontend may send either)
class UpsertMyProfilePayload(BaseModel):
    owner_user_id: str  # camelCase
    displayName: Optional[str] = None
    stateUS: Optional[str] = None
    identityPreview: Optional[str] = None
    isAvailable: Optional[bool] = True

    # snake_case
    display_name: Optional[str] = None
    state_us: Optional[str] = None
    identity_preview: Optional[str] = None
    is_available: Optional[bool] = None

    age: int
    city: str
    photo: Optional[str] = None
    intention: str
    tags: List[str] = []


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Black Within API", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

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


def _send_email_sendgrid(to_email: str, subject: str, html: str) -> None:
    """
    If SendGrid isn't configured, raise a clear error in live mode.
    """
    if not SENDGRID_API_KEY:
        raise RuntimeError("SENDGRID_API_KEY is not set")
    if not SENDGRID_FROM_EMAIL:
        raise RuntimeError("SENDGRID_FROM_EMAIL is not set")

    message = Mail(
        from_email=(SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME or "Black Within"),
        to_emails=to_email,
        subject=subject,
        html_content=html,
    )

    sg = SendGridAPIClient(SENDGRID_API_KEY)
    resp = sg.send(message)

    # SendGrid returns 202 on success
    if resp.status_code not in (200, 202):
        raise RuntimeError(f"SendGrid send failed: {resp.status_code} {resp.body}")


@app.get("/")
def root():
    return {"status": "ok", "service": "black-within-api"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "previewMode": AUTH_PREVIEW_MODE,
        "sendgridConfigured": bool(SENDGRID_API_KEY and SENDGRID_FROM_EMAIL),
        "corsOrigins": origins,
    }


# -----------------------------
# ME (frontend expects this)
# -----------------------------
@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


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
        # Hard reset to avoid any weird race conditions
        session.execute(delete(LoginCode).where(LoginCode.email == email))
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

    # Preview mode returns code (dev convenience)
    if AUTH_PREVIEW_MODE:
        return {"ok": True, "devCode": code, "sent": False, "previewMode": True}

    # Live mode: send email
    try:
        _send_email_sendgrid(
            to_email=email,
            subject="Your Black Within verification code",
            html=f"""
              <div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
                <p>Your verification code is:</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:2px">{code}</p>
                <p>This code expires in {AUTH_CODE_TTL_MINUTES} minutes.</p>
              </div>
            """,
        )
        return {"ok": True, "sent": True, "previewMode": False}
    except Exception as e:
        print("SendGrid exception:", str(e))
        # While stabilizing, return devCode so you can still log in if email delivery has issues
        return {"ok": True, "sent": False, "error": str(e), "devCode": code, "previewMode": False}


@app.post("/auth/verify-code")
def verify_code(payload: VerifyCodePayload):
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()

    if not code or len(code) != 6:
        raise HTTPException(status_code=400, detail="A 6-digit code is required")

    with Session(engine) as session:
        row = session.execute(select(LoginCode).where(LoginCode.email == email)).scalar_one_or_none()

        if not row:
            print(f"VERIFY FAIL: no code row for email={email}")
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        if datetime.utcnow() > row.expires_at:
            print(f"VERIFY FAIL: expired for email={email}, expired_at={row.expires_at.isoformat()}")
            session.execute(delete(LoginCode).where(LoginCode.email == email))
            session.commit()
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        if row.code != code:
            print(f"VERIFY FAIL: code mismatch for email={email} (got={code})")
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        # Success: consume code
        session.execute(delete(LoginCode).where(LoginCode.email == email))
        session.commit()

    user_id = _make_user_id_from_email(email)
    _ensure_user(user_id)
    return {"ok": True, "userId": user_id}


# -----------------------------
# PROFILES
# -----------------------------
@app.get("/profiles", response_model=ProfilesResponse)
def list_profiles(
    exclude_owner_user_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    with Session(engine) as session:
        q = (
            select(Profile)
            .where(Profile.is_available == True)
            .order_by(Profile.updated_at.desc())
            .limit(limit)
        )
        if exclude_owner_user_id:
            q = q.where(Profile.owner_user_id != exclude_owner_user_id)

        rows = session.execute(q).scalars().all()
        items: List[ProfileItem] = []

        for p in rows:
            try:
                tags = json.loads(p.tags_json or "[]")
                if not isinstance(tags, list):
                    tags = []
            except Exception:
                tags = []

            items.append(
                ProfileItem(
                    id=p.id,
                    owner_user_id=p.owner_user_id,
                    displayName=p.display_name,
                    age=p.age,
                    city=p.city,
                    stateUS=p.state_us,
                    photo=p.photo,
                    identityPreview=p.identity_preview,
                    intention=p.intention,
                    tags=tags,
                    isAvailable=bool(p.is_available),
                )
            )

        return ProfilesResponse(items=items)


def _coerce_upsert_fields(payload: UpsertMyProfilePayload):
    display = (payload.displayName or payload.display_name or "").strip()
    state = (payload.stateUS or payload.state_us or "").strip()
    preview = (payload.identityPreview or payload.identity_preview or "").strip()

    is_avail = payload.isAvailable
    if payload.is_available is not None:
        is_avail = payload.is_available

    if not display:
        raise HTTPException(status_code=400, detail="displayName/display_name is required")
    if not state:
        raise HTTPException(status_code=400, detail="stateUS/state_us is required")
    if not preview:
        raise HTTPException(status_code=400, detail="identityPreview/identity_preview is required")

    return display, state, preview, bool(is_avail)


@app.post("/profiles/upsert", response_model=ProfileItem)
def upsert_my_profile(payload: UpsertMyProfilePayload):
    owner_user_id = _ensure_user(payload.owner_user_id)
    display, state, preview, is_avail = _coerce_upsert_fields(payload)

    now = datetime.utcnow()
    with Session(engine) as session:
        existing = session.execute(
            select(Profile).where(Profile.owner_user_id == owner_user_id)
        ).scalar_one_or_none()
        tags_json = json.dumps((payload.tags or [])[:25])

        if existing:
            existing.display_name = display
            existing.age = int(payload.age)
            existing.city = payload.city.strip()
            existing.state_us = state
            existing.photo = (payload.photo or "").strip() or None
            existing.identity_preview = preview
            existing.intention = payload.intention.strip()
            existing.tags_json = tags_json
            existing.is_available = is_avail
            existing.updated_at = now
            session.commit()
            pid = existing.id
        else:
            pid = _new_id()
            session.add(
                Profile(
                    id=pid,
                    owner_user_id=owner_user_id,
                    display_name=display,
                    age=int(payload.age),
                    city=payload.city.strip(),
                    state_us=state,
                    photo=(payload.photo or "").strip() or None,
                    identity_preview=preview,
                    intention=payload.intention.strip(),
                    tags_json=tags_json,
                    is_available=is_avail,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        p = session.get(Profile, pid)
        tags = json.loads(p.tags_json or "[]")
        return ProfileItem(
            id=p.id,
            owner_user_id=p.owner_user_id,
            displayName=p.display_name,
            age=p.age,
            city=p.city,
            stateUS=p.state_us,
            photo=p.photo,
            identityPreview=p.identity_preview,
            intention=p.intention,
            tags=tags if isinstance(tags, list) else [],
            isAvailable=bool(p.is_available),
        )


# IMPORTANT: your frontend currently POSTs to /profiles (so keep this alias)
@app.post("/profiles", response_model=ProfileItem)
def upsert_profile_alias(payload: UpsertMyProfilePayload):
    return upsert_my_profile(payload)


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
# Notifications
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
        rows = session.execute(select(Like.profile_id).where(Like.user_id == user_id)).all()
        return IdListResponse(ids=[r[0] for r in rows])


@app.post("/likes")
def like(payload: ProfileAction):
    liker_user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        prof = session.get(Profile, profile_id)
        if not prof:
            raise HTTPException(status_code=404, detail="Profile not found")

        existing = session.execute(
            select(Like).where(Like.user_id == liker_user_id, Like.profile_id == profile_id)
        ).scalar_one_or_none()
        if existing:
            return {"ok": True}

        session.add(Like(user_id=liker_user_id, profile_id=profile_id, created_at=datetime.utcnow()))

        recipient_user_id = prof.owner_user_id
        if recipient_user_id and recipient_user_id != liker_user_id:
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
