import os
import random
import string
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import FastAPI, HTTPException, Query, Body
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
    # Render must have DATABASE_URL set in environment variables
    raise RuntimeError("DATABASE_URL is not set")

# Render Postgres URLs can start with postgres://, but SQLAlchemy wants postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Force SQLAlchemy to use psycopg (v3), not psycopg2
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

LOGIN_CODE_TTL_MINUTES = int(os.getenv("LOGIN_CODE_TTL_MINUTES", "15"))

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# -----------------------------
# Database models
# -----------------------------
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # user id
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class LoginCode(Base):
    __tablename__ = "login_codes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),)


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


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
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_6_digit_code() -> str:
    return "".join(random.choice(string.digits) for _ in range(6))


def _ensure_user(user_id: str) -> str:
    user_id = (user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    with Session(engine) as session:
        existing = session.get(User, user_id)
        if existing:
            return user_id
        # create if not exists
        session.add(User(id=user_id))
        session.commit()
        return user_id

@app.get("/")
def root():
    return {
        "name": "Black Within API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(..., description="Client-generated user id")):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


# -----------------------------
# Login (email code)
# -----------------------------
@app.post("/auth/request-code")
def request_code(payload: RequestCodePayload):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email.")

    code = _make_6_digit_code()
    expires_at = _utcnow() + timedelta(minutes=LOGIN_CODE_TTL_MINUTES)

    with Session(engine) as session:
        session.add(
            LoginCode(
                id=str(random.randint(10**8, 10**9 - 1)),  # simple id
                email=email,
                code=code,
                expires_at=expires_at,
            )
        )
        session.commit()

    # PREVIEW MODE:
    # We return the code so you can test login before email sending is added.
    return {
        "ok": True,
        "message": "Code created. Check your email (preview mode may show the code on-screen).",
        "devCode": code,
    }


@app.post("/auth/verify-code")
def verify_code(payload: VerifyCodePayload):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email.")
    if not code or len(code) != 6:
        raise HTTPException(status_code=400, detail="Please enter the 6-digit code.")

    with Session(engine) as session:
        # newest matching code
        row = (
            session.execute(
                select(LoginCode)
                .where(LoginCode.email == email, LoginCode.code == code)
                .order_by(LoginCode.created_at.desc())
            )
            .scalars()
            .first()
        )

        if not row:
            raise HTTPException(status_code=401, detail="That code is not correct.")
        if row.expires_at < _utcnow():
            raise HTTPException(status_code=401, detail="That code has expired. Please request a new one.")

        # Find or create user by email
        existing_user = (
            session.execute(select(User).where(User.email == email)).scalars().first()
        )

        if existing_user:
            return {"ok": True, "userId": existing_user.id}

        # Create new user id (simple random string)
        new_user_id = str(random.randint(10**10, 10**11 - 1))
        session.add(User(id=new_user_id, email=email))
        session.commit()
        return {"ok": True, "userId": new_user_id}


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
    profile_id = payload.profile_id.strip()
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
    profile_id = profile_id.strip()
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
    profile_id = payload.profile_id.strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        try:
            session.add(Like(user_id=user_id, profile_id=profile_id))
            session.commit()
        except Exception:
            session.rollback()
        return {"ok": True}
