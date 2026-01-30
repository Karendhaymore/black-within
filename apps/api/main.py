import os
import re
import secrets
import hashlib
import hmac
import json
import base64
from datetime import datetime, timedelta, date, time
from typing import List, Optional, Dict, Any, Tuple

from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
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

# Password auth config (required for /auth/signup + /auth/login)
AUTH_SECRET = os.getenv("AUTH_SECRET", "").strip()  # set this in Render env vars
PBKDF2_ITERS = int(os.getenv("PBKDF2_ITERS", "200000"))

NOTIFICATIONS_LIMIT = int(os.getenv("NOTIFICATIONS_LIMIT", "200"))

# Free likes/day limit
FREE_LIKES_PER_DAY = int(os.getenv("FREE_LIKES_PER_DAY", "5"))

# NEW: test-mode reset (seconds). If > 0, likes reset every N seconds (for testing).
LIKES_RESET_TEST_SECONDS = int(os.getenv("LIKES_RESET_TEST_SECONDS", "0") or "0")

# ✅ ADMIN KEY (add this)
ADMIN_KEY = os.getenv("ADMIN_KEY", "").strip()

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip()
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "").strip()
SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "Black Within").strip()

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


class AuthAccount(Base):
    """
    Email + password login (password is stored hashed, never plaintext).
    user_id is stable and derived from email (via _make_user_id_from_email()).
    """
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
    photo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    identity_preview: Mapped[str] = mapped_column(String(500))
    intention: Mapped[str] = mapped_column(String(120))

    # IMPORTANT: DB currently has tags_csv; keep that name to avoid 500s
    tags_csv: Mapped[str] = mapped_column(Text, default="[]")

    # alignment fields (stored as JSON strings in TEXT columns)
    cultural_identity_csv: Mapped[str] = mapped_column(Text, default="[]")
    spiritual_framework_csv: Mapped[str] = mapped_column(Text, default="[]")

    # relationship intent (single-select)
    relationship_intent: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # conscious prompts
    dating_challenge_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    personal_truth_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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


class DailyLikeCount(Base):
    """
    Tracks likes used in the current window.
    - Normal mode: one row per user per UTC day (day column).
    - Test mode: we still keep a row, but we also use window_started_at to know when to reset.
    """
    __tablename__ = "daily_like_counts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # NEW: used for test-mode rolling reset
    window_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_daily_like_user_day"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(40), index=True)       # recipient
    type: Mapped[str] = mapped_column(String(20), default="like")
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Actor (who caused the notification)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # Target profile (the profile that was liked)
    profile_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # Actor profile id (so frontend can link to liker's profile page)
    actor_profile_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


class LoginCode(Base):
    __tablename__ = "login_codes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True, unique=True)
    code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# -----------------------------
# MVP auto-migration
# -----------------------------
def _auto_migrate_profiles_table():
    """
    create_all() does NOT modify existing tables.
    This safely adds any missing columns to profiles so /profiles won't 500.
    """
    with engine.begin() as conn:
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(40);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(80);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city VARCHAR(80);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_us VARCHAR(80);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo VARCHAR(500);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_preview VARCHAR(500);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS intention VARCHAR(120);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tags_csv TEXT DEFAULT '[]';"""))

        # Back-compat: if older column tags_json exists, copy into tags_csv when empty
        conn.execute(text("""
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
        """))

        # alignment columns
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cultural_identity_csv TEXT DEFAULT '[]';"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spiritual_framework_csv TEXT DEFAULT '[]';"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS relationship_intent VARCHAR(120);"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dating_challenge_text TEXT;"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_truth_text TEXT;"""))

        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();"""))
        conn.execute(text("""ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();"""))


def _auto_migrate_notifications_table():
    """
    Add actor_user_id/profile_id/actor_profile_id columns if missing (for richer notifications).
    """
    with engine.begin() as conn:
        conn.execute(text("""ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(40);"""))
        conn.execute(text("""ALTER TABLE notifications ADD COLUMN IF NOT EXISTS profile_id VARCHAR(60);"""))
        conn.execute(text("""ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_profile_id VARCHAR(60);"""))


def _auto_migrate_auth_accounts_table():
    """
    Create auth_accounts table if missing (email + password auth).
    """
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS auth_accounts (
              user_id VARCHAR(40) PRIMARY KEY,
              email VARCHAR(320) UNIQUE,
              password_hash VARCHAR(500),
              created_at TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""CREATE INDEX IF NOT EXISTS ix_auth_accounts_email ON auth_accounts(email);"""))


def _auto_migrate_daily_like_counts_table():
    """
    Create daily_like_counts if missing (for free likes/day limit),
    and add window_started_at if missing (for test reset mode).
    """
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS daily_like_counts (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR(40),
              day DATE,
              count INTEGER DEFAULT 0,
              updated_at TIMESTAMP DEFAULT NOW(),
              window_started_at TIMESTAMP NULL,
              CONSTRAINT uq_daily_like_user_day UNIQUE (user_id, day)
            );
        """))
        conn.execute(text("""CREATE INDEX IF NOT EXISTS ix_daily_like_counts_user_id ON daily_like_counts(user_id);"""))
        conn.execute(text("""CREATE INDEX IF NOT EXISTS ix_daily_like_counts_day ON daily_like_counts(day);"""))

        # If the table already existed before window_started_at, add it safely:
        conn.execute(text("""ALTER TABLE daily_like_counts ADD COLUMN IF NOT EXISTS window_started_at TIMESTAMP NULL;"""))


# Create tables if missing
Base.metadata.create_all(bind=engine)

# Then run MVP migrations
try:
    _auto_migrate_profiles_table()
except Exception as e:
    print("AUTO_MIGRATE_PROFILES failed:", str(e))

try:
    _auto_migrate_notifications_table()
except Exception as e:
    print("AUTO_MIGRATE_NOTIFICATIONS failed:", str(e))

try:
    _auto_migrate_auth_accounts_table()
except Exception as e:
    print("AUTO_MIGRATE_AUTH_ACCOUNTS failed:", str(e))

try:
    _auto_migrate_daily_like_counts_table()
except Exception as e:
    print("AUTO_MIGRATE_DAILY_LIKES failed:", str(e))


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


class SignupPayload(BaseModel):
    email: str
    password: str


class LoginPayload(BaseModel):
    email: str
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
    windowType: str  # "daily_utc" or "test_seconds"
    resetsAtUTC: str


# Accept BOTH camelCase and snake_case (frontend may send either)
class UpsertMyProfilePayload(BaseModel):
    owner_user_id: str  # keep this key name for your frontend

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


# ✅ ADMIN SCHEMAS (add these)
class AdminCreateProfilePayload(BaseModel):
    # If you provide owner_user_id, the profile is tied to that user.
    # If not provided, backend will create a new user_id automatically.
    owner_user_id: Optional[str] = None

    displayName: str
    age: int
    city: str
    stateUS: str
    photo: Optional[str] = None

    intention: str
    identityPreview: str
    tags: List[str] = []

    culturalIdentity: Optional[List[str]] = None
    spiritualFramework: Optional[List[str]] = None
    relationshipIntent: Optional[str] = None
    datingChallenge: Optional[str] = None
    personalTruth: Optional[str] = None

    isAvailable: Optional[bool] = True


class AdminSeedPayload(BaseModel):
    count: int = 10


# -----------------------------
# App
# -----------------------------
app = FastAPI(title="Black Within API", version="1.1.2")

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


# ✅ ADMIN GUARD (add this)
def _require_admin(x_admin_key: Optional[str]) -> None:
    if not ADMIN_KEY:
        raise HTTPException(status_code=500, detail="Admin is not configured (ADMIN_KEY missing).")
    if not x_admin_key or x_admin_key.strip() != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized (bad admin key).")


def _send_email_sendgrid(to_email: str, subject: str, html: str) -> None:
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


def _hash_password(password: str) -> str:
    """
    PBKDF2 hash: pbkdf2$iters$salt$derived_key
    """
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


def _utc_midnight_of_day(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _next_utc_midnight(now_utc: datetime) -> datetime:
    tomorrow = (now_utc.date() + timedelta(days=1))
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
    """
    Returns:
      (counter_row, likes_left, resets_at_utc, window_type)

    Window types:
      - daily_utc: resets at next UTC midnight
      - test_seconds: resets every LIKES_RESET_TEST_SECONDS seconds (rolling window)
    """
    now = datetime.utcnow()

    # TEST MODE (for you while building)
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

    # NORMAL MODE
    today = now.date()
    counter = _get_or_create_daily_like_counter(session, user_id, today)
    reset_at = _next_utc_midnight(now)
    likes_left = max(0, FREE_LIKES_PER_DAY - int(counter.count))
    return counter, likes_left, reset_at, "daily_utc"


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
        "freeLikesPerDay": FREE_LIKES_PER_DAY,
        "likesResetTestSeconds": LIKES_RESET_TEST_SECONDS,
        "corsOrigins": origins,
        "version": "1.1.2",
        "adminConfigured": bool(ADMIN_KEY),
    }


# -----------------------------
# ME
# -----------------------------
@app.get("/me", response_model=MeResponse)
def me(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    return MeResponse(user_id=user_id)


# -----------------------------
# AUTH (Password-based)
# -----------------------------
@app.post("/auth/signup")
def signup(payload: SignupPayload):
    email = _normalize_email(payload.email)
    password = payload.password or ""

    user_id = _make_user_id_from_email(email)
    pwd_hash = _hash_password(password)

    with Session(engine) as session:
        existing = session.execute(
            select(AuthAccount).where(AuthAccount.email == email)
        ).scalar_one_or_none()
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
        acct = session.execute(
            select(AuthAccount).where(AuthAccount.email == email)
        ).scalar_one_or_none()
        if not acct:
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")

        if not _verify_password(password, acct.password_hash):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    _ensure_user(acct.user_id)
    return {"ok": True, "userId": acct.user_id, "email": email}


# -----------------------------
# AUTH (Email-code; still supported)
# -----------------------------
@app.post("/auth/request-code")
def request_code(payload: RequestCodePayload):
    email = _normalize_email(payload.email)

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=AUTH_CODE_TTL_MINUTES)
    now = datetime.utcnow()

    with Session(engine) as session:
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

    if AUTH_PREVIEW_MODE:
        return {"ok": True, "devCode": code, "sent": False, "previewMode": True}

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
        return {"ok": True, "sent": False, "error": str(e), "devCode": code, "previewMode": False}


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
# Likes status
# -----------------------------
@app.get("/likes/status", response_model=LikesStatusResponse)
def likes_status(user_id: str = Query(...)):
    user_id = _ensure_user(user_id)
    with Session(engine) as session:
        counter, likes_left, reset_at, window_type = _get_likes_window(session, user_id)
        return LikesStatusResponse(
            likesLeft=likes_left,
            limit=FREE_LIKES_PER_DAY,
            windowType=window_type,
            resetsAtUTC=reset_at.isoformat(),
        )


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

    dating_challenge = (
        payload.datingChallenge
        if payload.datingChallenge is not None
        else payload.dating_challenge_text
    )
    personal_truth = (
        payload.personalTruth
        if payload.personalTruth is not None
        else payload.personal_truth_text
    )

    dating_challenge = (dating_challenge or "").strip() or None
    personal_truth = (personal_truth or "").strip() or None

    return cultural_list, spiritual_list, rel_intent, dating_challenge, personal_truth


@app.post("/profiles/upsert", response_model=ProfileItem)
def upsert_my_profile(payload: UpsertMyProfilePayload):
    owner_user_id = _ensure_user(payload.owner_user_id)
    display, state, preview, is_avail = _coerce_upsert_fields(payload)

    cultural_list, spiritual_list, rel_intent, dating_challenge, personal_truth = _coerce_alignment_fields(payload)

    now = datetime.utcnow()
    with Session(engine) as session:
        existing = session.execute(
            select(Profile).where(Profile.owner_user_id == owner_user_id)
        ).scalar_one_or_none()

        tags_csv = json.dumps(_coerce_str_list(payload.tags)[:25])
        cultural_csv = json.dumps(cultural_list)
        spiritual_csv = json.dumps(spiritual_list)

        if existing:
            existing.display_name = display
            existing.age = int(payload.age)
            existing.city = payload.city.strip()
            existing.state_us = state
            existing.photo = (payload.photo or "").strip() or None
            existing.identity_preview = preview
            existing.intention = payload.intention.strip()
            existing.tags_csv = tags_csv

            existing.cultural_identity_csv = cultural_csv
            existing.spiritual_framework_csv = spiritual_csv
            existing.relationship_intent = rel_intent
            existing.dating_challenge_text = dating_challenge
            existing.personal_truth_text = personal_truth

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
                    tags_csv=tags_csv,
                    cultural_identity_csv=cultural_csv,
                    spiritual_framework_csv=spiritual_csv,
                    relationship_intent=rel_intent,
                    dating_challenge_text=dating_challenge,
                    personal_truth_text=personal_truth,
                    is_available=is_avail,
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


# IMPORTANT: your frontend currently POSTs to /profiles (keep this alias)
@app.post("/profiles", response_model=ProfileItem)
def upsert_profile_alias(payload: UpsertMyProfilePayload):
    return upsert_my_profile(payload)


# -----------------------------
# ✅ ADMIN endpoints (add these)
# -----------------------------
@app.post("/admin/create-profile", response_model=ProfileItem)
def admin_create_profile(
    payload: AdminCreateProfilePayload,
    x_admin_key: Optional[str] = Header(default=None),
):
    _require_admin(x_admin_key)

    # Determine owner user id
    owner_user_id = (payload.owner_user_id or "").strip()
    if owner_user_id:
        owner_user_id = _ensure_user(owner_user_id)
    else:
        owner_user_id = _ensure_user(_new_id())

    # Validate basics
    display = (payload.displayName or "").strip()
    state = (payload.stateUS or "").strip()
    preview = (payload.identityPreview or "").strip()
    city = (payload.city or "").strip()
    intention = (payload.intention or "").strip()

    if not display:
        raise HTTPException(status_code=400, detail="displayName is required")
    if payload.age < 18:
        raise HTTPException(status_code=400, detail="age must be 18+")
    if not city:
        raise HTTPException(status_code=400, detail="city is required")
    if not state:
        raise HTTPException(status_code=400, detail="stateUS is required")
    if not intention:
        raise HTTPException(status_code=400, detail="intention is required")
    if not preview:
        raise HTTPException(status_code=400, detail="identityPreview is required")

    tags_csv = json.dumps(_coerce_str_list(payload.tags)[:25])

    cultural_list = _coerce_str_list(payload.culturalIdentity or [])[:50]
    spiritual_list = _coerce_str_list(payload.spiritualFramework or [])[:50]
    cultural_csv = json.dumps(cultural_list)
    spiritual_csv = json.dumps(spiritual_list)

    rel_intent = (payload.relationshipIntent or "").strip() or None
    dating_challenge = (payload.datingChallenge or "").strip() or None
    personal_truth = (payload.personalTruth or "").strip() or None

    now = datetime.utcnow()

    with Session(engine) as session:
        pid = _new_id()
        session.add(
            Profile(
                id=pid,
                owner_user_id=owner_user_id,
                display_name=display,
                age=int(payload.age),
                city=city,
                state_us=state,
                photo=(payload.photo or "").strip() or None,
                identity_preview=preview,
                intention=intention,
                tags_csv=tags_csv,
                cultural_identity_csv=cultural_csv,
                spiritual_framework_csv=spiritual_csv,
                relationship_intent=rel_intent,
                dating_challenge_text=dating_challenge,
                personal_truth_text=personal_truth,
                is_available=bool(payload.isAvailable if payload.isAvailable is not None else True),
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


@app.post("/admin/seed-profiles", response_model=ProfilesResponse)
def admin_seed_profiles(
    payload: AdminSeedPayload,
    x_admin_key: Optional[str] = Header(default=None),
):
    _require_admin(x_admin_key)

    count = int(payload.count or 0)
    if count < 1 or count > 50:
        raise HTTPException(status_code=400, detail="count must be between 1 and 50")

    # Simple seed data (you can edit these anytime)
    names = [
        "NubianGrace", "SankofaSoul", "KemeticKing", "AncestralMuse", "UbuntuHeart",
        "PanAfricanPoise", "RootedRhythm", "MaatAligned", "DiasporaDream", "ConsciousClassic",
        "LotusLogic", "CrownChakra", "SunStone", "MelaninMystic", "HeritageHorizon",
    ]
    cities = [
        ("Atlanta", "GA"), ("Houston", "TX"), ("Chicago", "IL"), ("Los Angeles", "CA"),
        ("New York", "NY"), ("Dallas", "TX"), ("Denver", "CO"), ("Charlotte", "NC"),
        ("Baltimore", "MD"), ("Oakland", "CA"),
    ]
    intentions = [
        "Intentional partnership",
        "Marriage-minded",
        "Conscious companionship",
        "Community-first connection",
    ]
    cultural_opts = [
        "Pan-African - Identifies with the global African family, regardless of nationality",
        "Ancestrally Rooted - Identity defined by lineage consciousness, not geography alone",
        "African American - Retrieves cultural identity from the American experience.",
        "African-Centered - Lives and thinks from African worldviews",
    ]
    spiritual_opts = [
        "Kemetic Philosophy",
        "Ifa / Orisha Traditions (Yoruba)",
        "Hoodoo / Rootwork",
        "Ubuntu",
        "Sankofa",
        "Ancestral Veneration Systems",
    ]

    created: List[ProfileItem] = []
    now = datetime.utcnow()

    with Session(engine) as session:
        for i in range(count):
            owner_user_id = _ensure_user(_new_id())
            display = names[i % len(names)] + (f" {i+1}" if i >= len(names) else "")
            city, state = cities[i % len(cities)]
            age = 26 + (i % 12)

            cultural_list = [cultural_opts[i % len(cultural_opts)]]
            spiritual_list = [spiritual_opts[i % len(spiritual_opts)]]

            identity_preview = (
                f"Cultural Identity: {cultural_list[0]}\n\n"
                f"Spiritual Framework: {spiritual_list[0]}\n\n"
                f"One Thing You Need to Know About Me: I move with intention, boundaries, and warmth."
            )

            tags = (cultural_list + spiritual_list)[:25]

            pid = _new_id()
            p = Profile(
                id=pid,
                owner_user_id=owner_user_id,
                display_name=display,
                age=age,
                city=city,
                state_us=state,
                photo=None,
                identity_preview=identity_preview,
                intention=intentions[i % len(intentions)],
                tags_csv=json.dumps(tags),
                cultural_identity_csv=json.dumps(cultural_list),
                spiritual_framework_csv=json.dumps(spiritual_list),
                relationship_intent=None,
                dating_challenge_text=None,
                personal_truth_text=None,
                is_available=True,
                created_at=now,
                updated_at=now,
            )
            session.add(p)

        session.commit()

        rows = session.execute(
            select(Profile)
            .where(Profile.is_available == True)
            .order_by(Profile.updated_at.desc())
            .limit(count)
        ).scalars().all()

        for p in rows:
            created.append(
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
                    tags=_parse_json_list(p.tags_csv),
                    isAvailable=bool(p.is_available),
                    culturalIdentity=_parse_json_list(getattr(p, "cultural_identity_csv", "[]")),
                    spiritualFramework=_parse_json_list(getattr(p, "spiritual_framework_csv", "[]")),
                    relationshipIntent=getattr(p, "relationship_intent", None),
                    datingChallenge=getattr(p, "dating_challenge_text", None),
                    personalTruth=getattr(p, "personal_truth_text", None),
                )
            )

    return ProfilesResponse(items=created)


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

    return {"ok
