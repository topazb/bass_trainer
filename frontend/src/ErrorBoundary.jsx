import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg)", padding: 24,
      }}>
        <div style={{
          maxWidth: 420, width: "100%", background: "var(--surface)",
          border: "1px solid #ff4d4d44", borderRadius: 14,
          padding: "28px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#0d0d0d",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
