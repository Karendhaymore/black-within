import os
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
    Boolean,
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

# Render Postgres URLs can start with postgres://, but SQLAlchemy wants postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Force SQLAlchemy to use psycopg (v3)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

# Preview auth mode: returns devCode instead of actually emailing it
# (Turn off later when SendGrid/real email is wired)
PREVIEW_AUTH = os.getenv("PREVIEW_AUTH", "true").lower() in ("1", "true", "yes", "on")

AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "15"))

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# -----------------------------
# Database models
# -----------------------------
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # stable userId
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuthCode(Base):
    __tablename__ = "auth_codes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code: Mapped[str] = mapped_column(String(10))  # MVP: store plain 6-digit
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),
    )


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),
    )


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


class RequestCodeResponse(BaseModel):
    ok: bool
    devCode: str | None = None


class VerifyCodePayload(BaseModel):
    email: str
    code: str


class VerifyCodeResponse(BaseModel):
    ok: bool
    userId: str


# -----------------------------
# App
# -----------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"name": "Black Within API", "status": "ok", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok"}


# -----------------------------
# Helpers
# -----------------------------
def _normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e or "." not in e.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email.")
    return e


def _stable_user_id_from_email(email: str) -> str:
    # Stable across devices: same email -> same userId
    # (We can change strategy later, but this is perfect for MVP.)
    digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
    return f"u_{digest[:40]}"


def _ensure_user(user_id: str) -> str:
    user_id = (user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    with Session(engine) as session:
        existing = session.get(User, user_id)
        if existing:
            return user_id
        session.add(User(id=user_id))
        session.commit()
        return user_id


@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(..., description="Client-generated user id")):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


# -----------------------------
# Auth (Preview code login)
# -----------------------------
@app.post("/auth/request-code", response_model=RequestCodeResponse)
def request_code(payload: RequestCodePayload):
    email = _normalize_email(payload.email)

    # 6-digit code
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)

    with Session(engine) as session:
        # Invalidate old unused codes for this email (optional but clean)
        session.execute(
            delete(AuthCode).where(AuthCode.email == email)
        )
        session.add(
            AuthCode(
                email=email,
                code=code,
                expires_at=expires_at,
                used=False,
            )
        )
        session.commit()

    # For now: always return devCode in preview mode
    if PREVIEW_AUTH:
        return RequestCodeResponse(ok=True, devCode=code)

    # Later: send via SendGrid, and do NOT return code
    return RequestCodeResponse(ok=True, devCode=None)


@app.post("/auth/verify-code", response_model=VerifyCodeResponse)
def verify_code(payload: VerifyCodePayload):
    email = _normalize_email(payload.email)
    code = (payload.code or "").strip()

    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Enter the 6-digit code.")

    with Session(engine) as session:
        row = session.execute(
            select(AuthCode)
            .where(AuthCode.email == email)
            .order_by(AuthCode.created_at.desc())
        ).scalars().first()

        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired code.")

        if row.used:
            raise HTTPException(status_code=400, detail="Invalid or expired code.")

        if datetime.utcnow() > row.expires_at:
            raise HTTPException(status_code=400, detail="Invalid or expired code.")

        if row.code != code:
            raise HTTPException(status_code=400, detail="Invalid or expired code.")

        # Mark used
        row.used = True
        session.commit()

    user_id = _stable_user_id_from_email(email)
    _ensure_user(user_id)

    return VerifyCodeResponse(ok=True, userId=user_id)


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
        ids = [r[0] for r in rows]
        return IdListResponse(ids=ids)


@app.post("/saved")
def save_profile(payload: ProfileAction):
    user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        try:
            session.add(SavedProfile(user_id=user_id, profile_id=profile_id))
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
        ids = [r[0] for r in rows]
        return IdListResponse(ids=ids)


@app.post("/likes")
def like(payload: ProfileAction):
    user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        try:
            session.add(Like(user_id=user_id, profile_id=profile_id))
            session.commit()
        except Exception:
            session.rollback()
        return {"ok": True}
