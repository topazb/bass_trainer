"""
Bass Trainer – Load Test (Locust)

Run locally (interactive web UI):
  locust -f locustfile.py --host http://localhost:8000

Run headless (CI / quick check):
  locust -f locustfile.py --headless -u 20 -r 5 -t 60s \
         --host http://localhost:8000 \
         --html report.html --exit-code-on-error 1

Targets the FastAPI backend directly (not through Nginx).
"""

import random
import string

from locust import HttpUser, between, events, task


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rand_user() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"lt_{suffix}"


# ---------------------------------------------------------------------------
# User classes
# ---------------------------------------------------------------------------

class GuestUser(HttpUser):
    """Simulates an anonymous visitor doing a practice session."""

    weight = 3          # 60 % of simulated users
    wait_time = between(1, 4)

    token: str | None = None
    session_id: str | None = None

    def on_start(self):
        resp = self.client.post("/auth/guest", name="/auth/guest")
        if resp.status_code == 200:
            self.token = resp.json().get("token")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(4)
    def get_program(self):
        self.client.get("/programs/30min_full_bass", name="/programs/:id")

    @task(3)
    def start_session(self):
        if not self.token:
            return
        resp = self.client.post(
            "/sessions",
            json={"program_id": "30min_full_bass", "selected_blocks": None},
            headers=self._headers(),
            name="/sessions (start)",
        )
        if resp.status_code == 200:
            data = resp.json()
            self.session_id = data.get("session_id") or data.get("id")

    @task(2)
    def complete_session(self):
        if not (self.token and self.session_id):
            return
        self.client.post(
            f"/sessions/{self.session_id}/complete",
            json={"duration_seconds": random.randint(60, 1800), "completed": True, "blocks_completed": 5},
            headers=self._headers(),
            name="/sessions/:id/complete",
        )
        self.session_id = None

    @task(1)
    def health(self):
        self.client.get("/health")


class RegisteredUser(HttpUser):
    """Simulates a logged-in user that also checks stats."""

    weight = 2          # ~40 % of simulated users
    wait_time = between(2, 5)

    token: str | None = None
    username: str = ""
    session_id: str | None = None

    def on_start(self):
        self.username = _rand_user()
        # Register
        resp = self.client.post(
            "/auth/register",
            json={"username": self.username, "password": "loadtest123"},
            name="/auth/register",
        )
        if resp.status_code != 200:
            return
        # Login
        resp = self.client.post(
            "/auth/login",
            json={"username": self.username, "password": "loadtest123"},
            name="/auth/login",
        )
        if resp.status_code == 200:
            self.token = resp.json().get("token")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(3)
    def get_program(self):
        self.client.get("/programs/30min_full_bass", name="/programs/:id")

    @task(2)
    def start_and_complete_session(self):
        if not self.token:
            return
        resp = self.client.post(
            "/sessions",
            json={"program_id": "30min_full_bass", "selected_blocks": None},
            headers=self._headers(),
            name="/sessions (start)",
        )
        if resp.status_code != 200:
            return
        data = resp.json()
        sid = data.get("session_id") or data.get("id")
        if not sid:
            return
        self.client.post(
            f"/sessions/{sid}/complete",
            json={"duration_seconds": random.randint(120, 900), "completed": True, "blocks_completed": 5},
            headers=self._headers(),
            name="/sessions/:id/complete",
        )

    @task(2)
    def get_stats(self):
        if not self.token:
            return
        self.client.get("/stats", headers=self._headers(), name="/stats")

    @task(1)
    def health(self):
        self.client.get("/health")


# ---------------------------------------------------------------------------
# Thresholds – fail the CI job if SLA is breached
# ---------------------------------------------------------------------------

@events.quitting.add_listener
def assert_thresholds(environment, **_kw):
    stats = environment.stats.total
    if stats.num_requests == 0:
        return

    failure_rate = stats.num_failures / stats.num_requests
    p95          = stats.get_response_time_percentile(0.95)

    issues = []
    if failure_rate > 0.02:          # > 2 % errors → fail
        issues.append(f"failure rate {failure_rate:.1%} > 2 %")
    if p95 and p95 > 2_000:          # p95 > 2 s → fail
        issues.append(f"p95 response time {p95:.0f}ms > 2000ms")

    if issues:
        print(f"\n✕ Load-test SLA breached: {'; '.join(issues)}")
        environment.process_exit_code = 1
    else:
        print(f"\n✓ Load-test SLA passed  (failures={failure_rate:.1%}, p95={p95:.0f}ms)")
