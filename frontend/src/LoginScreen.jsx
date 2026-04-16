import { useState } from "react";
import { api } from "./api.js";
import ThemeToggle from "./ThemeToggle.jsx";

export default function LoginScreen({ onAuth, oauthError }) {
  const [mode, setMode]         = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = mode === "login"
        ? await api.login(username.trim(), password)
        : await api.register(username.trim(), password);
      localStorage.setItem("bt_token", data.token);
      localStorage.setItem("bt_user", JSON.stringify(data.user));
      onAuth(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    setGuestLoading(true);
    try {
      const res = await fetch("/auth/guest", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      localStorage.setItem("bt_token", data.token);
      localStorage.setItem("bt_user", JSON.stringify(data.user));
      onAuth(data.user, data.token);
    } catch {
      setError("Failed to start guest session");
    } finally {
      setGuestLoading(false);
    }
  }

  const visibleError = error || oauthError;

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={{ position: "absolute", top: 14, right: 14 }}>
          <ThemeToggle />
        </div>
        <div style={s.logoRow}>
          <span style={s.logo}>🎸</span>
          <span style={s.appName}>Bass Trainer</span>
        </div>

        {/* Guest CTA — most prominent */}
        <div style={s.guestBox}>
          <button
            style={{ ...s.guestBtn, opacity: guestLoading ? 0.7 : 1 }}
            onClick={handleGuest}
            disabled={guestLoading}
          >
            {guestLoading ? "Starting..." : "▶  Continue as Guest"}
          </button>
          <p style={s.guestNote}>No account needed · your progress is saved</p>
        </div>

        <div style={s.divider}>
          <div style={s.dividerLine} />
          <span style={s.dividerText}>or sign in</span>
          <div style={s.dividerLine} />
        </div>

        {/* Google Sign-In — always visible */}
        <button style={s.googleBtn} onClick={() => { window.location.href = "/auth/google"; }}>
          <GoogleIcon />
          Sign in with Google
        </button>

        <div style={s.divider}>
          <div style={s.dividerLine} />
          <span style={s.dividerText}>or use username</span>
          <div style={s.dividerLine} />
        </div>

        {/* Username/password tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(mode === "login"    ? s.tabActive : {}) }} onClick={() => { setMode("login");    setError(null); }}>Login</button>
          <button style={{ ...s.tab, ...(mode === "register" ? s.tabActive : {}) }} onClick={() => { setMode("register"); setError(null); }}>Create Account</button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          <label style={s.label}>Username</label>
          <input
            style={s.input}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="your name"
            autoComplete="username"
          />
          <label style={s.label}>Password</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {visibleError && <p style={s.error}>❌ {visibleError}</p>}

          <button style={{ ...s.submit, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

const s = {
  overlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "24px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    position: "relative",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 4 },
  logo:    { fontSize: 30 },
  appName: { fontSize: 21, fontWeight: 700, letterSpacing: "-0.5px" },

  guestBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  guestBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 10,
    background: "var(--accent)",
    color: "#0d0d0d",
    fontWeight: 700,
    fontSize: 16,
    border: "none",
    cursor: "pointer",
    letterSpacing: "-0.3px",
    transition: "opacity 0.15s",
  },
  guestNote: { fontSize: 12, color: "var(--text-muted)" },

  divider: { display: "flex", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, background: "var(--border)" },
  dividerText: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.5px" },

  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "11px 16px",
    borderRadius: 8,
    background: "#fff",
    color: "#3c4043",
    border: "1px solid #dadce0",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
  },

  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 4,
    background: "var(--bg)",
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    padding: "7px 0",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    background: "transparent",
    color: "var(--text-muted)",
    border: "none",
    cursor: "pointer",
  },
  tabActive: {
    background: "var(--surface)",
    color: "var(--text)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  form:  { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" },
  input: {
    padding: "10px 13px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 16,
    fontFamily: "inherit",
    outline: "none",
    marginBottom: 2,
    width: "100%",
  },
  error: { fontSize: 12, color: "#ff6b6b", margin: "2px 0" },
  submit: {
    marginTop: 2,
    padding: "11px",
    borderRadius: 7,
    background: "var(--border)",
    color: "var(--text)",
    fontWeight: 700,
    fontSize: 14,
    border: "1px solid var(--border)",
    cursor: "pointer",
  },
};
