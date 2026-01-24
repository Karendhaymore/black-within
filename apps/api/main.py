import os
import re
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import List

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
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session


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


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),)


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


class LoginCode(Base):
    """
    Your DB requires:
      - id NOT NULL
      - created_at NOT NULL
    So we generate id and set created_at ourselves.
    """
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


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Black Within API", version="0.1.0")

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

   from sqlalchemy import select
from datetime import datetime

with Session(engine) as session:
    # 1. Ensure user exists
    user = session.get(User, user_id)
    if not user:
        user = User(id=user_id)
        session.add(user)
        session.commit()

    # 2. Check if profile already saved (avoid duplicates)
    existing = session.execute(
        select(SavedProfile).where(
            SavedProfile.user_id == user_id,
            SavedProfile.profile_id == profile_id
        )
    ).scalar_one_or_none()

    if existing:
        return {"ok": True}

    # 3. Save the profile
    saved = SavedProfile(
        user_id=user_id,
        profile_id=profile_id,
        created_at=datetime.utcnow()
    )

    session.add(saved)
    session.commit()

    return {"ok": True}


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
        try:
            session.add(
                SavedProfile(
                    id=_new_id(),
                    user_id=user_id,
                    profile_id=profile_id,
                    created_at=datetime.utcnow(),
                )
            )
            session.commit()
        except Exception:
            session.rollback()
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
    user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        try:
            session.add(
                Like(
                    id=_new_id(),
                    user_id=user_id,
                    profile_id=profile_id,
                    created_at=datetime.utcnow(),
                )
            )
            session.commit()
        except Exception:
            session.rollback()
    return {"ok": True}
