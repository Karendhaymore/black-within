import os
import hmac
import hashlib
import random
from datetime import datetime, timedelta
from typing import List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
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

# Render sometimes uses postgres:// but SQLAlchemy expects postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Force SQLAlchemy to use psycopg (v3), not psycopg2
if DATABASE_URL.startswith("postgresql://") and "+psycopg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

AUTH_SECRET = os.getenv("AUTH_SECRET", "dev-secret-change-me")
AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "15"))
AUTH_SESSION_TTL_DAYS = int(os.getenv("AUTH_SESSION_TTL_DAYS", "30"))
AUTH_DEV_RETURN_CODE = os.getenv("AUTH_DEV_RETURN_CODE", "false").lower() == "true"

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# -----------------------------
# Database models
# -----------------------------
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # simple string id
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SavedProfile(Base):
    __tablename__ = "saved_profiles"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_saved_user_profile"),)


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


class AuthCode(Base):
    __tablename__ = "auth_codes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SessionToken(Base):
    __tablename__ = "session_tokens"
    token: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


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
    user_id: str
    email: EmailStr


class VerifyCodePayload(BaseModel):
    user_id: str
    email: EmailStr
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


@app.get("/")
def root():
    return {
        "name": "Black Within API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


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


def _hash_code(email: str, user_id: str, code: str) -> str:
    # stable hash so we never store raw codes in DB
    msg = f"{email.lower()}|{user_id}|{code}".encode("utf-8")
    key = AUTH_SECRET.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def _generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(..., description="Client-generated user id")):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


# -----------------------------
# Auth (email code login)
# -----------------------------
@app.post("/auth/request-code")
def request_code(payload: RequestCodePayload):
    user_id = _ensure_user(payload.user_id)
    email = payload.email.strip().lower()

    code = _generate_code()
    code_hash = _hash_code(email=email, user_id=user_id, code=code)
    expires_at = datetime.utcnow() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)

    with Session(engine) as session:
        session.add(
            AuthCode(
                email=email,
                user_id=user_id,
                code_hash=code_hash,
                expires_at=expires_at,
            )
        )
        session.commit()

    # Later: send via SendGrid here.
    # For now: optionally return code for testing if AUTH_DEV_RETURN_CODE=true
    resp = {"ok": True, "message": "Verification code sent."}
    if AUTH_DEV_RETURN_CODE:
        resp["dev_code"] = code
    return resp


@app.post("/auth/verify-code")
def verify_code(payload: VerifyCodePayload):
    user_id = _ensure_user(payload.user_id)
    email = payload.email.strip().lower()
    code = (payload.code or "").strip()

    if not code or len(code) < 4:
        raise HTTPException(status_code=400, detail="code is required")

    wanted_hash = _hash_code(email=email, user_id=user_id, code=code)

    with Session(engine) as session:
        row = session.execute(
            select(AuthCode)
            .where(
                AuthCode.email == email,
                AuthCode.user_id == user_id,
                AuthCode.consumed_at.is_(None),
                AuthCode.expires_at > datetime.utcnow(),
            )
            .order_by(AuthCode.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        if not row or row.code_hash != wanted_hash:
            raise HTTPException(status_code=401, detail="Invalid or expired code")

        row.consumed_at = datetime.utcnow()

        token = hashlib.sha256(f"{email}|{user_id}|{datetime.utcnow().isoformat()}|{AUTH_SECRET}".encode("utf-8")).hexdigest()[:64]
        session.add(
            SessionToken(
                token=token,
                user_id=user_id,
                email=email,
                expires_at=datetime.utcnow() + timedelta(days=AUTH_SESSION_TTL_DAYS),
            )
        )
        session.commit()

    return {"ok": True, "token": token, "user_id": user_id, "email": email}


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
        rows = session.execute(
            select(Like.profile_id).where(Like.user_id == user_id)
        ).all()
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


@app.delete("/likes")
def unlike(user_id: str = Query(...), profile_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    profile_id = profile_id.strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        session.execute(
            delete(Like).where(
                Like.user_id == user_id,
                Like.profile_id == profile_id,
            )
        )
        session.commit()
        return {"ok": True}
