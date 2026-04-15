"""Admin endpoints: login and stats dashboard."""
import os


ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "bass_admin_2026")


def _admin_headers(client):
    r = client.post("/admin/login", json={"secret": ADMIN_SECRET})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestAdminLogin:
    def test_correct_secret(self, client):
        r = client.post("/admin/login", json={"secret": ADMIN_SECRET})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_wrong_secret(self, client):
        r = client.post("/admin/login", json={"secret": "wrong"})
        assert r.status_code == 401

    def test_missing_secret(self, client):
        r = client.post("/admin/login", json={})
        assert r.status_code == 401


class TestAdminStats:
    def test_requires_admin_token(self, client):
        r = client.get("/admin/stats")
        assert r.status_code == 401

    def test_rejects_user_token(self, client, auth_headers):
        r = client.get("/admin/stats", headers=auth_headers)
        assert r.status_code == 401

    def test_returns_overview(self, client):
        headers = _admin_headers(client)
        r = client.get("/admin/stats", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert "overview" in data
        ov = data["overview"]
        assert "total_users" in ov
        assert "total_sessions" in ov
        assert "guest_users" in ov

    def test_overview_counts_users(self, client):
        client.post("/auth/register", json={"username": "u1", "password": "pass123"})
        client.post("/auth/register", json={"username": "u2", "password": "pass123"})
        client.post("/auth/guest")

        headers = _admin_headers(client)
        r = client.get("/admin/stats", headers=headers)
        data = r.json()["overview"]
        assert data["total_users"] >= 3
        assert data["guest_users"] >= 1
        assert data["registered_users"] >= 2

    def test_users_table_present(self, client):
        headers = _admin_headers(client)
        r = client.get("/admin/stats", headers=headers)
        assert "users" in r.json()
        assert isinstance(r.json()["users"], list)
