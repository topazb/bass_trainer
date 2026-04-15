async function req(path, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export const api = {
  register:        (username, password)     => req("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login:           (username, password)     => req("/auth/login",    { method: "POST", body: JSON.stringify({ username, password }) }),
  me:              (token)                  => req("/auth/me", {}, token),
  startSession:    (token)                  => req("/sessions", { method: "POST", body: JSON.stringify({ program_id: "30min_full_bass" }) }, token),
  completeSession: (sessionId, data, token) => req(`/sessions/${sessionId}/complete`, { method: "POST", body: JSON.stringify(data) }, token),
  getStats:        (token)                  => req("/stats", {}, token),
  getProgram:      (duration)               => req(`/programs/${duration}`),
};

export function fmtTime(secs) {
  if (!secs || secs <= 0) return "0m";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
