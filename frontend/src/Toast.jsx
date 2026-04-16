import { useState, useCallback, useRef, createContext, useContext } from "react";

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const toast = useCallback((message, type = "error", duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-4), { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", gap: 8,
        alignItems: "center", zIndex: 9999, pointerEvents: "none",
        width: "calc(100% - 32px)", maxWidth: 420,
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.4,
              cursor: "pointer",
              pointerEvents: "all",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              animation: "toast-in 0.2s ease",
              background: t.type === "error"   ? "#3d1010" :
                          t.type === "success" ? "#0f2d1a" : "#1a1a2e",
              color:      t.type === "error"   ? "#ff8080" :
                          t.type === "success" ? "#6dffaa" : "#a0a0ff",
              border: `1px solid ${
                t.type === "error"   ? "#ff4d4d44" :
                t.type === "success" ? "#47ffb344" : "#6060ff44"
              }`,
            }}
          >
            {t.type === "error" ? "✕  " : t.type === "success" ? "✓  " : "!  "}
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
