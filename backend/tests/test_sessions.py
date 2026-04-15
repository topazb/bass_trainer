"""Practice session endpoints."""
import pytest


class TestStartSession:
    def test_start_returns_session_and_program(self, client, auth_headers):
        r = client.post(
            "/sessions",
            json={"program_id": "30min_full_bass"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert "session_id" in data
        assert isinstance(data["session_id"], int)
        assert data["program"]["id"] == "30min_full_bass"
        assert len(data["program"]["blocks"]) == 5

    def test_unauthenticated(self, client):
        r = client.post("/sessions", json={"program_id": "30min_full_bass"})
        assert r.status_code == 401


class TestCompleteSession:
    def test_complete_basic(self, client, auth_headers, started_session):
        sid = started_session["session_id"]
        r = client.post(
            f"/sessions/{sid}/complete",
            json={"duration_seconds": 1800, "completed": True, "blocks_completed": 5},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_complete_with_quiz_results(self, client, auth_headers, started_session):
        sid = started_session["session_id"]
        r = client.post(
            f"/sessions/{sid}/complete",
            json={
                "duration_seconds": 900,
                "completed": False,
                "blocks_completed": 2,
                "quiz_results": [
                    {"quiz_type": "fretboard",    "correct": 8, "total": 10},
                    {"quiz_type": "ear_training", "correct": 3, "total": 5, "difficulty": "simple"},
                ],
            },
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_complete_skips_zero_total_quiz(self, client, auth_headers, started_session):
        """Quiz results with total=0 should be ignored."""
        sid = started_session["session_id"]
        r = client.post(
            f"/sessions/{sid}/complete",
            json={
                "duration_seconds": 300,
                "completed": False,
                "blocks_completed": 1,
                "quiz_results": [{"quiz_type": "fretboard", "correct": 0, "total": 0}],
            },
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_complete_wrong_session(self, client, auth_headers):
        r = client.post(
            "/sessions/99999/complete",
            json={"duration_seconds": 0, "completed": False, "blocks_completed": 0},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_complete_unauthenticated(self, client, started_session):
        sid = started_session["session_id"]
        r = client.post(f"/sessions/{sid}/complete", json={"duration_seconds": 0})
        assert r.status_code == 401


class TestStats:
    def test_empty_stats(self, client, auth_headers):
        r = client.get("/stats", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total_sessions"] == 0
        assert data["total_seconds"] == 0
        assert "current_streak" in data
        assert "best_streak" in data

    def test_stats_after_session(self, client, auth_headers, started_session):
        sid = started_session["session_id"]
        client.post(
            f"/sessions/{sid}/complete",
            json={
                "duration_seconds": 1800,
                "completed": True,
                "blocks_completed": 5,
                "quiz_results": [
                    {"quiz_type": "fretboard", "correct": 7, "total": 10},
                ],
            },
            headers=auth_headers,
        )
        r = client.get("/stats", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total_sessions"] == 1
        assert data["total_seconds"] == 1800
        assert data["fretboard"]["accuracy"] == pytest.approx(70.0)

    def test_stats_unauthenticated(self, client):
        r = client.get("/stats")
        assert r.status_code == 401
