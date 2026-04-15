"""Health-check and program listing endpoints."""


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_programs(client):
    r = client.get("/programs")
    assert r.status_code == 200
    programs = r.json()
    assert isinstance(programs, list)
    assert len(programs) == 1
    assert programs[0]["id"] == "30min_full_bass"
    assert programs[0]["duration"] == 30


def test_get_program_30(client):
    r = client.get("/programs/30")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "30min_full_bass"
    assert len(data["blocks"]) == 5
    types = [b["type"] for b in data["blocks"]]
    assert types == ["fretboard", "technique", "rhythm", "improv", "fun"]


def test_get_program_unknown_duration(client):
    r = client.get("/programs/99")
    assert r.status_code == 404


def test_auth_providers_no_google(client):
    """Google is not configured in the test env — should return false."""
    r = client.get("/auth/providers")
    assert r.status_code == 200
    assert r.json()["google"] is False
