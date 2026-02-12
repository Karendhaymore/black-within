import os
import re
import secrets
import hashlib
import hmac
import json
import base64
import shutil
import urllib.request
import urllib.error
from datetime import datetime, timedelta, date, time
from typing import List, Optional, Dict, Any, Tuple

import stripe
from fastapi import FastAPI, HTTPException, Query, Request, Header, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from sqlalchemy import (
    create_engine,
    String,
    DateTime,
    Date,
    UniqueConstraint,
    select,
    delete,
    Integer,
    Text,
    Boolean,
    text,
    or_,
    desc,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError

# SendGrid (still supported, optional)
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


# -----------------------------
# Config
# -----------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "https://black-within.onrender.com")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]

AUTH_CODE_TTL_MINUTES = int(os.getenv("AUTH_CODE_TTL_MINUTES", "15"))
AUTH_PREVIEW_MODE = os.getenv("AUTH_PREVIEW_MODE", "true").lower() in ("1", "true", "yes")
AUTH_USERID_PEPPER = os.getenv("AUTH_USERID_PEPPER", "")

AUTH_SECRET = os.getenv("AUTH_SECRET", "").strip()
PBKDF2_ITERS = int(os.getenv("PBKDF2_ITERS", "200000"))

NOTIFICATIONS_LIMIT = int(os.getenv("NOTIFICATIONS_LIMIT", "200"))
FREE_LIKES_PER_DAY = int(os.getenv("FREE_LIKES_PER_DAY", "5"))
LIKES_RESET_TEST_SECONDS = int(os.getenv("LIKES_RESET_TEST_SECONDS", "0") or "0")

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip()
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "").strip()
SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "Black Within").strip()

ADMIN_UNLOCK_KEY = os.getenv("ADMIN_UNLOCK_KEY", "").strip()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_MESSAGE_UNLOCK_PRICE_ID = os.getenv("STRIPE_MESSAGE_UNLOCK_PRICE_ID", "").strip()
STRIPE_PREMIUM_PRICE_ID = os.getenv("STRIPE_PREMIUM_PRICE_ID", "").strip()

APP_WEB_BASE_URL = os.getenv("APP_WEB_BASE_URL", "https://meetblackwithin.com").strip()

BASE_URL = (
    os.getenv("BASE_URL", "").strip()
    or os.getenv("API_BASE_URL", "").strip()
    or os.getenv("RENDER_EXTERNAL_URL", "").strip()
    or "https://black-within-api.onrender.com"
)

RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "30"))

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

UPLOAD_DIR = "/var/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _extract_uploaded_filename(photo_url: str) -> str:
    s = (photo_url or "").strip()
    if not s:
        return ""
    if "/photos/" not in s:
        return ""
    filename = s.split("/photos/")[-1].strip()
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        return ""
    return filename


# -----------------------------
# Database models
# -----------------------------
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuthAccount(Base):
    __tablename__ = "auth_accounts"
    user_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String(40), index=True)

    display_name: Mapped[str] = mapped_column(String(80))
    age: Mapped[int] = mapped_column(Integer)
    city: Mapped[str] = mapped_column(String(80))
    state_us: Mapped[str] = mapped_column(String(80))

    photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo2: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    identity_preview: Mapped[str] = mapped_column(String(500))
    intention: Mapped[str] = mapped_column(String(120))

    tags_csv: Mapped[str] = mapped_column(Text, default="[]")
    cultural_identity_csv: Mapped[str] = mapped_column(Text, default="[]")
    spiritual_framework_csv: Mapped[str] = mapped_column(Text, default="[]")

    relationship_intent: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    dating_challenge_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    personal_truth_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    banned_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    banned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

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
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(60), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "profile_id", name="uq_like_user_profile"),)


class DailyLikeCount(Base):
    __tablename__ = "daily_like_counts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    window_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_daily_like_user_day"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    type: Mapped[str] = mapped_column(String(20), default="like")
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    actor_user_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    profile_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    actor_profile_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


class LoginCode(Base):
    __tablename__ = "login_codes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True, unique=True)
    code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Thread(Base):
    __tablename__ = "threads"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    user_low: Mapped[str] = mapped_column(String(40), index=True)
    user_high: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    __table_args__ = (UniqueConstraint("user_low", "user_high", name="uq_threads_userpair"),)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(60), index=True)
    sender_user_id: Mapped[str] = mapped_column(String(40), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Entitlement(Base):
    __tablename__ = "messaging_entitlements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True, unique=True)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ThreadUnlock(Base):
    __tablename__ = "thread_unlocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(60), index=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("thread_id", "user_id", name="uq_thread_user_unlock"),)


class ThreadRead(Base):
    __tablename__ = "thread_reads"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    thread_id: Mapped[str] = mapped_column(String(60), index=True)
    last_read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    __table_args__ = (UniqueConstraint("user_id", "thread_id", name="uq_thread_reads_user_thread"),)


class AdminUser(Base):
    __tablename__ = "admin_users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="admin", index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AdminSession(Base):
    __tablename__ = "admin_sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    admin_user_id: Mapped[str] = mapped_column(String(40), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class UserReport(Base):
    __tablename__ = "user_reports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    reporter_user_id: Mapped[str] = mapped_column(String(40), index=True)
    reported_user_id: Mapped[str] = mapped_column(String(40), index=True)
    reported_profile_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    thread_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(160), index=True)
    details: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class UserClaimToken(Base):
    __tablename__ = "user_claim_tokens"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    profile_id: Mapped[str] = mapped_column(String(40), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


# -----------------------------
# Migrations
# -----------------------------
def _auto_migrate_threads_messages_tables():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS threads (
              id VARCHAR(60) PRIMARY KEY,
              user_low VARCHAR(40),
              user_high VARCHAR(40),
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW(),
              CONSTRAINT uq_threads_userpair UNIQUE (user_low, user_high)
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_threads_user_low ON threads(user_low);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_threads_user_high ON threads(user_high);"))

        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS messages (
              id SERIAL PRIMARY KEY,
              thread_id VARCHAR(60),
              sender_user_id VARCHAR(40),
              body TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_thread_id ON messages(thread_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_sender_user_id ON messages(sender_user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages(created_at);"))

        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS messaging_entitlements (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR(40) UNIQUE,
              is_premium BOOLEAN DEFAULT FALSE,
              updated_at TIMESTAMP DEFAULT NOW()
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messaging_entitlements_user_id ON messaging_entitlements(user_id);"))

        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS thread_unlocks (
              id SERIAL PRIMARY KEY,
              thread_id VARCHAR(60),
              user_id VARCHAR(40),
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW(),
              CONSTRAINT uq_thread_user_unlock UNIQUE (thread_id, user_id)
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_thread_unlocks_thread_id ON thread_unlocks(thread_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_thread_unlocks_user_id ON thread_unlocks(user_id);"))
        conn.execute(text("ALTER TABLE thread_unlocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();"))


def _auto_migrate_thread_reads_table():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS thread_reads (
              id VARCHAR(40) PRIMARY KEY,
              user_id VARCHAR(40),
              thread_id VARCHAR(60),
              last_read_at TIMESTAMP NULL,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW(),
              CONSTRAINT uq_thread_reads_user_thread UNIQUE (user_id, thread_id)
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_thread_reads_user_id ON thread_reads(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_thread_reads_thread_id ON thread_reads(thread_id);"))
        conn.execute(text("ALTER TABLE thread_reads ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP NULL;"))
        conn.execute(text("ALTER TABLE thread_reads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();"))
        conn.execute(text("ALTER TABLE thread_reads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();"))

        conn.execute(
            text(
                """
            DO $$
            DECLARE
              id_type TEXT;
              has_old_serial BOOLEAN := FALSE;
            BEGIN
              SELECT data_type INTO id_type
              FROM information_schema.columns
              WHERE table_name='thread_reads' AND column_name='id'
              LIMIT 1;

              IF id_type IS NOT NULL AND id_type <> 'character varying' THEN
                has_old_serial := TRUE;
              END IF;

              IF has_old_serial THEN
                EXECUTE '
                  CREATE TABLE IF NOT EXISTS thread_reads__new (
                    id VARCHAR(40) PRIMARY KEY,
                    user_id VARCHAR(40),
                    thread_id VARCHAR(60),
                    last_read_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_thread_reads_user_thread UNIQUE (user_id, thread_id)
                  );
                ';

                EXECUTE '
                  INSERT INTO thread_reads__new (id, user_id, thread_id, last_read_at, created_at, updated_at)
                  SELECT
                    substring(md5(random()::text || clock_timestamp()::text), 1, 40) as id,
                    COALESCE(user_id::text, '''') as user_id,
                    COALESCE(thread_id::text, '''') as thread_id,
                    last_read_at,
                    COALESCE(created_at, NOW()) as created_at,
                    COALESCE(updated_at, NOW()) as updated_at
                  FROM thread_reads
                  ON CONFLICT (user_id, thread_id)
                  DO UPDATE SET
                    last_read_at = EXCLUDED.last_read_at,
                    updated_at = EXCLUDED.updated_at;
                ';

                EXECUTE 'DROP TABLE thread_reads;';
                EXECUTE 'ALTER TABLE thread_reads__new RENAME TO thread_reads;';
                EXECUTE 'CREATE INDEX IF NOT EXISTS ix_thread_reads_user_id ON thread_reads(user_id);';
                EXECUTE 'CREATE INDEX IF NOT EXISTS ix_thread_reads_thread_id ON thread_reads(thread_id);';
              END IF;
            END $$;
        """
            )
        )


def _auto_migrate_profiles_table():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(40);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(80);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city VARCHAR(80);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_us VARCHAR(80);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo TEXT;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo2 TEXT;"))

        conn.execute(
            text(
                """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='profiles' AND column_name='photo'
              ) THEN
                BEGIN
                  ALTER TABLE profiles ALTER COLUMN photo TYPE TEXT;
                EXCEPTION WHEN others THEN
                END;
              END IF;

              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='profiles' AND column_name='photo2'
              ) THEN
                BEGIN
                  ALTER TABLE profiles ALTER COLUMN photo2 TYPE TEXT;
                EXCEPTION WHEN others THEN
                END;
              END IF;
            END $$;
        """
            )
        )

        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_preview VARCHAR(500);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS intention VARCHAR(120);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tags_csv TEXT DEFAULT '[]';"))

        conn.execute(
            text(
                """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='profiles' AND column_name='tags_json'
              )
              THEN
                UPDATE profiles
                SET tags_csv = COALESCE(tags_csv, tags_json, '[]')
                WHERE tags_csv IS NULL OR tags_csv = '';
              END IF;
            END $$;
        """
            )
        )

        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cultural_identity_csv TEXT DEFAULT '[]';"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spiritual_framework_csv TEXT DEFAULT '[]';"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS relationship_intent VARCHAR(120);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dating_challenge_text TEXT;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_truth_text TEXT;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();"))
        conn.execute(text("UPDATE profiles SET is_available = TRUE WHERE is_available IS NULL;"))


def _auto_migrate_notifications_table():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(40);"))
        conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS profile_id VARCHAR(60);"))
        conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_profile_id VARCHAR(60);"))


def _auto_migrate_auth_accounts_table():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS auth_accounts (
              user_id VARCHAR(40) PRIMARY KEY,
              email VARCHAR(320) UNIQUE,
              password_hash VARCHAR(500),
              created_at TIMESTAMP DEFAULT NOW()
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_auth_accounts_email ON auth_accounts(email);"))


def _auto_migrate_daily_like_counts_table():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS daily_like_counts (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR(40),
              day DATE,
              count INTEGER DEFAULT 0,
              updated_at TIMESTAMP DEFAULT NOW(),
              window_started_at TIMESTAMP NULL,
              CONSTRAINT uq_daily_like_user_day UNIQUE (user_id, day)
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_like_counts_user_id ON daily_like_counts(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_like_counts_day ON daily_like_counts(day);"))
        conn.execute(text("ALTER TABLE daily_like_counts ADD COLUMN IF NOT EXISTS window_started_at TIMESTAMP NULL;"))


def _auto_migrate_password_reset_tokens_table():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
              id SERIAL PRIMARY KEY,
              token_hash VARCHAR(64) UNIQUE,
              user_id VARCHAR(40),
              email VARCHAR(320),
              created_at TIMESTAMP DEFAULT NOW(),
              expires_at TIMESTAMP,
              used_at TIMESTAMP NULL
            );
        """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_token_hash ON password_reset_tokens(token_hash);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_user_id ON password_reset_tokens(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_email ON password_reset_tokens(email);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prt_expires_at ON password_reset_tokens(expires_at);"))


def _auto_migrate_admin_tables():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS admin_users (
              id VARCHAR(40) PRIMARY KEY,
              email VARCHAR(255) UNIQUE,
              password_hash VARCHAR(255),
              role VARCHAR(30),
              is_enabled BOOLEAN DEFAULT TRUE,
              created_at TIMESTAMP,
              updated_at TIMESTAMP
            );
        """
            )
        )
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS admin_sessions (
              id VARCHAR(40) PRIMARY KEY,
              admin_user_id VARCHAR(40),
              token_hash VARCHAR(128) UNIQUE,
              expires_at TIMESTAMP,
              created_at TIMESTAMP
            );
        """
            )
        )
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS user_reports (
              id VARCHAR(40) PRIMARY KEY,
              reporter_user_id VARCHAR(40),
              reported_user_id VARCHAR(40),
              reported_profile_id VARCHAR(40),
              thread_id VARCHAR(60),
              reason VARCHAR(160),
              details VARCHAR(2000),
              status VARCHAR(30),
              created_at TIMESTAMP,
              updated_at TIMESTAMP
            );
        """
            )
        )
        conn.execute(
            text(
                """
            CREATE TABLE IF NOT EXISTS user_claim_tokens (
              id VARCHAR(40) PRIMARY KEY,
              token_hash VARCHAR(128) UNIQUE,
              user_id VARCHAR(40),
              profile_id VARCHAR(40),
              expires_at TIMESTAMP,
              claimed_at TIMESTAMP,
              created_at TIMESTAMP
            );
        """
            )
        )

        # Ensure status exists + has a usable default
        conn.execute(text("ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS status VARCHAR(30);"))
        conn.execute(text("UPDATE user_reports SET status = 'open' WHERE status IS NULL OR status = '';"))

        # Optional: index if not present (helps alerts query)
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_reports_status ON user_reports(status);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_reports_created_at ON user_reports(created_at);"))


def _auto_migrate_profiles_ban_fields():
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_reason VARCHAR(300);"))
        conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP;"))
        conn.execute(text("UPDATE profiles SET is_banned = FALSE WHERE is_banned IS NULL;"))


Base.metadata.create_all(engine)

for fn, label in [
    (_auto_migrate_threads_messages_tables, "AUTO_MIGRATE_THREADS_MESSAGES"),
    (_auto_migrate_thread_reads_table, "AUTO_MIGRATE_THREAD_READS"),
    (_auto_migrate_profiles_table, "AUTO_MIGRATE_PROFILES"),
    (_auto_migrate_profiles_ban_fields, "AUTO_MIGRATE_PROFILES_BAN"),
    (_auto_migrate_notifications_table, "AUTO_MIGRATE_NOTIFICATIONS"),
    (_auto_migrate_auth_accounts_table, "AUTO_MIGRATE_AUTH_ACCOUNTS"),
    (_auto_migrate_daily_like_counts_table, "AUTO_MIGRATE_DAILY_LIKES"),
    (_auto_migrate_password_reset_tokens_table, "AUTO_MIGRATE_PASSWORD_RESET"),
    (_auto_migrate_admin_tables, "AUTO_MIGRATE_ADMIN_TABLES"),
]:
    try:
        fn()
    except Exception as e:
        print(f"{label} failed:", str(e))


        conn.execute(text("ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';"))
        conn.execute(text("ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at TEXT;"))


# -----------------------------
# Schemas
# -----------------------------
class MeResponse(BaseModel):
    user_id: str


class ProfileAction(BaseModel):
    user_id: str
    profile_id: str


class DeletePhotoRequest(BaseModel):
    user_id: str
    photo_url: str


class IdListResponse(BaseModel):
    ids: List[str]


class RequestCodePayload(BaseModel):
    email: str


class VerifyCodePayload(BaseModel):
    email: str
    code: str


class SignupPayload(BaseModel):
    email: str
    password: str


class LoginPayload(BaseModel):
    email: str
    password: str


class ForgotPasswordPayload(BaseModel):
    email: str


class ResetPasswordPayload(BaseModel):
    token: str
    password: str


class NotificationItem(BaseModel):
    id: str
    user_id: str
    type: str
    message: str
    created_at: str
    actor_user_id: Optional[str] = None
    actor_profile_id: Optional[str] = None
    actor_display_name: Optional[str] = None
    actor_photo: Optional[str] = None
    profile_id: Optional[str] = None


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
    photo2: Optional[str] = None
    identityPreview: str
    intention: str
    tags: List[str]
    isAvailable: bool
    culturalIdentity: List[str] = []
    spiritualFramework: List[str] = []
    relationshipIntent: Optional[str] = None
    datingChallenge: Optional[str] = None
    personalTruth: Optional[str] = None


class ProfilesResponse(BaseModel):
    items: List[ProfileItem]


class ProfilesListResponse(BaseModel):
    items: List[ProfileItem]


class LikesStatusResponse(BaseModel):
    likesLeft: int
    limit: int
    windowType: str
    resetsAtUTC: str


class ThreadGetOrCreatePayload(BaseModel):
    user_id: str
    with_profile_id: str


class ThreadItem(BaseModel):
    threadId: str
    with_user_id: str
    with_profile_id: Optional[str] = None
    with_display_name: Optional[str] = None
    with_photo: Optional[str] = None
    last_message: Optional[str] = None
    last_message_at: Optional[str] = None


class ProfileLiteResponse(BaseModel):
    profile_id: str
    display_name: str
    photo: Optional[str] = None


class ThreadsInboxResponse(BaseModel):
    items: List[ThreadItem]


class ThreadListItem(BaseModel):
    thread_id: str
    other_user_id: str
    other_profile_id: Optional[str] = None
    other_display_name: Optional[str] = None
    other_photo: Optional[str] = None
    last_message_text: Optional[str] = None
    last_message_at: Optional[str] = None
    updated_at: Optional[str] = None
    unread_count: int = 0


class ThreadsResponse(BaseModel):
    items: List[ThreadListItem]


class MessageCreatePayload(BaseModel):
    user_id: str
    thread_id: str
    body: str


class MessageItem(BaseModel):
    id: int
    thread_id: str
    sender_user_id: str
    body: str
    created_at: str


class MessagesResponse(BaseModel):
    items: List[MessageItem]
    otherLastReadAt: Optional[str] = None


class MessagingAccessResponse(BaseModel):
    canMessage: bool
    isPremium: bool
    unlockedUntilUTC: Optional[str] = None
    reason: Optional[str] = None


class MessagingUnlockPayload(BaseModel):
    user_id: str
    thread_id: Optional[str] = None
    minutes: int = 1440
    make_premium: bool = False


class ThreadUnlockCheckoutPayload(BaseModel):
    user_id: str
    thread_id: str


class PremiumCheckoutPayload(BaseModel):
    user_id: str


class CheckoutSessionResponse(BaseModel):
    url: str


class CreateUnlockSessionPayload(BaseModel):
    user_id: str
    target_profile_id: str
    thread_id: str


class UpsertMyProfilePayload(BaseModel):
    owner_user_id: str
    displayName: Optional[str] = None
    stateUS: Optional[str] = None
    identityPreview: Optional[str] = None
    isAvailable: Optional[bool] = True

    display_name: Optional[str] = None
    state_us: Optional[str] = None
    identity_preview: Optional[str] = None
    is_available: Optional[bool] = None

    age: int
    city: str
    photo: Optional[str] = None
    photo2: Optional[str] = None

    intention: str
    tags: List[str] = []

    culturalIdentity: Optional[List[str]] = None
    spiritualFramework: Optional[List[str]] = None
    relationshipIntent: Optional[str] = None
    datingChallenge: Optional[str] = None
    personalTruth: Optional[str] = None

    cultural_identity: Optional[List[str]] = None
    spiritual_framework: Optional[List[str]] = None
    relationship_intent: Optional[str] = None
    dating_challenge_text: Optional[str] = None
    personal_truth_text: Optional[str] = None


class AdminLoginIn(BaseModel):
    email: str
    password: str


class AdminLoginOut(BaseModel):
    token: str
    role: str
    email: str


class AdminMeOut(BaseModel):
    email: str
    role: str


class AdminProfileRow(BaseModel):
    profile_id: str
    owner_user_id: str
    displayName: str
    age: int
    city: str
    stateUS: str
    photo: Optional[str] = None
    photo2: Optional[str] = None
    isAvailable: bool
    is_banned: bool = False
    banned_reason: Optional[str] = None
    likes_count: int = 0
    saved_count: int = 0


class AdminProfilesOut(BaseModel):
    items: List[AdminProfileRow]


class AdminPatchProfileIn(BaseModel):
    isAvailable: Optional[bool] = None
    is_banned: Optional[bool] = None
    banned_reason: Optional[str] = None


class AdminClearPhotoIn(BaseModel):
    slot: int


class ReportIn(BaseModel):
    reporter_user_id: str
    reported_user_id: str
    reported_profile_id: Optional[str] = None
    thread_id: Optional[str] = None
    reason: str
    details: Optional[str] = None


class ReportOut(BaseModel):
    id: str
    status: str


class AdminReportRow(BaseModel):
    id: str
    reporter_user_id: str
    reported_user_id: str
    reported_profile_id: Optional[str] = None
    thread_id: Optional[str] = None
    reason: str
    details: Optional[str] = None
    status: str
    created_at: str


class AdminReportsOut(BaseModel):
    items: List[AdminReportRow]


class AdminPatchReportIn(BaseModel):
    status: str

class AdminCreateFreeUserRequest(BaseModel):
    email: str
    displayName: str
    
class AdminCreateUserIn(BaseModel):
    displayName: Optional[str] = None
    city: Optional[str] = None
    stateUS: Optional[str] = None


class AdminCreateUserOut(BaseModel):
    user_id: str
    profile_id: str
    claim_token: str


class ClaimIn(BaseModel):
    token: str


class ClaimOut(BaseModel):
    user_id: str
    profile_id: str


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Black Within API", version="1.1.5")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
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


# ✅ renamed to avoid collision with new list-based SendGrid helper below
def _send_email_sendgrid_one(to_email: str, subject: str, html: str) -> None:
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

    if resp.status_code not in (200, 202):
        raise RuntimeError(f"SendGrid send failed: {resp.status_code} {resp.body}")


def _parse_json_list(s: Optional[str]) -> List[str]:
    try:
        v = json.loads(s or "[]")
        if not isinstance(v, list):
            return []
        out: List[str] = []
        for item in v:
            if isinstance(item, str):
                t = item.strip()
                if t:
                    out.append(t)
        return out
    except Exception:
        return []


def _coerce_str_list(v: Any) -> List[str]:
    if not isinstance(v, list):
        return []
    out: List[str] = []
    for item in v:
        if isinstance(item, str):
            t = item.strip()
            if t:
                out.append(t)
    return out


# -----------------------------
# ✅ NEW: Email alerts for reports (SendGrid HTTP API + BackgroundTasks)
# -----------------------------
def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or "").strip().lower()
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    return default


def _send_email_sendgrid(to_emails: List[str], subject: str, html: str) -> None:
    api_key = (os.getenv("SENDGRID_API_KEY") or "").strip()
    from_email = (os.getenv("ALERT_FROM_EMAIL") or "").strip()

    if not api_key or not from_email or not to_emails:
        return

    payload = {
        "personalizations": [{"to": [{"email": e} for e in to_emails]}],
        "from": {"email": from_email},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            _ = resp.read()
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        print("SendGrid email failed:", e.code, body)
    except Exception as e:
        print("SendGrid email error:", str(e))


def _parse_alert_to_emails() -> List[str]:
    raw = (os.getenv("ALERT_TO_EMAILS") or "").strip()
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(",")]
    return [p for p in parts if p]


def _notify_admins_new_report(report_row: Any) -> None:
    if not _env_bool("ALERT_REPORTS_ENABLED", True):
        return

    to_emails = _parse_alert_to_emails()
    if not to_emails:
        return

    rid = getattr(report_row, "id", "")
    reporter = getattr(report_row, "reporter_user_id", "") or getattr(report_row, "user_id", "")
    reported_profile_id = getattr(report_row, "reported_profile_id", "") or getattr(report_row, "profile_id", "")
    reported_user_id = getattr(report_row, "reported_user_id", "")

    reason = getattr(report_row, "reason", "") or ""
    details = getattr(report_row, "details", "") or getattr(report_row, "message", "") or ""

    subject = f"[Black Within] New user report ({reason or 'reported'})"
    admin_url = "https://meetblackwithin.com/admin"

    html = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2 style="margin: 0 0 8px;">New Report Submitted</h2>
      <p style="margin: 0 0 12px;">A user has submitted a report in Black Within.</p>

      <table cellpadding="6" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr><td><b>Report ID</b></td><td>{rid}</td></tr>
        <tr><td><b>Reporter user_id</b></td><td>{reporter}</td></tr>
        <tr><td><b>Reported profile_id</b></td><td>{reported_profile_id}</td></tr>
        <tr><td><b>Reported user_id</b></td><td>{reported_user_id}</td></tr>
        <tr><td><b>Reason</b></td><td>{reason}</td></tr>
      </table>

      <p style="margin: 12px 0 0;"><b>Details</b></p>
      <pre style="background:#f7f7f7; padding:10px; border-radius:8px; white-space:pre-wrap;">{details}</pre>

      <p style="margin-top: 14px;">
        Open Admin Dashboard: <a href="{admin_url}">{admin_url}</a>
      </p>
    </div>
    """

    _send_email_sendgrid(to_emails, subject, html)


# -----------------------------
# Password hashing (USER AUTH)
# -----------------------------
def _hash_password(password: str) -> str:
    password = (password or "").strip()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if not AUTH_SECRET:
        raise HTTPException(status_code=500, detail="Server auth is not configured (AUTH_SECRET missing).")

    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS)
    return "pbkdf2$%d$%s$%s" % (
        PBKDF2_ITERS,
        base64.urlsafe_b64encode(salt).decode("utf-8"),
        base64.urlsafe_b64encode(dk).decode("utf-8"),
    )


def _verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_str, salt_b64, dk_b64 = stored.split("$", 3)
        if algo != "pbkdf2":
            return False
        iters = int(iters_str)
        salt = base64.urlsafe_b64decode(salt_b64.encode("utf-8"))
        expected = base64.urlsafe_b64decode(dk_b64.encode("utf-8"))
        got = hashlib.pbkdf2_hmac("sha256", (password or "").encode("utf-8"), salt, iters)
        return hmac.compare_digest(got, expected)
    except Exception:
        return False


def _sha256_hex(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _make_reset_token() -> str:
    return secrets.token_urlsafe(32)


def _utc_midnight_of_day(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _next_utc_midnight(now_utc: datetime) -> datetime:
    tomorrow = now_utc.date() + timedelta(days=1)
    return _utc_midnight_of_day(tomorrow)


def _get_or_create_daily_like_counter(session: Session, user_id: str, day: date) -> DailyLikeCount:
    row = session.execute(
        select(DailyLikeCount).where(DailyLikeCount.user_id == user_id, DailyLikeCount.day == day)
    ).scalar_one_or_none()
    if row:
        return row
    row = DailyLikeCount(user_id=user_id, day=day, count=0, updated_at=datetime.utcnow(), window_started_at=None)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        row = session.execute(
            select(DailyLikeCount).where(DailyLikeCount.user_id == user_id, DailyLikeCount.day == day)
        ).scalar_one()
        return row
    return row


def _get_likes_window(session: Session, user_id: str) -> Tuple[DailyLikeCount, int, datetime, str]:
    now = datetime.utcnow()

    if LIKES_RESET_TEST_SECONDS and LIKES_RESET_TEST_SECONDS > 0:
        today = now.date()
        counter = _get_or_create_daily_like_counter(session, user_id, today)

        if not counter.window_started_at:
            counter.window_started_at = now
            counter.updated_at = now
            session.commit()

        reset_at = counter.window_started_at + timedelta(seconds=LIKES_RESET_TEST_SECONDS)

        if now >= reset_at:
            counter.count = 0
            counter.window_started_at = now
            counter.updated_at = now
            session.commit()
            reset_at = counter.window_started_at + timedelta(seconds=LIKES_RESET_TEST_SECONDS)

        likes_left = max(0, FREE_LIKES_PER_DAY - int(counter.count))
        return counter, likes_left, reset_at, "test_seconds"

    today = now.date()
    counter = _get_or_create_daily_like_counter(session, user_id, today)
    reset_at = _next_utc_midnight(now)
    likes_left = max(0, FREE_LIKES_PER_DAY - int(counter.count))
    return counter, likes_left, reset_at, "daily_utc"


# -----------------------------
# Admin security helpers
# -----------------------------
ADMIN_SECRET = (os.getenv("ADMIN_SECRET") or os.getenv("SECRET_KEY") or "dev-admin-secret").encode("utf-8")


def _norm_email(x: str) -> str:
    return (x or "").strip().lower()


def _hash_token(token: str) -> str:
    return hmac.new(ADMIN_SECRET, token.encode("utf-8"), hashlib.sha256).hexdigest()


def _admin_hash_password(password: str, salt_hex: Optional[str] = None) -> str:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"pbkdf2_sha256${salt.hex()}${dk.hex()}"


def _admin_verify_password(password: str, stored: str) -> bool:
    try:
        kind, salt_hex, dk_hex = stored.split("$", 2)
        if kind != "pbkdf2_sha256":
            return False
        check = _admin_hash_password(password, salt_hex=salt_hex)
        return hmac.compare_digest(check, stored)
    except Exception:
        return False


def _admin_bootstrap_if_needed():
    email = _norm_email(os.getenv("ADMIN_BOOTSTRAP_EMAIL") or "")
    pw = os.getenv("ADMIN_BOOTSTRAP_PASSWORD") or ""
    if not email or not pw:
        return

    with Session(engine) as session:
        existing = session.execute(select(AdminUser).where(AdminUser.email == email)).scalar_one_or_none()
        if existing:
            return

        u = AdminUser(
            id=secrets.token_hex(20),
            email=email,
            password_hash=_admin_hash_password(pw),
            role="admin",
            is_enabled=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(u)
        session.commit()


def _get_admin_token(x_admin_token: Optional[str], authorization: Optional[str]) -> str:
    t = (x_admin_token or "").strip()
    if t:
        return t
    a = (authorization or "").strip()
    if a.lower().startswith("bearer "):
        return a.split(" ", 1)[1].strip()
    return ""


require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=[...])
    authorization: Optional[str],
    x_admin_token: Optional[str] = None,
    allowed_roles: Optional[List[str]] = None
) -> AdminUser:
    token = _get_admin_token(x_admin_token, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing admin auth token.")

    th = _hash_token(token)
    now = datetime.utcnow()

    with Session(engine) as session:
        s = session.execute(select(AdminSession).where(AdminSession.token_hash == th)).scalar_one_or_none()
        if not s or s.expires_at <= now:
            raise HTTPException(status_code=401, detail="Admin session expired.")

        au = session.execute(select(AdminUser).where(AdminUser.id == s.admin_user_id)).scalar_one_or_none()
        if not au or not au.is_enabled:
            raise HTTPException(status_code=403, detail="Admin disabled.")

        if allowed_roles and au.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient admin role.")

        return au

    if not token:
        raise HTTPException(status_code=401, detail="Missing admin auth token.")

    th = _hash_token(token)
    now = datetime.utcnow()

    with Session(engine) as session:
        s = session.execute(select(AdminSession).where(AdminSession.token_hash == th)).scalar_one_or_none()
        if not s or s.expires_at <= now:
            raise HTTPException(status_code=401, detail="Admin session expired.")

        au = session.execute(select(AdminUser).where(AdminUser.id == s.admin_user_id)).scalar_one_or_none()
        if not au or not au.is_enabled:
            raise HTTPException(status_code=403, detail="Admin disabled.")

        if allowed_roles and au.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient admin role.")

        return au


try:
    _admin_bootstrap_if_needed()
except Exception as e:
    print("ADMIN_BOOTSTRAP failed:", str(e))


@app.get("/")
def root():
    return {"status": "ok", "service": "black-within-api"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "previewMode": AUTH_PREVIEW_MODE,
        "sendgridConfigured": bool(SENDGRID_API_KEY and SENDGRID_FROM_EMAIL),
        "passwordAuthConfigured": bool(AUTH_SECRET),
        "stripeConfigured": bool(STRIPE_SECRET_KEY),
        "stripeWebhookConfigured": bool(STRIPE_WEBHOOK_SECRET),
        "threadUnlockPriceConfigured": bool(STRIPE_MESSAGE_UNLOCK_PRICE_ID),
        "premiumPriceConfigured": bool(STRIPE_PREMIUM_PRICE_ID),
        "appWebBaseUrl": APP_WEB_BASE_URL,
        "freeLikesPerDay": FREE_LIKES_PER_DAY,
        "likesResetTestSeconds": LIKES_RESET_TEST_SECONDS,
        "corsOrigins": origins,
        "version": "1.1.5",
    }


@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


@app.post("/auth/signup")
def signup(payload: SignupPayload):
    email = _normalize_email(payload.email)
    password = payload.password or ""

    user_id = _make_user_id_from_email(email)
    pwd_hash = _hash_password(password)

    with Session(engine) as session:
        existing = session.execute(select(AuthAccount).where(AuthAccount.email == email)).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="An account with that email already exists. Please log in.")

        session.add(AuthAccount(user_id=user_id, email=email, password_hash=pwd_hash))
        session.commit()

    _ensure_user(user_id)
    return {"ok": True, "userId": user_id, "email": email}


@app.post("/auth/login")
def login(payload: LoginPayload):
    email = _normalize_email(payload.email)
    password = payload.password or ""

    with Session(engine) as session:
        acct = session.execute(select(AuthAccount).where(AuthAccount.email == email)).scalar_one_or_none()
        if not acct:
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        if not _verify_password(password, acct.password_hash):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    _ensure_user(acct.user_id)
    return {"ok": True, "userId": acct.user_id, "user_id": acct.user_id, "email": email}


@app.post("/auth/forgot-password")
def forgot_password(payload: ForgotPasswordPayload):
    email = _normalize_email(payload.email)

    with Session(engine) as session:
        acct = session.execute(select(AuthAccount).where(AuthAccount.email == email)).scalar_one_or_none()
        if not acct:
            return {"ok": True}

        token = _make_reset_token()
        token_hash = _sha256_hex(token)
        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)

        session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == acct.user_id))
        session.add(
            PasswordResetToken(
                token_hash=token_hash,
                user_id=acct.user_id,
                email=email,
                created_at=now,
                expires_at=expires_at,
                used_at=None,
            )
        )
        session.commit()

    reset_link = f"{APP_WEB_BASE_URL}/auth/reset?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;font-size:16px;color:#111;line-height:1.5">
      <p>We received a request to reset your Black Within password.</p>
      <p>
        <a href="{reset_link}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#0a5;color:#fff;text-decoration:none;font-weight:700">
          Reset Password
        </a>
      </p>
      <p>This link expires in {RESET_TOKEN_TTL_MINUTES} minutes.</p>
      <p style="color:#555;font-size:13px">If you didn’t request this, you can ignore this email.</p>
    </div>
    """

    try:
        _send_email_sendgrid_one(email, "Reset your Black Within password", html)
    except Exception as e:
        print("Forgot password send error:", str(e))

    return {"ok": True}


@app.post("/auth/reset-password")
def reset_password(payload: ResetPasswordPayload):
    token = (payload.token or "").strip()
    new_password = (payload.password or "").strip()

    if not token:
        raise HTTPException(status_code=400, detail="Reset token is required.")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    token_hash = _sha256_hex(token)
    now = datetime.utcnow()

    with Session(engine) as session:
        row = session.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=400, detail="This reset link is invalid or expired.")
        if row.used_at is not None:
            raise HTTPException(status_code=400, detail="This reset link has already been used.")
        if now > row.expires_at:
            raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")

        acct = session.get(AuthAccount, row.user_id)
        if not acct:
            raise HTTPException(status_code=400, detail="Account not found.")

        acct.password_hash = _hash_password(new_password)
        row.used_at = now
        session.commit()

    return {"ok": True}


@app.post("/auth/request-code")
def request_code(payload: RequestCodePayload):
    email = _normalize_email(payload.email)

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)
    now = datetime.utcnow()

    with Session(engine) as session:
        session.execute(delete(LoginCode).where(LoginCode.email == email))
        session.add(LoginCode(id=_new_id(), email=email, code=code, expires_at=expires_at, created_at=now))
        session.commit()

    if AUTH_PREVIEW_MODE:
        return {"ok": True, "devCode": code, "sent": False, "previewMode": True}

    try:
        _send_email_sendgrid_one(
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


@app.post("/auth/claim", response_model=ClaimOut)
def claim_user(body: ClaimIn):
    tok = (body.token or "").strip()
    if not tok:
        raise HTTPException(status_code=400, detail="Missing token.")

    th = _hash_token(tok)
    now = datetime.utcnow()

    with Session(engine) as session:
        ct = session.execute(select(UserClaimToken).where(UserClaimToken.token_hash == th)).scalar_one_or_none()
        if not ct:
            raise HTTPException(status_code=404, detail="Invalid token.")
        if ct.claimed_at is not None:
            raise HTTPException(status_code=400, detail="Token already used.")
        if ct.expires_at <= now:
            raise HTTPException(status_code=400, detail="Token expired.")

        ct.claimed_at = now
        session.add(ct)
        session.commit()

        try:
            _ensure_user(ct.user_id)
        except Exception:
            pass

        return ClaimOut(user_id=ct.user_id, profile_id=ct.profile_id)


@app.get("/likes/status", response_model=LikesStatusResponse)
def likes_status(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        counter, likes_left, reset_at, window_type = _get_likes_window(session, user_id)
        return LikesStatusResponse(likesLeft=likes_left, limit=FREE_LIKES_PER_DAY, windowType=window_type, resetsAtUTC=reset_at.isoformat())


@app.get("/profiles/{profile_id}", response_model=ProfileItem)
def get_profile(profile_id: str):
    profile_id = (profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        p = session.get(Profile, profile_id)
        if not p:
            raise HTTPException(status_code=404, detail="Profile not found")

        tags = _parse_json_list(p.tags_csv)
        cultural = _parse_json_list(getattr(p, "cultural_identity_csv", "[]"))
        spiritual = _parse_json_list(getattr(p, "spiritual_framework_csv", "[]"))

        return ProfileItem(
            id=p.id,
            owner_user_id=p.owner_user_id,
            displayName=p.display_name,
            age=p.age,
            city=p.city,
            stateUS=p.state_us,
            photo=p.photo,
            photo2=getattr(p, "photo2", None),
            identityPreview=p.identity_preview,
            intention=p.intention,
            tags=tags,
            isAvailable=bool(p.is_available),
            culturalIdentity=cultural,
            spiritualFramework=spiritual,
            relationshipIntent=getattr(p, "relationship_intent", None),
            datingChallenge=getattr(p, "dating_challenge_text", None),
            personalTruth=getattr(p, "personal_truth_text", None),
        )


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


def _coerce_alignment_fields(payload: UpsertMyProfilePayload):
    cultural = payload.culturalIdentity if payload.culturalIdentity is not None else payload.cultural_identity
    spiritual = payload.spiritualFramework if payload.spiritualFramework is not None else payload.spiritual_framework

    cultural_list = _coerce_str_list(cultural)[:50]
    spiritual_list = _coerce_str_list(spiritual)[:50]

    rel_intent = (payload.relationshipIntent or payload.relationship_intent or "").strip() or None

    dating_challenge = payload.datingChallenge if payload.datingChallenge is not None else payload.dating_challenge_text
    personal_truth = payload.personalTruth if payload.personalTruth is not None else payload.personal_truth_text

    dating_challenge = (dating_challenge or "").strip() or None
    personal_truth = (personal_truth or "").strip() or None

    return cultural_list, spiritual_list, rel_intent, dating_challenge, personal_truth


@app.get("/profiles", response_model=ProfilesResponse)
def list_profiles(exclude_owner_user_id: Optional[str] = Query(default=None), limit: int = Query(default=50, ge=1, le=200)):
    with Session(engine) as session:
        q = (
            select(Profile)
            .where(Profile.is_available == True)
            .where(or_(Profile.is_banned == False, Profile.is_banned.is_(None)))
            .order_by(Profile.updated_at.desc())
            .limit(limit)
        )
        if exclude_owner_user_id:
            q = q.where(Profile.owner_user_id != exclude_owner_user_id)

        rows = session.execute(q).scalars().all()

        items: List[ProfileItem] = []
        for p in rows:
            tags = _parse_json_list(p.tags_csv)
            cultural = _parse_json_list(getattr(p, "cultural_identity_csv", "[]"))
            spiritual = _parse_json_list(getattr(p, "spiritual_framework_csv", "[]"))

            items.append(
                ProfileItem(
                    id=p.id,
                    owner_user_id=p.owner_user_id,
                    displayName=p.display_name,
                    age=p.age,
                    city=p.city,
                    stateUS=p.state_us,
                    photo=p.photo,
                    photo2=getattr(p, "photo2", None),
                    identityPreview=p.identity_preview,
                    intention=p.intention,
                    tags=tags,
                    isAvailable=bool(p.is_available),
                    culturalIdentity=cultural,
                    spiritualFramework=spiritual,
                    relationshipIntent=getattr(p, "relationship_intent", None),
                    datingChallenge=getattr(p, "dating_challenge_text", None),
                    personalTruth=getattr(p, "personal_truth_text", None),
                )
            )

        return ProfilesResponse(items=items)


@app.post("/profiles/upsert", response_model=ProfileItem)
def upsert_my_profile(payload: UpsertMyProfilePayload):
    owner_user_id = _ensure_user(payload.owner_user_id)
    display, state, preview, is_avail = _coerce_upsert_fields(payload)
    cultural_list, spiritual_list, rel_intent, dating_challenge, personal_truth = _coerce_alignment_fields(payload)

    now = datetime.utcnow()
    with Session(engine) as session:
        existing = session.execute(select(Profile).where(Profile.owner_user_id == owner_user_id)).scalar_one_or_none()

        tags_csv = json.dumps(_coerce_str_list(payload.tags)[:25])
        cultural_csv = json.dumps(cultural_list)
        spiritual_csv = json.dumps(spiritual_list)

        photo1 = (payload.photo or "").strip() or None
        photo2 = (payload.photo2 or "").strip() or None

        if existing:
            existing.display_name = display
            existing.age = int(payload.age)
            existing.city = payload.city.strip()
            existing.state_us = state
            existing.photo = photo1
            existing.photo2 = photo2
            existing.identity_preview = preview
            existing.intention = payload.intention.strip()
            existing.tags_csv = tags_csv
            existing.cultural_identity_csv = cultural_csv
            existing.spiritual_framework_csv = spiritual_csv
            existing.relationship_intent = rel_intent
            existing.dating_challenge_text = dating_challenge
            existing.personal_truth_text = personal_truth

            if getattr(existing, "is_banned", False):
                existing.is_available = False
            else:
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
                    photo=photo1,
                    photo2=photo2,
                    identity_preview=preview,
                    intention=payload.intention.strip(),
                    tags_csv=tags_csv,
                    cultural_identity_csv=cultural_csv,
                    spiritual_framework_csv=spiritual_csv,
                    relationship_intent=rel_intent,
                    dating_challenge_text=dating_challenge,
                    personal_truth_text=personal_truth,
                    is_available=is_avail,
                    is_banned=False,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        p = session.get(Profile, pid)
        tags = _parse_json_list(p.tags_csv)
        cultural = _parse_json_list(getattr(p, "cultural_identity_csv", "[]"))
        spiritual = _parse_json_list(getattr(p, "spiritual_framework_csv", "[]"))

        return ProfileItem(
            id=p.id,
            owner_user_id=p.owner_user_id,
            displayName=p.display_name,
            age=p.age,
            city=p.city,
            stateUS=p.state_us,
            photo=p.photo,
            photo2=getattr(p, "photo2", None),
            identityPreview=p.identity_preview,
            intention=p.intention,
            tags=tags,
            isAvailable=bool(p.is_available),
            culturalIdentity=cultural,
            spiritualFramework=spiritual,
            relationshipIntent=getattr(p, "relationship_intent", None),
            datingChallenge=getattr(p, "dating_challenge_text", None),
            personalTruth=getattr(p, "personal_truth_text", None),
        )


@app.get("/profiles/by-id", response_model=ProfileLiteResponse)
def get_profile_by_id(profile_id: str = Query(...)):
    pid = (profile_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        p = session.get(Profile, pid)
        if not p:
            raise HTTPException(status_code=404, detail="Profile not found")
        return ProfileLiteResponse(profile_id=p.id, display_name=p.display_name, photo=p.photo)


@app.post("/profiles", response_model=ProfileItem)
def upsert_profile_alias(payload: UpsertMyProfilePayload):
    return upsert_my_profile(payload)


@app.post("/upload/photo")
async def upload_photo(file: UploadFile = File(...)):
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise HTTPException(status_code=400, detail="Invalid file type")

    filename = f"{secrets.token_hex(8)}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    return {"url": f"{BASE_URL}/photos/{filename}"}


@app.get("/photos/{filename}")
def get_photo(filename: str):
    filename = (filename or "").strip()
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return FileResponse(os.path.join(UPLOAD_DIR, filename))


@app.post("/photos/delete")
def delete_photo(req: DeletePhotoRequest):
    user_id = (req.user_id or "").strip()
    photo_url = (req.photo_url or "").strip()

    if not user_id or not photo_url:
        raise HTTPException(status_code=400, detail="Missing user_id or photo_url")

    filename = _extract_uploaded_filename(photo_url)
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid photo_url")

    file_path = os.path.join(UPLOAD_DIR, filename)

    with Session(engine) as session:
        prof = session.execute(select(Profile).where(Profile.owner_user_id == user_id)).scalar_one_or_none()
        if not prof:
            raise HTTPException(status_code=404, detail="Profile not found for this user")

        changed = False
        if getattr(prof, "photo", None) == photo_url:
            prof.photo = None
            changed = True
        if getattr(prof, "photo2", None) == photo_url:
            prof.photo2 = None
            changed = True

        if changed:
            session.add(prof)
            session.commit()

    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass

    return {"ok": True}


class ProfileGateResponse(BaseModel):
    hasProfile: bool
    hasPhoto: bool
    profileId: Optional[str] = None


@app.get("/profiles/gate", response_model=ProfileGateResponse)
def profiles_gate(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        p = session.execute(select(Profile).where(Profile.owner_user_id == user_id)).scalar_one_or_none()
        if not p:
            return ProfileGateResponse(hasProfile=False, hasPhoto=False, profileId=None)

        has_photo = bool((p.photo or "").strip() or (getattr(p, "photo2", "") or "").strip())
        return ProfileGateResponse(hasProfile=True, hasPhoto=has_photo, profileId=p.id)


@app.get("/saved", response_model=IdListResponse)
def get_saved(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        rows = session.execute(select(SavedProfile.profile_id).where(SavedProfile.user_id == user_id)).all()
        return IdListResponse(ids=[r[0] for r in rows])


@app.post("/saved")
def save_profile(payload: ProfileAction):
    user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        existing = session.execute(
            select(SavedProfile).where(SavedProfile.user_id == user_id, SavedProfile.profile_id == profile_id)
        ).scalar_one_or_none()
        if existing:
            return {"ok": True}

        session.add(SavedProfile(user_id=user_id, profile_id=profile_id, created_at=datetime.utcnow()))
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
        session.execute(delete(SavedProfile).where(SavedProfile.user_id == user_id, SavedProfile.profile_id == profile_id))
        session.commit()

    return {"ok": True}


@app.get("/notifications", response_model=NotificationsResponse)
def get_notifications(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        rows = (
            session.execute(select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_at.desc()).limit(NOTIFICATIONS_LIMIT))
            .scalars()
            .all()
        )

        actor_ids = [n.actor_user_id for n in rows if n.actor_user_id]
        actor_map: Dict[str, Dict[str, Optional[str]]] = {}

        if actor_ids:
            prof_rows = session.execute(select(Profile).where(Profile.owner_user_id.in_(actor_ids))).scalars().all()
            for p in prof_rows:
                actor_map[p.owner_user_id] = {"actor_display_name": p.display_name, "actor_profile_id": p.id, "actor_photo": p.photo}

        items: List[NotificationItem] = []
        for n in rows:
            actor_info = actor_map.get(n.actor_user_id or "", {})
            actor_display_name = actor_info.get("actor_display_name")
            actor_profile_id = actor_info.get("actor_profile_id")
            actor_photo = actor_info.get("actor_photo")

            if n.actor_profile_id:
                actor_profile_id = n.actor_profile_id

            items.append(
                NotificationItem(
                    id=str(n.id),
                    user_id=n.user_id,
                    type=n.type or "notice",
                    message=n.message,
                    created_at=n.created_at.isoformat(),
                    actor_user_id=n.actor_user_id,
                    actor_profile_id=actor_profile_id,
                    actor_display_name=actor_display_name,
                    actor_photo=actor_photo,
                    profile_id=n.profile_id,
                )
            )

        return NotificationsResponse(items=items)


@app.delete("/notifications")
def clear_notifications(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        session.execute(delete(Notification).where(Notification.user_id == user_id))
        session.commit()
    return {"ok": True}


@app.get("/likes", response_model=IdListResponse)
def get_likes(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        rows = session.execute(select(Like.profile_id).where(Like.user_id == user_id)).all()
        return IdListResponse(ids=[r[0] for r in rows])


@app.get("/likes/sent", response_model=IdListResponse)
def get_likes_sent(user_id: str = Query(...)):
    return get_likes(user_id=user_id)


@app.get("/likes/received", response_model=ProfilesListResponse)
def get_likes_received(user_id: str = Query(...), limit: int = Query(default=50, ge=1, le=200)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        my_profile = session.execute(select(Profile).where(Profile.owner_user_id == user_id)).scalar_one_or_none()
        if not my_profile:
            return ProfilesListResponse(items=[])

        liker_rows = session.execute(select(Like.user_id).where(Like.profile_id == my_profile.id).order_by(Like.created_at.desc()).limit(limit)).all()
        liker_user_ids = [r[0] for r in liker_rows]

        if not liker_user_ids:
            return ProfilesListResponse(items=[])

        prof_rows = (
            session.execute(
                select(Profile)
                .where(Profile.owner_user_id.in_(liker_user_ids))
                .where(or_(Profile.is_available == True, Profile.is_available.is_(None)))
                .where(or_(Profile.is_banned == False, Profile.is_banned.is_(None)))
            )
            .scalars()
            .all()
        )

        prof_by_owner = {p.owner_user_id: p for p in prof_rows}
        ordered_profiles = [prof_by_owner[uid] for uid in liker_user_ids if uid in prof_by_owner]

        items: List[ProfileItem] = []
        for p in ordered_profiles:
            tags = _parse_json_list(p.tags_csv)
            cultural = _parse_json_list(getattr(p, "cultural_identity_csv", "[]"))
            spiritual = _parse_json_list(getattr(p, "spiritual_framework_csv", "[]"))

            items.append(
                ProfileItem(
                    id=p.id,
                    owner_user_id=p.owner_user_id,
                    displayName=p.display_name,
                    age=p.age,
                    city=p.city,
                    stateUS=p.state_us,
                    photo=p.photo,
                    photo2=getattr(p, "photo2", None),
                    identityPreview=p.identity_preview,
                    intention=p.intention,
                    tags=tags,
                    isAvailable=bool(p.is_available),
                    culturalIdentity=cultural,
                    spiritualFramework=spiritual,
                    relationshipIntent=getattr(p, "relationship_intent", None),
                    datingChallenge=getattr(p, "dating_challenge_text", None),
                    personalTruth=getattr(p, "personal_truth_text", None),
                )
            )

        return ProfilesListResponse(items=items)


@app.post("/likes")
def like(payload: ProfileAction):
    liker_user_id = _ensure_user(payload.user_id)
    profile_id = (payload.profile_id or "").strip()
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    with Session(engine) as session:
        counter, likes_left_now, reset_at, window_type = _get_likes_window(session, liker_user_id)

        existing = session.execute(select(Like).where(Like.user_id == liker_user_id, Like.profile_id == profile_id)).scalar_one_or_none()
        if existing:
            return {"ok": True, "likesLeft": likes_left_now, "resetsAtUTC": reset_at.isoformat()}

        if int(counter.count) >= FREE_LIKES_PER_DAY:
            if window_type == "test_seconds":
                raise HTTPException(status_code=429, detail=f"Limit reached ({FREE_LIKES_PER_DAY} likes). Resets in about {LIKES_RESET_TEST_SECONDS} seconds.")
            raise HTTPException(status_code=429, detail=f"Daily like limit reached ({FREE_LIKES_PER_DAY}/day). Try again tomorrow.")

        prof = session.get(Profile, profile_id)
        if not prof or getattr(prof, "is_banned", False):
            raise HTTPException(status_code=404, detail="Profile not found")

        session.add(Like(user_id=liker_user_id, profile_id=profile_id, created_at=datetime.utcnow()))
        counter.count = int(counter.count) + 1
        counter.updated_at = datetime.utcnow()

        if LIKES_RESET_TEST_SECONDS and LIKES_RESET_TEST_SECONDS > 0:
            if not counter.window_started_at:
                counter.window_started_at = datetime.utcnow()

        recipient_user_id = prof.owner_user_id
        actor_profile = session.execute(select(Profile).where(Profile.owner_user_id == liker_user_id)).scalar_one_or_none()

        if recipient_user_id and recipient_user_id != liker_user_id:
            session.add(
                Notification(
                    user_id=recipient_user_id,
                    type="like",
                    message="Someone liked your profile.",
                    created_at=datetime.utcnow(),
                    actor_user_id=liker_user_id,
                    profile_id=profile_id,
                    actor_profile_id=(actor_profile.id if actor_profile else None),
                )
            )

        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            likes_left_safe = max(0, FREE_LIKES_PER_DAY - int(counter.count))
            return {"ok": True, "likesLeft": likes_left_safe, "resetsAtUTC": reset_at.isoformat()}

        counter2, likes_left_final, reset_at2, window_type2 = _get_likes_window(session, liker_user_id)
        return {"ok": True, "likesLeft": likes_left_final, "resetsAtUTC": reset_at2.isoformat()}


def _sorted_pair(a: str, b: str) -> Tuple[str, str]:
    a = (a or "").strip()
    b = (b or "").strip()
    if not a or not b:
        raise HTTPException(status_code=400, detail="Both user ids are required.")
    return (a, b) if a < b else (b, a)


def _get_entitlement(session: Session, user_id: str) -> Entitlement:
    row = session.execute(select(Entitlement).where(Entitlement.user_id == user_id)).scalar_one_or_none()
    if row:
        return row
    row = Entitlement(user_id=user_id, is_premium=False, updated_at=datetime.utcnow())
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        row = session.execute(select(Entitlement).where(Entitlement.user_id == user_id)).scalar_one()
    return row


def _can_message_thread(session: Session, user_id: str, thread_id: str) -> Tuple[bool, bool, str]:
    user_id = (user_id or "").strip()
    thread_id = (thread_id or "").strip()
    if not user_id:
        return False, False, "user_id is required"
    if not thread_id:
        return False, False, "thread_id is required"

    ent = _get_entitlement(session, user_id)
    if ent and ent.is_premium:
        return True, True, ""

    tu = session.execute(select(ThreadUnlock).where(ThreadUnlock.user_id == user_id, ThreadUnlock.thread_id == thread_id)).scalar_one_or_none()
    if tu:
        return True, False, ""

    return False, False, "Messaging is locked. Upgrade to Premium or pay $1.99 to unlock this chat."


def _ensure_thread_participant(thread: Thread, user_id: str) -> str:
    if user_id != thread.user_low and user_id != thread.user_high:
        raise HTTPException(status_code=403, detail="You are not a participant in this thread.")
    other = thread.user_high if user_id == thread.user_low else thread.user_low
    return other


class MarkReadPayload(BaseModel):
    user_id: str
    thread_id: str


@app.post("/threads/mark-read")
def mark_thread_read(payload: MarkReadPayload):
    user_id = _ensure_user(payload.user_id)
    thread_id = (payload.thread_id or "").strip()
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    with Session(engine) as session:
        thread = session.get(Thread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        _ensure_thread_participant(thread, user_id)

        latest_created_at = session.execute(select(func.max(Message.created_at)).where(Message.thread_id == thread_id)).scalar_one()
        read_at = latest_created_at or datetime.utcnow()
        now = datetime.utcnow()

        tr = session.execute(select(ThreadRead).where(ThreadRead.user_id == user_id, ThreadRead.thread_id == thread_id)).scalar_one_or_none()
        if tr:
            if tr.last_read_at is None or read_at > tr.last_read_at:
                tr.last_read_at = read_at
            tr.updated_at = now
        else:
            session.add(ThreadRead(id=secrets.token_hex(20)[:40], user_id=user_id, thread_id=thread_id, last_read_at=read_at, created_at=now, updated_at=now))

        session.commit()
        return {"ok": True, "lastReadAt": read_at.isoformat()}


@app.post("/threads/get-or-create", response_model=ThreadItem)
def threads_get_or_create(payload: ThreadGetOrCreatePayload):
    user_id = _ensure_user(payload.user_id)

    with Session(engine) as session:
        prof = session.get(Profile, (payload.with_profile_id or "").strip())
        if not prof or getattr(prof, "is_banned", False):
            raise HTTPException(status_code=404, detail="Profile not found")

        other_user_id = (prof.owner_user_id or "").strip()
        if not other_user_id:
            raise HTTPException(status_code=400, detail="That profile is missing an owner_user_id.")
        if other_user_id == user_id:
            raise HTTPException(status_code=400, detail="You cannot message yourself.")

        low, high = _sorted_pair(user_id, other_user_id)
        existing = session.execute(select(Thread).where(Thread.user_low == low, Thread.user_high == high)).scalar_one_or_none()
        now = datetime.utcnow()

        if existing:
            thread = existing
        else:
            thread = Thread(id=_new_id(), user_low=low, user_high=high, created_at=now, updated_at=now)
            session.add(thread)
            session.commit()

        return ThreadItem(threadId=thread.id, with_user_id=other_user_id, with_profile_id=prof.id, with_display_name=prof.display_name, with_photo=prof.photo, last_message=None, last_message_at=None)


@app.get("/threads/inbox", response_model=ThreadsInboxResponse)
def threads_inbox(user_id: str = Query(...), limit: int = Query(default=50, ge=1, le=200)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        rows = session.execute(select(Thread).where((Thread.user_low == user_id) | (Thread.user_high == user_id)).order_by(Thread.updated_at.desc()).limit(limit)).scalars().all()

        items: List[ThreadItem] = []
        for t in rows:
            other_user_id = t.user_high if t.user_low == user_id else t.user_low
            other_profile = session.execute(select(Profile).where(Profile.owner_user_id == other_user_id)).scalar_one_or_none()
            last_msg = session.execute(select(Message).where(Message.thread_id == t.id).order_by(Message.created_at.desc()).limit(1)).scalar_one_or_none()

            items.append(
                ThreadItem(
                    threadId=t.id,
                    with_user_id=other_user_id,
                    with_profile_id=(other_profile.id if other_profile else None),
                    with_display_name=(other_profile.display_name if other_profile else None),
                    with_photo=(other_profile.photo if other_profile else None),
                    last_message=(last_msg.body if last_msg else None),
                    last_message_at=(last_msg.created_at.isoformat() if last_msg else None),
                )
            )

        return ThreadsInboxResponse(items=items)


@app.get("/threads", response_model=ThreadsResponse)
def get_threads(user_id: str = Query(...), limit: int = Query(default=50, ge=1, le=200)):
    user_id = _ensure_user(user_id)

    with Session(engine) as session:
        rows = session.execute(select(Thread).where((Thread.user_low == user_id) | (Thread.user_high == user_id)).order_by(Thread.updated_at.desc()).limit(limit)).scalars().all()
        items: List[ThreadListItem] = []

        for t in rows:
            other_user_id = t.user_high if t.user_low == user_id else t.user_low
            other_profile = session.execute(select(Profile).where(Profile.owner_user_id == other_user_id)).scalar_one_or_none()
            last_msg = session.execute(select(Message).where(Message.thread_id == t.id).order_by(Message.created_at.desc()).limit(1)).scalar_one_or_none()

            my_read = session.execute(select(ThreadRead).where(ThreadRead.user_id == user_id, ThreadRead.thread_id == t.id)).scalar_one_or_none()
            my_last_read_at = my_read.last_read_at if my_read else None

            unread_count_q = select(func.count()).select_from(Message).where(Message.thread_id == t.id, Message.sender_user_id != user_id)
            if my_last_read_at:
                unread_count_q = unread_count_q.where(Message.created_at > my_last_read_at)

            unread_count = session.execute(unread_count_q).scalar_one() or 0

            items.append(
                ThreadListItem(
                    thread_id=str(t.id),
                    other_user_id=str(other_user_id),
                    other_profile_id=(str(other_profile.id) if other_profile else None),
                    other_display_name=(other_profile.display_name if other_profile else None),
                    other_photo=(other_profile.photo if other_profile else None),
                    last_message_text=(last_msg.body if last_msg else None),
                    last_message_at=(last_msg.created_at.isoformat() if last_msg else None),
                    updated_at=(t.updated_at.isoformat() if t.updated_at else None),
                    unread_count=int(unread_count),
                )
            )

        return ThreadsResponse(items=items)


@app.get("/messaging/access", response_model=MessagingAccessResponse)
def messaging_access(user_id: str = Query(...), thread_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    thread_id = (thread_id or "").strip()
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    with Session(engine) as session:
        thread = session.get(Thread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        _ensure_thread_participant(thread, user_id)
        can_msg, is_premium, reason = _can_message_thread(session, user_id, thread_id)
        return MessagingAccessResponse(canMessage=can_msg, isPremium=is_premium, unlockedUntilUTC=None, reason=reason)


def _require_profile_photo_for_messaging(session: Session, user_id: str) -> None:
    if AUTH_PREVIEW_MODE:
        return

    p = session.execute(select(Profile).where(Profile.owner_user_id == user_id)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=403, detail="photo_required")
    if getattr(p, "is_banned", False):
        raise HTTPException(status_code=403, detail="banned")

    photo1 = (p.photo or "").strip()
    photo2 = (getattr(p, "photo2", "") or "").strip()
    if not (photo1 or photo2):
        raise HTTPException(status_code=403, detail="photo_required")


@app.get("/messages", response_model=MessagesResponse)
def list_messages(thread_id: str = Query(...), user_id: str = Query(...), limit: int = Query(default=200, ge=1, le=500)):
    user_id = _ensure_user(user_id)
    thread_id = (thread_id or "").strip()
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    with Session(engine) as session:
        thread = session.get(Thread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        other_user_id = _ensure_thread_participant(thread, user_id)
        other_read = session.execute(select(ThreadRead).where(ThreadRead.thread_id == thread_id, ThreadRead.user_id == other_user_id)).scalar_one_or_none()
        other_last_read_at = other_read.last_read_at.isoformat() if (other_read and other_read.last_read_at) else None

        rows = session.execute(select(Message).where(Message.thread_id == thread_id).order_by(Message.created_at.desc()).limit(limit)).scalars().all()
        rows = list(reversed(rows))
        items = [MessageItem(id=m.id, thread_id=m.thread_id, sender_user_id=m.sender_user_id, body=m.body, created_at=m.created_at.isoformat()) for m in rows]
        return MessagesResponse(items=items, otherLastReadAt=other_last_read_at)


@app.post("/messages", response_model=MessageItem)
def send_message(payload: MessageCreatePayload):
    user_id = _ensure_user(payload.user_id)
    thread_id = (payload.thread_id or "").strip()
    body = (payload.body or "").strip()

    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")
    if not body:
        raise HTTPException(status_code=400, detail="Message body is required")

    with Session(engine) as session:
        thread = session.get(Thread, thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        _ensure_thread_participant(thread, user_id)
        _require_profile_photo_for_messaging(session, user_id)

        can_msg, is_premium, reason = _can_message_thread(session, user_id, thread_id)
        if not can_msg and not AUTH_PREVIEW_MODE:
            raise HTTPException(status_code=402, detail=reason or "Messaging locked.")

        now = datetime.utcnow()
        m = Message(thread_id=thread_id, sender_user_id=user_id, body=body, created_at=now)
        session.add(m)
        thread.updated_at = now
        session.commit()
        session.refresh(m)

        return MessageItem(id=m.id, thread_id=m.thread_id, sender_user_id=m.sender_user_id, body=m.body, created_at=m.created_at.isoformat())


@app.post("/messaging/unlock")
def admin_unlock(payload: MessagingUnlockPayload, admin_key: str = Query(default="")):
    if not ADMIN_UNLOCK_KEY:
        raise HTTPException(status_code=500, detail="Admin unlock is not configured (ADMIN_UNLOCK_KEY missing).")
    if (admin_key or "").strip() != ADMIN_UNLOCK_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized (bad admin key).")

    user_id = _ensure_user(payload.user_id)
    thread_id = (payload.thread_id or "").strip()

    with Session(engine) as session:
        ent = _get_entitlement(session, user_id)

        if payload.make_premium:
            ent.is_premium = True
            ent.updated_at = datetime.utcnow()
            session.commit()
            return {"ok": True, "userId": user_id, "premium": True}

        if not thread_id:
            raise HTTPException(status_code=400, detail="thread_id is required unless make_premium=true")

        existing = session.execute(select(ThreadUnlock).where(ThreadUnlock.user_id == user_id, ThreadUnlock.thread_id == thread_id)).scalar_one_or_none()
        if not existing:
            now = datetime.utcnow()
            session.add(ThreadUnlock(user_id=user_id, thread_id=thread_id, created_at=now, updated_at=now))
            try:
                session.commit()
            except IntegrityError:
                session.rollback()

        return {"ok": True, "userId": user_id, "threadId": thread_id, "unlocked": True}


@app.post("/admin/auth/login", response_model=AdminLoginOut)
def admin_login(body: AdminLoginIn):
    email = _norm_email(body.email)
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    with Session(engine) as session:
        au = session.execute(select(AdminUser).where(AdminUser.email == email)).scalar_one_or_none()
        if not au or not au.is_enabled:
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        if not _admin_verify_password(body.password, au.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials.")

        token = secrets.token_urlsafe(32)
        s = AdminSession(
            id=secrets.token_hex(20),
            admin_user_id=au.id,
            token_hash=_hash_token(token),
            expires_at=datetime.utcnow() + timedelta(days=7),
            created_at=datetime.utcnow(),
        )
        session.add(s)
        session.commit()

        return AdminLoginOut(token=token, role=au.role, email=au.email)


@app.get("/admin/me", response_model=AdminMeOut)
def admin_me(authorization: Optional[str] = Header(default=None)):
x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    au = require_admin(authorization, allowed_roles=["admin", "moderator"])
    return AdminMeOut(email=au.email, role=au.role)

@app.get("/admin/report-alerts")
def admin_report_alerts(
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

    with engine.begin() as conn:
        open_count = conn.execute(
            text("""
                SELECT COUNT(1)
                FROM user_reports
                WHERE COALESCE(status, 'open') = 'open'
            """)
        ).scalar() or 0

        recent = conn.execute(
            text("""
                SELECT
                  id,
                  reporter_user_id,
                  reported_user_id,
                  reported_profile_id,
                  thread_id,
                  reason,
                  details,
                  COALESCE(status,'open') AS status,
                  created_at
                FROM user_reports
                ORDER BY created_at DESC
                LIMIT 10
            """)
        ).mappings().all()

    # Convert datetimes safely
    out_recent = []
    for r in recent:
        created = r.get("created_at")
        out_recent.append(
            {
                "id": r.get("id"),
                "reporter_user_id": r.get("reporter_user_id"),
                "reported_user_id": r.get("reported_user_id"),
                "reported_profile_id": r.get("reported_profile_id"),
                "thread_id": r.get("thread_id"),
                "reason": r.get("reason"),
                "details": r.get("details"),
                "status": r.get("status") or "open",
                "created_at": created.isoformat() + "Z" if hasattr(created, "isoformat") and created else "",
            }
        )

    return {"openCount": int(open_count), "recent": out_recent}


def _safe_count(conn, sql: str, params: Dict[str, Any]) -> int:
    try:
        v = conn.execute(text(sql), params).scalar()
        return int(v or 0)
    except Exception:
        return 0


@app.get("/admin/profiles", response_model=AdminProfilesOut)
def admin_list_profiles(
    q: Optional[str] = None,
    limit: int = 200,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])


    qn = (q or "").strip().lower()
    limit = max(1, min(int(limit or 200), 500))

    with engine.begin() as conn:
        if qn:
            rows = conn.execute(
                text(
                    """
                    SELECT id, owner_user_id, display_name, age, city, state_us,
                           photo, photo2, is_available, COALESCE(is_banned,false) as is_banned,
                           banned_reason
                    FROM profiles
                    WHERE LOWER(display_name) LIKE :q
                       OR LOWER(city) LIKE :q
                       OR LOWER(state_us) LIKE :q
                       OR LOWER(owner_user_id) LIKE :q
                    ORDER BY created_at DESC
                    LIMIT :lim
                """
                ),
                {"q": f"%{qn}%", "lim": limit},
            ).mappings().all()
        else:
            rows = conn.execute(
                text(
                    """
                    SELECT id, owner_user_id, display_name, age, city, state_us,
                           photo, photo2, is_available, COALESCE(is_banned,false) as is_banned,
                           banned_reason
                    FROM profiles
                    ORDER BY created_at DESC
                    LIMIT :lim
                """
                ),
                {"lim": limit},
            ).mappings().all()

        items: List[AdminProfileRow] = []
        for r in rows:
            pid = str(r["id"])
            likes = _safe_count(conn, "SELECT COUNT(1) FROM likes WHERE profile_id = :pid", {"pid": pid})
            saved = _safe_count(conn, "SELECT COUNT(1) FROM saved_profiles WHERE profile_id = :pid", {"pid": pid})

            items.append(
                AdminProfileRow(
                    profile_id=pid,
                    owner_user_id=str(r["owner_user_id"]),
                    displayName=str(r["display_name"] or ""),
                    age=int(r["age"] or 0),
                    city=str(r["city"] or ""),
                    stateUS=str(r["state_us"] or ""),
                    photo=r.get("photo"),
                    photo2=r.get("photo2"),
                    isAvailable=bool(r["is_available"]),
                    is_banned=bool(r["is_banned"]),
                    banned_reason=r.get("banned_reason"),
                    likes_count=likes,
                    saved_count=saved,
                )
            )

        return AdminProfilesOut(items=items)


@app.patch("/admin/profiles/{profile_id}")
def admin_patch_profile(
    profile_id: str,
    body: AdminPatchProfileIn,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

    with Session(engine) as session:
        p = session.execute(select(Profile).where(Profile.id == profile_id)).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Profile not found.")

        if body.isAvailable is not None:
            if getattr(p, "is_banned", False):
                p.is_available = False
            else:
                p.is_available = bool(body.isAvailable)

        if body.is_banned is not None:
            p.is_banned = bool(body.is_banned)
            p.banned_at = datetime.utcnow() if p.is_banned else None
            if p.is_banned:
                p.is_available = False

        if body.banned_reason is not None:
            p.banned_reason = (body.banned_reason or "").strip() or None

        p.updated_at = datetime.utcnow()
        session.add(p)
        session.commit()

        return {"ok": True}


@app.post("/admin/profiles/{profile_id}/clear-photo")
def admin_clear_photo(
    profile_id: str,
    body: AdminClearPhotoIn,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

    slot = int(body.slot or 0)
    if slot not in (1, 2):
        raise HTTPException(status_code=400, detail="slot must be 1 or 2")

    with Session(engine) as session:
        p = session.execute(select(Profile).where(Profile.id == profile_id)).scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Profile not found.")

        if slot == 1:
            p.photo = None
        else:
            p.photo2 = None
        p.updated_at = datetime.utcnow()

        session.add(p)
        session.commit()

    return {"ok": True}


@app.post("/reports", response_model=ReportOut)
def create_report(body: ReportIn, background_tasks: BackgroundTasks):
    if not body.reporter_user_id or not body.reported_user_id or not (body.reason or "").strip():
        raise HTTPException(status_code=400, detail="reporter_user_id, reported_user_id, and reason are required.")

    rid = secrets.token_hex(20)
    now = datetime.utcnow()

    with Session(engine) as session:
        r = UserReport(
            id=rid,
            reporter_user_id=body.reporter_user_id.strip(),
            reported_user_id=body.reported_user_id.strip(),
            reported_profile_id=(body.reported_profile_id.strip() if body.reported_profile_id else None),
            thread_id=(body.thread_id.strip() if body.thread_id else None),
            reason=body.reason.strip()[:160],
            details=(body.details.strip()[:2000] if body.details else None),
            status="open",
            created_at=now,
            updated_at=now,
        )
        session.add(r)
        session.commit()
        session.refresh(r)

        background_tasks.add_task(_notify_admins_new_report, r)

    return ReportOut(id=rid, status="open")


@app.get("/admin/reports", response_model=AdminReportsOut)
def admin_list_reports(
    status: Optional[str] = None,
    limit: int = 200,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

    limit = max(1, min(int(limit or 200), 500))

    with Session(engine) as session:
        q = select(UserReport).order_by(UserReport.created_at.desc())
        if status:
            q = q.where(UserReport.status == status)
        q = q.limit(limit)

        rows = session.execute(q).scalars().all()

        return AdminReportsOut(
            items=[
                AdminReportRow(
                    id=r.id,
                    reporter_user_id=r.reporter_user_id,
                    reported_user_id=r.reported_user_id,
                    reported_profile_id=r.reported_profile_id,
                    thread_id=r.thread_id,
                    reason=r.reason,
                    details=r.details,
                    status=r.status,
                    created_at=r.created_at.isoformat() + "Z",
                )
                for r in rows
            ]
        )


@app.patch("/admin/reports/{report_id}")
def admin_patch_report(
    report_id: str,
    body: AdminPatchReportIn,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

    st = (body.status or "").strip().lower()
    if st not in ("open", "reviewing", "resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Invalid status.")

    with Session(engine) as session:
        r = session.execute(select(UserReport).where(UserReport.id == report_id)).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found.")
        r.status = st
        r.updated_at = datetime.utcnow()
        session.add(r)
        session.commit()

    return {"ok": True}


@app.post("/admin/users/create", response_model=AdminCreateUserOut)
def admin_create_user_free(
    body: AdminCreateUserIn,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin"])

    user_id = secrets.token_hex(20)
    profile_id = secrets.token_hex(20)
    now = datetime.utcnow()

    with Session(engine) as session:
        p = Profile(
            id=profile_id,
            owner_user_id=user_id,
            display_name=(body.displayName or "New Member").strip(),
            age=18,
            city=(body.city or "").strip(),
            state_us=(body.stateUS or "").strip(),
            identity_preview="",
            intention="Intentional partnership",
            tags_csv="[]",
            cultural_identity_csv="[]",
            spiritual_framework_csv="[]",
            relationship_intent=None,
            dating_challenge_text=None,
            personal_truth_text=None,
            is_available=False,
            is_banned=False,
            banned_reason=None,
            banned_at=None,
            created_at=now,
            updated_at=now,
        )
        session.add(p)

        token = secrets.token_urlsafe(32)
        ct = UserClaimToken(
            id=secrets.token_hex(20),
            token_hash=_hash_token(token),
            user_id=user_id,
            profile_id=profile_id,
            expires_at=now + timedelta(days=14),
            claimed_at=None,
            created_at=now,
        )
        session.add(ct)

        session.commit()

    return AdminCreateUserOut(user_id=user_id, profile_id=profile_id, claim_token=token)

@app.post("/admin/users/create-free")
def admin_create_free_user(
    payload: AdminCreateFreeUserRequest,
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=["admin", "moderator"])

):
    # Use your EXISTING admin session auth
   require_admin(authorization, x_admin_token=x_admin_token, allowed_roles=[...]) 

    email = (payload.email or "").strip().lower()
    display_name = (payload.displayName or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required.")
    if not display_name:
        raise HTTPException(status_code=400, detail="displayName is required.")

    now = datetime.utcnow()

    with Session(engine) as session:
        # Your "users" table does NOT have an email column.
        # Email lives in auth_accounts, so we check there.
        existing_acct = session.execute(
            select(AuthAccount).where(AuthAccount.email == email)
        ).scalar_one_or_none()

        if existing_acct:
            # Ensure user row exists (usually already does)
            try:
                _ensure_user(existing_acct.user_id)
            except Exception:
                pass

            # Ensure a profile exists (create if missing)
            existing_profile = session.execute(
                select(Profile).where(Profile.owner_user_id == existing_acct.user_id)
            ).scalar_one_or_none()

            if not existing_profile:
                session.add(
                    Profile(
                        id=_new_id(),
                        owner_user_id=existing_acct.user_id,
                        display_name=display_name,
                        age=18,
                        city="",
                        state_us="",
                        photo=None,
                        photo2=None,
                        identity_preview="",
                        intention="Intentional partnership",
                        tags_csv="[]",
                        cultural_identity_csv="[]",
                        spiritual_framework_csv="[]",
                        relationship_intent=None,
                        dating_challenge_text=None,
                        personal_truth_text=None,
                        is_available=False,
                        is_banned=False,
                        banned_reason=None,
                        banned_at=None,
                        created_at=now,
                        updated_at=now,
                    )
                )
                session.commit()

            return {
                "ok": True,
                "user_id": existing_acct.user_id,
                "email": existing_acct.email,
                "created": False,
            }

        # Create a brand-new user id
        user_id = _make_user_id_from_email(email)

        # Create AuthAccount with a random password (so the account is valid).
        # The user can use "Forgot password" later to set their own password.
        temp_password = secrets.token_urlsafe(24)
        pwd_hash = _hash_password(temp_password)

        session.add(User(id=user_id, created_at=now))
        session.add(AuthAccount(user_id=user_id, email=email, password_hash=pwd_hash, created_at=now))

        # Create starter profile (your Profile model has required fields)
        session.add(
            Profile(
                id=_new_id(),
                owner_user_id=user_id,
                display_name=display_name,
                age=18,
                city="",
                state_us="",
                photo=None,
                photo2=None,
                identity_preview="",
                intention="Intentional partnership",
                tags_csv="[]",
                cultural_identity_csv="[]",
                spiritual_framework_csv="[]",
                relationship_intent=None,
                dating_challenge_text=None,
                personal_truth_text=None,
                is_available=False,
                is_banned=False,
                banned_reason=None,
                banned_at=None,
                created_at=now,
                updated_at=now,
            )
        )

        session.commit()

    # IMPORTANT: we do NOT return temp_password here for security reasons.
    return {"ok": True, "user_id": user_id, "email": email, "created": True}


@app.post("/stripe/checkout/thread-unlock", response_model=CheckoutSessionResponse)
def stripe_checkout_thread_unlock(payload: ThreadUnlockCheckoutPayload):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured for thread unlocks.")

    user_id = _ensure_user(payload.user_id)
    thread_id = (payload.thread_id or "").strip()
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    WEB_BASE_URL = os.getenv("WEB_BASE_URL") or APP_WEB_BASE_URL

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[{"price_data": {"currency": "usd", "unit_amount": 199, "product_data": {"name": "Unlock Chat Conversation"}}, "quantity": 1}],
            success_url=f"{WEB_BASE_URL}/messages?threadId={thread_id}&checkout=success",
            cancel_url=f"{WEB_BASE_URL}/messages?threadId={thread_id}&checkout=cancel",
            metadata={"kind": "thread_unlock", "user_id": user_id, "thread_id": thread_id},
        )
        return CheckoutSessionResponse(url=checkout_session.url)
    except Exception as e:
        print("STRIPE thread-unlock error:", str(e))
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@app.post("/stripe/checkout/premium", response_model=CheckoutSessionResponse)
def stripe_checkout_premium(payload: PremiumCheckoutPayload):
    if not STRIPE_SECRET_KEY or not STRIPE_PREMIUM_PRICE_ID:
        raise HTTPException(status_code=500, detail="Stripe is not configured for premium.")

    user_id = _ensure_user(payload.user_id)
    WEB_BASE_URL = os.getenv("WEB_BASE_URL") or APP_WEB_BASE_URL

    try:
        session_obj = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PREMIUM_PRICE_ID, "quantity": 1}],
            success_url=f"{WEB_BASE_URL}/discover?premium=success",
            cancel_url=f"{WEB_BASE_URL}/discover?premium=cancel",
            client_reference_id=user_id,
            metadata={"kind": "premium", "user_id": user_id},
        )
        return CheckoutSessionResponse(url=session_obj.url)
    except Exception as e:
        print("STRIPE premium error:", str(e))
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@app.post("/stripe/create-unlock-session")
def create_unlock_session(payload: CreateUnlockSessionPayload):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured (missing STRIPE_SECRET_KEY).")

    user_id = _ensure_user(payload.user_id)

    try:
        session_obj = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {"name": "Black Within — Conversation Unlock", "description": "Unlock messaging with this person forever"},
                        "unit_amount": 199,
                    },
                    "quantity": 1,
                }
            ],
            metadata={"kind": "thread_unlock", "user_id": user_id, "target_profile_id": payload.target_profile_id, "thread_id": payload.thread_id},
            success_url="https://meetblackwithin.com/messages?success=true",
            cancel_url="https://meetblackwithin.com/messages?canceled=true",
        )
        return {"checkout_url": session_obj.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured.")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

    if event.get("type") != "checkout.session.completed":
        return {"status": "ignored"}

    session_obj = event["data"]["object"]
    metadata = session_obj.get("metadata", {}) or {}
    kind = metadata.get("kind")

    with Session(engine) as db:
        if kind == "thread_unlock":
            user_id = (metadata.get("user_id") or "").strip()
            thread_id = (metadata.get("thread_id") or "").strip()
            if not user_id or not thread_id:
                raise HTTPException(status_code=400, detail="Missing user_id or thread_id")

            now = datetime.utcnow()
            db.add(ThreadUnlock(user_id=user_id, thread_id=thread_id, created_at=now, updated_at=now))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()

            return {"status": "success"}

        if kind == "premium":
            user_id = (metadata.get("user_id") or "").strip() or (session_obj.get("client_reference_id") or "").strip()
            if not user_id:
                raise HTTPException(status_code=400, detail="Missing user_id for premium")

            ent = _get_entitlement(db, user_id)
            ent.is_premium = True
            ent.updated_at = datetime.utcnow()
            db.commit()

            return {"status": "success"}

    return {"status": "ignored"}
