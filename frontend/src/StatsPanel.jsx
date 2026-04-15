import { useEffect, useState } from "react";
import { api, fmtTime } from "./api.js";

export default function StatsPanel({ token, user, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getStats(token)
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        {/* Header */}
        <div style={s.panelHeader}>
          <div>
            <p style={s.panelTitle}>Your Stats</p>
            {stats && (
              <p style={s.panelSub}>@{user.username} · member since {stats.member_since}</p>
            )}
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.scroll}>
          {loading && <p style={s.muted}>Loading...</p>}
          {error   && <p style={{ color: "#ff6b6b", fontSize: 14 }}>Failed to load stats</p>}

          {stats && (
            <>
              {/* Big 3 cards */}
              <div style={s.bigRow}>
                <StatCard
                  label="Streak"
                  value={stats.current_streak}
                  unit="days"
                  sub={`best: ${stats.best_streak}`}
                  accent="#e8ff47"
                  icon="🔥"
                />
                <StatCard
                  label="Total time"
                  value={fmtTime(stats.total_seconds)}
                  unit=""
                  sub={`${stats.completed_sessions} full sessions`}
                  accent="#47ffb3"
                  icon="⏱"
                />
                <StatCard
                  label="Sessions"
                  value={stats.total_sessions}
                  unit=""
                  sub={`${stats.completed_sessions} completed`}
                  accent="#47b3ff"
                  icon="✅"
                />
              </div>

              {/* Consistency bar */}
              <Section title="This Month">
                <div style={s.consistencyRow}>
                  <span style={s.muted}>Consistency</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: consistencyColor(stats.consistency_pct) }}>
                    {stats.consistency_pct}%
                  </span>
                </div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${stats.consistency_pct}%`, background: consistencyColor(stats.consistency_pct) }} />
                </div>
              </Section>

              {/* Time breakdown table */}
              <Section title="Practice Volume">
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}></th>
                      <th style={s.th}>Sessions</th>
                      <th style={s.th}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["This week",  stats.this_week],
                      ["This month", stats.this_month],
                      ["This year",  stats.this_year],
                    ].map(([label, d]) => (
                      <tr key={label}>
                        <td style={s.td}>{label}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{d.sessions}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{fmtTime(d.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              {/* Skill accuracy */}
              <Section title="Skill Accuracy">
                <AccuracyBar
                  label="Fretboard"
                  data={stats.fretboard}
                  color="#47b3ff"
                />
                <div style={{ height: 12 }} />
                <AccuracyBar
                  label="Ear Training"
                  data={stats.ear_training}
                  color="#ff8c47"
                />
                {stats.ear_training.by_difficulty && Object.keys(stats.ear_training.by_difficulty).length > 0 && (
                  <div style={s.diffRow}>
                    {Object.entries(stats.ear_training.by_difficulty).map(([diff, d]) => (
                      <div key={diff} style={s.diffChip}>
                        <span style={{ ...s.muted, fontSize: 11, textTransform: "capitalize" }}>{diff}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#ff8c47" }}>
                          {d.accuracy}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recent sessions */}
              {stats.recent_sessions.length > 0 && (
                <Section title="Recent Sessions">
                  {stats.recent_sessions.map((s, i) => (
                    <div key={i} style={row.wrap}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 14 }}>{s.completed ? "✅" : "⚠️"}</span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{s.date}</span>
                        {s.blocks_completed > 0 && (
                          <span style={{ ...row.chip, background: "#47b3ff18", color: "#47b3ff" }}>
                            {s.blocks_completed} blocks
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "var(--text-muted)" }}>
                        {fmtTime(s.duration_seconds)}
                      </span>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, unit, sub, accent, icon }) {
  return (
    <div style={{ ...s.card, borderColor: accent + "33" }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <p style={{ fontSize: 26, fontWeight: 700, color: accent, letterSpacing: "-1px", margin: "4px 0 0" }}>
        {value}{unit && <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 2 }}>{unit}</span>}
      </p>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }}>{sub}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <p style={s.sectionTitle}>{title}</p>
      {children}
    </div>
  );
}

function AccuracyBar({ label, data, color }) {
  const pct = data.accuracy || 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color }}>
          {pct}% <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({data.total} questions)</span>
        </span>
      </div>
      <div style={s.barTrack}>
        <div style={{ ...s.barFill, width: `${pct}%`, background: color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function consistencyColor(pct) {
  if (pct >= 70) return "#47ff7a";
  if (pct >= 40) return "#e8ff47";
  return "#ff8c47";
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  panelTitle: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" },
  panelSub:   { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  closeBtn: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: 6,
    width: 32, height: 32,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  scroll: { overflowY: "auto", padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 20 },
  bigRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  card: {
    background: "var(--bg)",
    border: "1px solid",
    borderRadius: 10,
    padding: "12px 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 1,
  },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-muted)" },
  consistencyRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  barTrack: { height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" },
  barFill:  { height: "100%", borderRadius: 3, transition: "width 0.6s ease" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textAlign: "right", paddingBottom: 6, letterSpacing: "0.5px" },
  td: { fontSize: 14, padding: "7px 0", borderBottom: "1px solid var(--border)" },
  tdNum: { textAlign: "right", fontFamily: "'Space Mono', monospace", color: "var(--text)" },
  diffRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  diffChip: {
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "var(--bg)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "6px 14px",
  },
  muted: { fontSize: 13, color: "var(--text-muted)" },
};

const row = {
  wrap: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  },
  chip: {
    fontSize: 11, fontWeight: 600,
    padding: "2px 8px", borderRadius: 99,
  },
};
