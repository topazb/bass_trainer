"""
Test fixtures for the Bass Trainer backend.

DATABASE_URL must be set BEFORE any project modules are imported so the
SQLAlchemy engine is created pointing at the test database.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_bass_trainer.db")

import pytest
from fastapi.testclient import TestClient

from database import Base, get_db, engine
from main import app

# ── Database setup ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once for the whole test session."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    db_file = "test_bass_trainer.db"
    if os.path.exists(db_file):
        os.remove(db_file)


@pytest.fixture(autouse=True)
def clean_tables():
    """Truncate every table after each test so tests are fully isolated."""
    yield
    with engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()


# ── HTTP client ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


# ── Convenience helpers ───────────────────────────────────────────────────────

@pytest.fixture
def registered_user(client):
    """Register a fresh user and return {token, user}."""
    r = client.post("/auth/register", json={"username": "alice", "password": "password123"})
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def auth_headers(registered_user):
    return {"Authorization": f"Bearer {registered_user['token']}"}


@pytest.fixture
def started_session(client, auth_headers):
    """Start a practice session and return {session_id, program}."""
    r = client.post("/sessions", json={"program_id": "30min_full_bass"}, headers=auth_headers)
    assert r.status_code == 200
    return r.json()
