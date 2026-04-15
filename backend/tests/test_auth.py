"""Auth endpoints: register, login, guest, /me."""
import pytest


# ── Register ──────────────────────────────────────────────────────────────────

class TestRegister:
    def test_success(self, client):
        r = client.post("/auth/register", json={"username": "bob", "password": "secret123"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["username"] == "bob"
        assert data["user"]["is_guest"] is False

    def test_duplicate_username(self, client):
        client.post("/auth/register", json={"username": "bob", "password": "secret123"})
        r = client.post("/auth/register", json={"username": "bob", "password": "other"})
        assert r.status_code == 400
        assert "already taken" in r.json()["detail"]

    def test_missing_username(self, client):
        r = client.post("/auth/register", json={"password": "secret"})
        assert r.status_code == 400

    def test_missing_password(self, client):
        r = client.post("/auth/register", json={"username": "bob"})
        assert r.status_code == 400

    def test_username_too_short(self, client):
        r = client.post("/auth/register", json={"username": "x", "password": "secret"})
        assert r.status_code == 400

    def test_password_too_short(self, client):
        r = client.post("/auth/register", json={"username": "bob", "password": "ab"})
        assert r.status_code == 400


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_success(self, client):
        client.post("/auth/register", json={"username": "carol", "password": "pass123"})
        r = client.post("/auth/login", json={"username": "carol", "password": "pass123"})
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["username"] == "carol"
        assert data["user"]["is_guest"] is False

    def test_wrong_password(self, client):
        client.post("/auth/register", json={"username": "carol", "password": "pass123"})
        r = client.post("/auth/login", json={"username": "carol", "password": "wrong"})
        assert r.status_code == 401

    def test_unknown_user(self, client):
        r = client.post("/auth/login", json={"username": "nobody", "password": "pass"})
        assert r.status_code == 401


# ── Guest ─────────────────────────────────────────────────────────────────────

class TestGuest:
    def test_creates_guest(self, client):
        r = client.post("/auth/guest")
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["user"]["is_guest"] is True
        assert data["user"]["username"].startswith("guest_")

    def test_each_guest_unique(self, client):
        r1 = client.post("/auth/guest")
        r2 = client.post("/auth/guest")
        assert r1.json()["user"]["username"] != r2.json()["user"]["username"]


# ── /auth/me ──────────────────────────────────────────────────────────────────

class TestMe:
    def test_returns_current_user(self, client, registered_user, auth_headers):
        r = client.get("/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == registered_user["user"]["username"]
        assert data["is_guest"] is False

    def test_unauthenticated(self, client):
        r = client.get("/auth/me")
        assert r.status_code == 401

    def test_invalid_token(self, client):
        r = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401
