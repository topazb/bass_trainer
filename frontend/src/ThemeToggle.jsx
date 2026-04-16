import { useTheme } from "./utils.js";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
    >
      {/* Sun — lights up when light mode is active */}
      <svg className="theme-toggle-sun" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={!isDark ? "#f5a623" : "var(--text-muted)"}
        strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="2"  x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22"   x2="5.64"  y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="2"  y1="12" x2="4"  y2="12"/>
        <line x1="20" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78"  x2="5.64"  y2="18.36"/>
        <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
      </svg>

      {/* Track + knob — knob slides to the icon of the active mode */}
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: "relative",
        background: isDark ? "#4a4a4a" : "#d0d0d0",
        border: "1px solid var(--border)",
        transition: "background 0.2s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute",
          top: 2,
          left: isDark ? 16 : 2,   /* right side = dark (moon), left side = light (sun) */
          width: 14, height: 14, borderRadius: "50%",
          background: isDark ? "#c8d4e8" : "#f5a623",
          transition: "left 0.2s, background 0.2s",
        }}/>
      </div>

      {/* Moon — lights up when dark mode is active */}
      <svg className="theme-toggle-moon" width="13" height="13" viewBox="0 0 24 24"
        fill={isDark ? "#c8d4e8" : "none"}
        stroke={isDark ? "#c8d4e8" : "var(--text-muted)"}
        strokeWidth="2" strokeLinecap="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
  );
}
