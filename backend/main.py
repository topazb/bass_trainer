import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta
from pathlib import Path
from urllib.parse import urlencode, quote

import httpx
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from typing import Optional

import models
import auth
from database import engine, get_db, Base

# ── Logging setup ─────────────────────────────────────────────────────────────

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("bass_trainer")

PROGRAMS_FILE  = Path(__file__).parent / "programs.json"
GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_INFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"
FRONTEND_URL     = os.environ.get("FRONTEND_URL",  "http://localhost:5173")
BACKEND_URL      = os.environ.get("BACKEND_URL",   "http://localhost:8000")
ADMIN_SECRET     = os.environ.get("ADMIN_SECRET",  "bass_admin_2026")
AUDIO_DIR        = Path(os.environ.get("AUDIO_DIR", "/app/audio"))
# Comma-separated allowed origins; default "*" for local dev
_raw_origins     = os.environ.get("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS  = [o.strip() for o in _raw_origins.split(",")]

admin_bearer = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Bass Trainer API (log_level=%s)", LOG_LEVEL)
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE users ADD COLUMN google_id TEXT",
            "ALTER TABLE users ADD COLUMN email TEXT",
            "ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass
    log.info("Database ready")
    yield
    log.info("Bass Trainer API shutting down")


app = FastAPI(title="Bass Trainer API", lifespan=lifespan)

# ── Request/response logging middleware ───────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        log.error("UNHANDLED  %s %s  [%dms]  %s",
                  request.method, request.url.path, duration_ms, exc, exc_info=True)
        raise
    duration_ms = int((time.monotonic() - start) * 1000)
    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    log.log(level, "%d  %s %s  [%dms]",
            response.status_code, request.method, request.url.path, duration_ms)
    return response


# ── Global exception handler ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled exception on %s %s: %s",
              request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        log.error("HTTP %d on %s %s: %s",
                  exc.status_code, request.method, request.url.path, exc.detail)
    elif exc.status_code >= 400:
        log.warning("HTTP %d on %s %s: %s",
                    exc.status_code, request.method, request.url.path, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Serve audio files when a directory is present (production volume mount)
if AUDIO_DIR.exists():
    app.mount("/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")


def load_program() -> dict:
    with open(PROGRAMS_FILE) as f:
        return json.load(f)


def sanitize_username(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "", name.replace(" ", "_"))
    return (cleaned[:24] or "user").lower()


def require_admin(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(admin_bearer),
):
    if not creds or not auth.verify_admin_token(creds.credentials):
        raise HTTPException(401, "Admin access required")


# ── Auth — providers ──────────────────────────────────────────────────────────

@app.get("/auth/providers")
def auth_providers():
    return {"google": bool(os.environ.get("GOOGLE_CLIENT_ID"))}


# ── Auth — username/password ──────────────────────────────────────────────────

@app.post("/auth/register")
def register(body: dict, db: Session = Depends(get_db)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if len(username) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if len(password) < 3:
        raise HTTPException(400, "Password must be at least 3 characters")
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(400, "Username already taken")
    user = models.User(username=username, password_hash=auth.hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("New user registered: id=%d username=%s", user.id, user.username)
    return {"token": auth.create_token(user.id), "user": {"id": user.id, "username": user.username, "is_guest": False}}


@app.post("/auth/login")
def login(body: dict, db: Session = Depends(get_db)):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not auth.verify_password(password, user.password_hash):
        log.warning("Failed login attempt for username=%s", username)
        raise HTTPException(401, "Invalid username or password")
    log.info("User logged in: id=%d username=%s", user.id, user.username)
    return {"token": auth.create_token(user.id), "user": {"id": user.id, "username": user.username, "is_guest": bool(user.is_guest)}}


@app.get("/auth/me")
def me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "id":         current_user.id,
        "username":   current_user.username,
        "is_guest":   bool(current_user.is_guest),
        "created_at": current_user.created_at.isoformat(),
    }


# ── Auth — guest ──────────────────────────────────────────────────────────────

@app.post("/auth/guest")
def guest_login(db: Session = Depends(get_db)):
    short_id = uuid.uuid4().hex[:8]
    username = f"guest_{short_id}"
    user = models.User(username=username, password_hash="", is_guest=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("Guest session created: id=%d username=%s", user.id, user.username)
    return {
        "token": auth.create_token(user.id),
        "user":  {"id": user.id, "username": user.username, "is_guest": True},
    }


# ── Auth — Google OAuth ───────────────────────────────────────────────────────

@app.get("/auth/google")
def google_login():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        return RedirectResponse(
            f"{FRONTEND_URL}/?error=Google+OAuth+not+configured.+Add+GOOGLE_CLIENT_ID+to+docker-compose.yml"
        )
    params = {
        "client_id":     client_id,
        "redirect_uri":  f"{BACKEND_URL}/auth/google/callback",
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "prompt":        "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@app.get("/auth/google/callback")
def google_callback(
    code:  str = None,
    error: str = None,
    db: Session = Depends(get_db),
):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/?error=Google+sign-in+was+cancelled")

    client_id     = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")

    try:
        token_resp   = httpx.post(GOOGLE_TOKEN_URL, data={
            "client_id":     client_id,
            "client_secret": client_secret,
            "code":          code,
            "grant_type":    "authorization_code",
            "redirect_uri":  f"{BACKEND_URL}/auth/google/callback",
        }, timeout=10)
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("no access_token")
        user_info = httpx.get(GOOGLE_INFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10).json()
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/?error=Google+authentication+failed")

    google_id = user_info.get("sub")
    email     = user_info.get("email", "")
    name      = user_info.get("name", "") or email.split("@")[0]
    if not google_id:
        return RedirectResponse(f"{FRONTEND_URL}/?error=Google+did+not+return+a+user+ID")

    user = db.query(models.User).filter(models.User.google_id == google_id).first()
    if not user and email:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.google_id = google_id
            db.commit()
    if not user:
        username = sanitize_username(name)
        base, counter = username, 1
        while db.query(models.User).filter(models.User.username == username).first():
            username = f"{base}{counter}"
            counter += 1
        user = models.User(username=username, password_hash="", google_id=google_id, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = auth.create_token(user.id)
    return RedirectResponse(f"{FRONTEND_URL}/?token={token}&username={quote(user.username)}&is_guest=false")


# ── Programs ──────────────────────────────────────────────────────────────────

@app.get("/programs")
def list_programs():
    p = load_program()
    return [{"id": p["id"], "duration": p["duration"]}]


@app.get("/programs/{duration}")
def get_program(duration: int):
    p = load_program()
    if p["duration"] != duration:
        raise HTTPException(404, "Program not found")
    return p


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/sessions")
def start_session(
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    program = load_program()
    session = models.PracticeSession(
        user_id=current_user.id,
        program_id=body.get("program_id", "30min_full_bass"),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    log.info("Session started: session_id=%d user_id=%d program=%s",
             session.id, current_user.id, session.program_id)
    return {"session_id": session.id, "program": program}


@app.post("/sessions/{session_id}/complete")
def complete_session(
    session_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    session.completed_at     = datetime.utcnow()
    session.duration_seconds = body.get("duration_seconds", 0)
    session.completed        = body.get("completed", False)
    session.blocks_completed = body.get("blocks_completed", 0)
    for qr in body.get("quiz_results", []):
        if qr.get("total", 0) > 0:
            db.add(models.QuizResult(
                session_id=session.id,
                user_id=current_user.id,
                quiz_type=qr["quiz_type"],
                correct=qr.get("correct", 0),
                total=qr.get("total", 0),
                difficulty=qr.get("difficulty"),
            ))
    db.commit()
    log.info("Session completed: session_id=%d user_id=%d duration=%ds blocks=%d completed=%s",
             session_id, current_user.id, session.duration_seconds,
             session.blocks_completed, session.completed)
    return {"status": "ok"}


# ── User stats ────────────────────────────────────────────────────────────────

def compute_streak(session_dates: list[date]) -> tuple[int, int]:
    if not session_dates:
        return 0, 0
    unique = sorted(set(session_dates), reverse=True)
    today  = date.today()
    current = 0
    if unique[0] >= today - timedelta(days=1):
        current = 1
        for i in range(1, len(unique)):
            if unique[i - 1] - unique[i] == timedelta(days=1):
                current += 1
            else:
                break
    best, run = 1, 1
    for i in range(1, len(unique)):
        if unique[i - 1] - unique[i] == timedelta(days=1):
            run += 1
            best = max(best, run)
        else:
            run = 1
    return current, max(best, current)


@app.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    today       = date.today()
    week_start  = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    year_start  = today.replace(month=1, day=1)

    all_sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.user_id == current_user.id,
        models.PracticeSession.completed_at.isnot(None),
    ).all()

    def bucket(start):
        return [s for s in all_sessions if s.completed_at.date() >= start]

    def bucket_stats(sessions):
        return {"sessions": len(sessions), "seconds": sum(s.duration_seconds or 0 for s in sessions)}

    session_dates              = [s.completed_at.date() for s in all_sessions]
    current_streak, best_streak = compute_streak(session_dates)

    days_elapsed   = max((today - month_start).days + 1, 1)
    days_practiced = len(set(s.completed_at.date() for s in bucket(month_start)))
    consistency    = round(days_practiced / days_elapsed * 100)

    all_quiz = db.query(models.QuizResult).filter(models.QuizResult.user_id == current_user.id).all()

    def quiz_agg(results):
        c = sum(r.correct for r in results)
        t = sum(r.total   for r in results)
        return {"correct": c, "total": t, "accuracy": round(c / t * 100, 1) if t else 0}

    fb  = [q for q in all_quiz if q.quiz_type == "fretboard"]
    ear = [q for q in all_quiz if q.quiz_type == "ear_training"]
    ear_by_diff = {
        d: quiz_agg([q for q in ear if q.difficulty == d])
        for d in ["simple", "diatonic", "all"]
        if any(q.difficulty == d for q in ear)
    }

    recent = sorted(all_sessions, key=lambda s: s.completed_at, reverse=True)[:10]

    return {
        "total_sessions":     len(all_sessions),
        "completed_sessions": sum(1 for s in all_sessions if s.completed),
        "total_seconds":      sum(s.duration_seconds or 0 for s in all_sessions),
        "current_streak":     current_streak,
        "best_streak":        best_streak,
        "consistency_pct":    consistency,
        "this_week":          bucket_stats(bucket(week_start)),
        "this_month":         bucket_stats(bucket(month_start)),
        "this_year":          bucket_stats(bucket(year_start)),
        "fretboard":          quiz_agg(fb),
        "ear_training":       {**quiz_agg(ear), "by_difficulty": ear_by_diff},
        "recent_sessions": [
            {
                "date":             s.completed_at.strftime("%b %d"),
                "duration_seconds": s.duration_seconds or 0,
                "completed":        s.completed,
                "blocks_completed": s.blocks_completed or 0,
            }
            for s in recent
        ],
        "member_since": current_user.created_at.strftime("%b %Y"),
    }


# ── Admin ─────────────────────────────────────────────────────────────────────

@app.post("/admin/login")
def admin_login(body: dict):
    if body.get("secret") != ADMIN_SECRET:
        raise HTTPException(401, "Invalid admin secret")
    return {"token": auth.create_admin_token()}


@app.get("/admin/stats")
def admin_stats(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    today = date.today()

    all_users    = db.query(models.User).all()
    all_sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.completed_at.isnot(None)
    ).all()
    all_quiz     = db.query(models.QuizResult).all()

    week_start  = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    active_week  = len(set(s.user_id for s in all_sessions if s.completed_at.date() >= week_start))
    active_month = len(set(s.user_id for s in all_sessions if s.completed_at.date() >= month_start))

    total_secs = sum(s.duration_seconds or 0 for s in all_sessions)
    avg_secs   = round(total_secs / len(all_sessions)) if all_sessions else 0

    # Retention: users with more than 1 session
    from collections import defaultdict
    user_session_counts = defaultdict(int)
    for s in all_sessions:
        user_session_counts[s.user_id] += 1
    retained = sum(1 for c in user_session_counts.values() if c > 1)

    # Sessions per day — last 30 days
    day_counts = defaultdict(int)
    cutoff = today - timedelta(days=29)
    for s in all_sessions:
        if s.completed_at.date() >= cutoff:
            day_counts[s.completed_at.date()] += 1
    sessions_per_day = [
        {"date": (cutoff + timedelta(days=i)).strftime("%b %d"), "count": day_counts.get(cutoff + timedelta(days=i), 0)}
        for i in range(30)
    ]

    # New users per day (last 30 days)
    new_user_counts = defaultdict(int)
    for u in all_users:
        if u.created_at.date() >= cutoff:
            new_user_counts[u.created_at.date()] += 1
    new_users_per_day = [
        {"date": (cutoff + timedelta(days=i)).strftime("%b %d"), "count": new_user_counts.get(cutoff + timedelta(days=i), 0)}
        for i in range(30)
    ]

    # Per-user stats
    user_sessions = defaultdict(list)
    for s in all_sessions:
        user_sessions[s.user_id].append(s)

    user_quiz = defaultdict(list)
    for q in all_quiz:
        user_quiz[q.user_id].append(q)

    def user_accuracy(quizzes, qtype):
        subset = [q for q in quizzes if q.quiz_type == qtype]
        c = sum(q.correct for q in subset)
        t = sum(q.total   for q in subset)
        return round(c / t * 100, 1) if t else None

    users_data = []
    for u in sorted(all_users, key=lambda x: x.created_at, reverse=True):
        sessions = user_sessions[u.id]
        total_s  = sum(s.duration_seconds or 0 for s in sessions)
        dates    = [s.completed_at.date() for s in sessions]
        streak, _ = compute_streak(dates)
        last_seen = max((s.completed_at for s in sessions), default=None)
        users_data.append({
            "id":             u.id,
            "username":       u.username,
            "is_guest":       bool(u.is_guest),
            "has_google":     bool(u.google_id),
            "sessions":       len(sessions),
            "total_seconds":  total_s,
            "streak":         streak,
            "last_seen":      last_seen.strftime("%b %d") if last_seen else "—",
            "joined":         u.created_at.strftime("%b %d, %Y"),
            "fb_accuracy":    user_accuracy(user_quiz[u.id], "fretboard"),
            "ear_accuracy":   user_accuracy(user_quiz[u.id], "ear_training"),
        })

    # Global skill stats
    def global_quiz_agg(qtype):
        subset = [q for q in all_quiz if q.quiz_type == qtype]
        c = sum(q.correct for q in subset)
        t = sum(q.total   for q in subset)
        return {"correct": c, "total": t, "accuracy": round(c / t * 100, 1) if t else 0}

    return {
        "overview": {
            "total_users":     len(all_users),
            "registered_users": sum(1 for u in all_users if not u.is_guest),
            "guest_users":     sum(1 for u in all_users if u.is_guest),
            "google_users":    sum(1 for u in all_users if u.google_id),
            "total_sessions":  len(all_sessions),
            "total_seconds":   total_secs,
            "avg_session_secs": avg_secs,
            "active_this_week":  active_week,
            "active_this_month": active_month,
            "retained_users":  retained,
        },
        "sessions_per_day":  sessions_per_day,
        "new_users_per_day": new_users_per_day,
        "users":             users_data,
        "skills": {
            "fretboard":    global_quiz_agg("fretboard"),
            "ear_training": global_quiz_agg("ear_training"),
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}
