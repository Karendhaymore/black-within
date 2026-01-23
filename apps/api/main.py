import os
from datetime import datetime
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

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

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


@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(..., description="Client-generated user id")):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


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
        # insert if not exists (UniqueConstraint prevents duplicates)
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
