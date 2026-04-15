import { useState, useEffect } from "react";
import { fmtTime } from "./api.js";

// ─── Admin App shell ──────────────────────────────────────────────────────────

export default function AdminApp() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("bt_admin_token"));
  const [loginError, setLoginError] = useState(null);
  const [secret, setSecret]         = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid secret");
      sessionStorage.setItem("bt_admin_token", data.token);
      setAdminToken(data.token);
    } catch (err) {
      setLoginError(err.message);
    }
  }

  if (!adminToken) {
    return (
      <div style={a.loginOverlay}>
        <div style={a.loginCard}>
          <p style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🔐 Admin</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Bass Trainer BI Dashboard</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              style={a.input}
              type="password"
              placeholder="Admin secret"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              autoFocus
            />
            {loginError && <p style={{ color: "#ff6b6b", fontSize: 13 }}>❌ {loginError}</p>}
            <button style={a.loginBtn} type="submit">Enter</button>
          </form>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
            Default secret: <code style={{ color: "var(--accent)" }}>bass_admin_2026</code>
          </p>
        </div>
      </div>
    );
  }

  return <AdminDashboard token={adminToken} onLogout={() => { sessionStorage.removeItem("bt_admin_token"); setAdminToken(null); }} />;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function AdminDashboard({ token, onLogout }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("sessions");
  const [sortDir, setSortDir] = useState(-1);
  const [filter, setFilter]   = useState("all"); // all | guests | registered

  useEffect(() => {
    fetch("/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => { sessionStorage.removeItem("bt_admin_token"); onLogout(); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div style={a.root}><p style={{ padding: 40, color: "var(--text-muted)" }}>Loading...</p></div>;
  if (!data)   return null;

  const { overview, sessions_per_day, new_users_per_day, users, skills } = data;

  const retention = overview.total_users > 0
    ? Math.round(overview.retained_users / overview.total_users * 100)
    : 0;

  const filteredUsers = users
    .filter(u => filter === "all" || (filter === "guests" ? u.is_guest : !u.is_guest))
    .sort((a, b) => {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return typeof av === "string" ? av.localeCompare(bv) * sortDir : (av - bv) * sortDir;
    });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  return (
    <div style={a.root}>
      {/* Header */}
      <header style={a.header}>
        <div>
          <span style={{ fontSize: 17, fontWeight: 700 }}>🎸 Bass Trainer</span>
          <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 10 }}>Admin Dashboard</span>
        </div>
        <button style={a.logoutBtn} onClick={onLogout}>Logout</button>
      </header>

      <div style={a.content}>
        {/* Overview cards */}
        <Section title="Overview">
          <div style={a.cards}>
            <Card label="Total Users"    value={overview.total_users}        color="#47b3ff" />
            <Card label="Registered"     value={overview.registered_users}   color="#47ffb3" />
            <Card label="Guests"         value={overview.guest_users}        color="#e8ff47" />
            <Card label="Google Users"   value={overview.google_users}       color="#b847ff" />
            <Card label="Total Sessions" value={overview.total_sessions}     color="#ff8c47" />
            <Card label="Total Time"     value={fmtTime(overview.total_seconds)} color="#47b3ff" />
            <Card label="Avg Session"    value={fmtTime(overview.avg_session_secs)} color="#47ffb3" />
            <Card label="Retention"      value={`${retention}%`}            color="#e8ff47" sub="came back >1x" />
            <Card label="Active (week)"  value={overview.active_this_week}  color="#ff8c47" />
            <Card label="Active (month)" value={overview.active_this_month} color="#b847ff" />
          </div>
        </Section>

        {/* Charts row */}
        <div style={a.chartsRow}>
          <Section title="Sessions per day (last 30 days)">
            <BarChart data={sessions_per_day} color="#e8ff47" />
          </Section>
          <Section title="New users per day (last 30 days)">
            <BarChart data={new_users_per_day} color="#47b3ff" />
          </Section>
        </div>

        {/* Skills */}
        <Section title="Global Skill Stats">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <SkillBar label="Fretboard accuracy"    data={skills.fretboard}    color="#47b3ff" />
            <SkillBar label="Ear Training accuracy" data={skills.ear_training} color="#ff8c47" />
          </div>
        </Section>

        {/* Users table */}
        <Section title={`Users (${filteredUsers.length})`}>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["all", "registered", "guests"].map(f => (
              <button key={f} style={{ ...a.filterBtn, ...(filter === f ? a.filterActive : {}) }} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={a.table}>
              <thead>
                <tr>
                  {[
                    { key: "username",      label: "User" },
                    { key: "sessions",      label: "Sessions" },
                    { key: "total_seconds", label: "Time" },
                    { key: "streak",        label: "Streak" },
                    { key: "fb_accuracy",   label: "Fretboard" },
                    { key: "ear_accuracy",  label: "Ear" },
                    { key: "last_seen",     label: "Last seen" },
                    { key: "joined",        label: "Joined" },
                  ].map(col => (
                    <th key={col.key} style={a.th} onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sortKey === col.key && <span style={{ marginLeft: 4 }}>{sortDir === -1 ? "↓" : "↑"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={a.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                        {u.is_guest   && <Tag color="#e8ff47">guest</Tag>}
                        {u.has_google && <Tag color="#4285F4">G</Tag>}
                      </div>
                    </td>
                    <td style={{ ...a.td, ...a.num }}>{u.sessions}</td>
                    <td style={{ ...a.td, ...a.num }}>{fmtTime(u.total_seconds)}</td>
                    <td style={{ ...a.td, ...a.num }}>{u.streak > 0 ? `🔥 ${u.streak}` : "—"}</td>
                    <td style={{ ...a.td, ...a.num }}>{u.fb_accuracy  != null ? <AccPct v={u.fb_accuracy}  /> : "—"}</td>
                    <td style={{ ...a.td, ...a.num }}>{u.ear_accuracy != null ? <AccPct v={u.ear_accuracy} /> : "—"}</td>
                    <td style={{ ...a.td, ...a.muted }}>{u.last_seen}</td>
                    <td style={{ ...a.td, ...a.muted }}>{u.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={a.section}>
      <p style={a.sectionTitle}>{title}</p>
      {children}
    </div>
  );
}

function Card({ label, value, color, sub }) {
  return (
    <div style={{ ...a.card, borderColor: color + "33" }}>
      <p style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.5px" }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>{sub}</p>}
    </div>
  );
}

function BarChart({ data, color }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const barW = 12, gap = 3, chartH = 60;
  const totalW = data.length * (barW + gap);
  // Show only every 5th label
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={totalW} height={chartH + 22} style={{ display: "block" }}>
        {data.map((d, i) => {
          const h = Math.max((d.count / max) * chartH, d.count > 0 ? 3 : 0);
          return (
            <g key={i}>
              <rect x={i * (barW + gap)} y={chartH - h} width={barW} height={h} fill={color} rx={2} opacity={0.85} />
              {i % 5 === 0 && (
                <text x={i * (barW + gap) + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={8} fill="#555">
                  {d.date.split(" ")[1]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SkillBar({ label, data, color }) {
  const pct = data.accuracy || 0;
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color }}>
          {pct}% <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({data.total} Qs)</span>
        </span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s" }} />
      </div>
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: color + "22", color, border: `1px solid ${color}44` }}>
      {children}
    </span>
  );
}

function AccPct({ v }) {
  const color = v >= 70 ? "#47ff7a" : v >= 50 ? "#e8ff47" : "#ff8c47";
  return <span style={{ color, fontWeight: 600 }}>{v}%</span>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const a = {
  root: { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Space Grotesk', sans-serif" },
  header: { padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logoutBtn: { padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" },
  content: { padding: "24px", display: "flex", flexDirection: "column", gap: 28, maxWidth: 1200, margin: "0 auto" },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-muted)" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 },
  card: { background: "var(--surface)", border: "1px solid", borderRadius: 10, padding: "12px 14px" },
  chartsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", verticalAlign: "middle" },
  num: { fontFamily: "'Space Mono', monospace", textAlign: "right" },
  muted: { color: "var(--text-muted)", fontSize: 12 },
  filterBtn: { padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" },
  filterActive: { background: "var(--accent)", color: "#0d0d0d", borderColor: "var(--accent)" },

  // Login
  loginOverlay: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" },
  loginCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "32px 28px", width: "100%", maxWidth: 320, textAlign: "center" },
  input: { padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%" },
  loginBtn: { padding: "11px", borderRadius: 8, background: "var(--accent)", color: "#0d0d0d", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", width: "100%" },
};
