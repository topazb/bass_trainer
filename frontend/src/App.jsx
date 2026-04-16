import { useEffect, useRef, useCallback, useReducer, useState } from "react";
import LoginScreen from "./LoginScreen.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import { useToast } from "./Toast.jsx";
import StatsPanel  from "./StatsPanel.jsx";
import AdminApp    from "./AdminPanel.jsx";
import { api, fmtTime } from "./api.js";
import {
  NOTES, STRINGS, OPEN_IDX, INTERVALS, DIFFICULTY_SETS,
  noteAt, randomFretQuestion, fretLabel,
  randomIntervalQuestion, midiToHz,
  pickRandom, getAudioSrc, cleanTrackName,
  formatTime, blockColor, useTheme,
} from "./utils.js";
import { IDLE, RUNNING, PAUSED, DONE, initialState, reducer } from "./sessionReducer.js";

// ─── Web Audio (tone playback only — not exported, stays local) ───────────────

function playTone(ctx, freq, startTime, duration) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.28, startTime + 0.04);
  gain.gain.setValueAtTime(0.28, startTime + duration - 0.06);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playIntervalTones(ctx, baseMidi, semitones, onDone) {
  const f1  = midiToHz(baseMidi);
  const f2  = midiToHz(baseMidi + semitones);
  const now = ctx.currentTime;
  const dur = 1.1, gap = 0.15;
  playTone(ctx, f1, now, dur);
  playTone(ctx, f2, now + dur + gap, dur);
  setTimeout(onDone, (dur * 2 + gap) * 1000 + 100);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Admin route — render the BI dashboard instead of the main app
  if (window.location.pathname === "/admin") return <AdminApp />;

  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();

  // Auth
  const [user,       setUser]       = useState(() => { try { return JSON.parse(localStorage.getItem("bt_user")); } catch { return null; } });
  const [token,      setToken]      = useState(() => localStorage.getItem("bt_token") || null);
  const [showStats,  setShowStats]  = useState(false);
  const [oauthError, setOauthError] = useState(null);

  // Handle redirect back from Google OAuth (?token=...&username=... or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("token");
    const usr = params.get("username");
    const err = params.get("error");
    if (tok && usr) {
      const newUser = { username: decodeURIComponent(usr) };
      localStorage.setItem("bt_token", tok);
      localStorage.setItem("bt_user", JSON.stringify(newUser));
      setUser(newUser);
      setToken(tok);
      window.history.replaceState({}, "", "/");
    } else if (err) {
      setOauthError(decodeURIComponent(err.replace(/\+/g, " ")));
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Session
  const [state, dispatch]  = useReducer(reducer, undefined, initialState);
  const [sessionDone, setSessionDone] = useState(null);
  const [audioPlaying,  setAudioPlaying]  = useState(false);
  const [currentTrack,  setCurrentTrack]  = useState(null);
  const audioRef           = useRef(null);
  const currentTrackFileRef = useRef(null);
  const timerRef           = useRef(null);
  const tokenRef           = useRef(token);
  const sessionIdRef       = useRef(null);
  const sessionStartRef    = useRef(null);
  const quizScoresRef      = useRef({});

  useEffect(() => { tokenRef.current = token; }, [token]);

  const currentBlock = state.program?.blocks[state.blockIndex] ?? null;

  // ── Auth handlers ──
  function handleAuth(newUser, newToken) {
    setUser(newUser);
    setToken(newToken);
  }

  function handleLogout() {
    if (state.phase === RUNNING || state.phase === PAUSED) {
      reportSessionEnd(false);
    }
    localStorage.removeItem("bt_token");
    localStorage.removeItem("bt_user");
    setUser(null);
    setToken(null);
    clearTimer();
    stopAudio();
    dispatch({ type: "RESET" });
  }

  // ── Session reporting ──
  async function reportSessionEnd(completed) {
    const sid = sessionIdRef.current;
    const tok = tokenRef.current;
    if (!sid || !tok) return;
    const durationSeconds = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    const blocksCompleted = completed
      ? (state.program?.blocks.length || 5)
      : state.blockIndex;
    const quizResults = Object.entries(quizScoresRef.current)
      .filter(([, v]) => v?.total > 0)
      .map(([quiz_type, data]) => ({ quiz_type, ...data }));
    sessionIdRef.current = null;
    try {
      await api.completeSession(sid, { duration_seconds: durationSeconds, completed, blocks_completed: blocksCompleted, quiz_results: quizResults }, tok);
    } catch (err) {
      console.error("[completeSession] failed to save session:", err);
      // non-blocking — session already happened, just couldn't save stats
    }
  }

  // ── Audio ──
  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    currentTrackFileRef.current = null;
    setAudioPlaying(false);
    setCurrentTrack(null);
  }, []);

  const startAudio = useCallback((block, excludeFile = null) => {
    stopAudio();
    const src = getAudioSrc(block, excludeFile);
    if (!src) return;
    const file = decodeURIComponent(src.split("/").pop());
    currentTrackFileRef.current = file;
    setCurrentTrack(cleanTrackName(file));
    const audio = new Audio(src);
    audio.loop    = block.config?.loop ?? false;
    audio.volume  = 0.75;
    audio.onplaying = () => setAudioPlaying(true);
    audio.onpause   = () => setAudioPlaying(false);
    audio.onended   = () => setAudioPlaying(false);
    audio.play().catch(() => {});
    audioRef.current = audio;
    setAudioPlaying(true);
  }, [stopAudio]);

  function toggleMusic() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) { audioRef.current.play().catch(() => {}); setAudioPlaying(true); }
    else                         { audioRef.current.pause();                 setAudioPlaying(false); }
  }

  function nextTrack() {
    if (currentBlock) startAudio(currentBlock, currentTrackFileRef.current);
  }

  // ── Timer ──
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
  }, [clearTimer]);

  // Auto-advance block when timer hits 0
  useEffect(() => {
    if (state.phase === RUNNING && state.secondsLeft === 0) dispatch({ type: "NEXT_BLOCK" });
  }, [state.phase, state.secondsLeft]);

  // React to phase/block changes
  useEffect(() => {
    if (state.phase === RUNNING) {
      startTimer();
      if (currentBlock) startAudio(currentBlock);
    } else {
      clearTimer();
      stopAudio();
    }
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.blockIndex]);

  // Session done — report + capture summary
  useEffect(() => {
    if (state.phase === DONE) {
      const dur = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      setSessionDone({ durationSeconds: dur, scores: { ...quizScoresRef.current } });
      reportSessionEnd(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => () => { clearTimer(); stopAudio(); }, [clearTimer, stopAudio]);

  // ── Actions ──
  // userBlocks: [{ type, title, enabled, duration }] from IdleScreen
  async function handleStart(userBlocks) {
    sessionStartRef.current = Date.now();
    quizScoresRef.current   = {};
    setSessionDone(null);

    const applyConfig = (fullProgram) => {
      const finalBlocks = userBlocks
        .filter(b => b.enabled)
        .map(b => {
          const full = fullProgram.blocks.find(fb => fb.type === b.type) || b;
          return { ...full, duration: b.duration };
        });
      return { ...fullProgram, blocks: finalBlocks };
    };

    try {
      if (tokenRef.current) {
        const data = await api.startSession(tokenRef.current);
        sessionIdRef.current = data.session_id;
        dispatch({ type: "START", program: applyConfig(data.program) });
      } else {
        const base = await api.getProgram(30);
        sessionIdRef.current = null;
        dispatch({ type: "START", program: applyConfig(base) });
      }
    } catch (err) {
      console.error("[handleStart] session start failed:", err);
      try {
        const base = await api.getProgram(30);
        sessionIdRef.current = null;
        dispatch({ type: "START", program: applyConfig(base) });
      } catch (err2) {
        console.error("[handleStart] program load failed:", err2);
        toast("Failed to load program. Check your connection and try again.", "error");
      }
    }
  }

  function handlePauseResume()    { dispatch({ type: state.phase === RUNNING ? "PAUSE" : "RESUME" }); }
  function handleNext()           { dispatch({ type: "NEXT_BLOCK" }); }
  function handlePrev()           { dispatch({ type: "PREV_BLOCK" }); }
  function handleAdjustTime(delta){ dispatch({ type: "ADJUST_TIME", delta }); }

  function handleReset() {
    if (state.phase === RUNNING || state.phase === PAUSED) reportSessionEnd(false);
    clearTimer();
    stopAudio();
    dispatch({ type: "RESET" });
  }

  // ── Quiz score callbacks ──
  function onFretboardScore(score)    { quizScoresRef.current.fretboard    = score; }
  function onEarTrainingScore(score)  { quizScoresRef.current.ear_training = score; }

  // ── Render ──
  if (!user) return <LoginScreen onAuth={handleAuth} oauthError={oauthError} />;

  return (
    <div style={styles.root}>
      <header style={styles.header} className="hdr">
        <span style={styles.logo}>Bass Trainer</span>
        <div className="hdr-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="hdr-username" style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {user.username}
            {user.is_guest && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#e8ff4722", color: "#e8ff47", border: "1px solid #e8ff4744" }}>
                guest
              </span>
            )}
          </span>
          {!user.is_guest && <button className="hdr-btn" style={styles.headerBtn} onClick={() => setShowStats(true)}>Stats</button>}
          <ThemeToggle />
          <button className="hdr-btn" style={{ ...styles.headerBtn, color: "#ff6b6b" }} onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main style={styles.main} className="main">
        {state.phase === IDLE && <IdleScreen onStart={handleStart} />}
        {(state.phase === RUNNING || state.phase === PAUSED) && currentBlock && (
          <SessionScreen
            block={currentBlock}
            blockIndex={state.blockIndex}
            totalBlocks={state.program.blocks.length}
            secondsLeft={state.secondsLeft}
            totalSeconds={state.totalSeconds}
            paused={state.phase === PAUSED}
            onPauseResume={handlePauseResume}
            onNext={handleNext}
            onPrev={handlePrev}
            onStop={handleReset}
            onAdjustTime={handleAdjustTime}
            onFretboardScore={onFretboardScore}
            onEarTrainingScore={onEarTrainingScore}
            audioPlaying={audioPlaying}
            currentTrack={currentTrack}
            onMusicToggle={toggleMusic}
            onNextTrack={nextTrack}
          />
        )}
        {state.phase === DONE && (
          <DoneScreen onReset={handleReset} summary={sessionDone} />
        )}
      </main>

      {showStats && <StatsPanel token={token} user={user} onClose={() => setShowStats(false)} />}
    </div>
  );
}

// ─── Screens ──────────────────────────────────────────────────────────────────

// Default block config — mirrors programs.json
const DEFAULT_BLOCK_CONFIG = [
  { type: "fretboard", title: "Fretboard Mastery",  defaultDuration: 300 },
  { type: "technique", title: "Technique Practice", defaultDuration: 300 },
  { type: "rhythm",    title: "Rhythm Training",    defaultDuration: 300 },
  { type: "improv",    title: "Improvisation",      defaultDuration: 300 },
  { type: "fun",       title: "Learn a Song",       defaultDuration: 600 },
];

function loadSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("bt_block_config") || "null");
    if (Array.isArray(saved) && saved.length === DEFAULT_BLOCK_CONFIG.length) return saved;
  } catch {}
  return DEFAULT_BLOCK_CONFIG.map(b => ({ ...b, enabled: true, duration: b.defaultDuration }));
}

const idle = {
  list: {
    width: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  },
  toggle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "2px solid",
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  durChip: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid",
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    background: "var(--bg)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  editWrap: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  editInput: {
    width: 44,
    padding: "3px 6px",
    borderRadius: 6,
    border: "1px solid var(--accent)",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    outline: "none",
    textAlign: "center",
  },
  summary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "2px 0",
  },
  resetBtn: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "none",
    border: "none",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  soloBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
};

function IdleScreen({ onStart }) {
  const [blocks, setBlocks] = useState(loadSavedConfig);
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const editInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("bt_block_config", JSON.stringify(blocks));
  }, [blocks]);

  useEffect(() => {
    if (editing !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  const selected   = blocks.filter(b => b.enabled);
  const totalSecs  = selected.reduce((s, b) => s + b.duration, 0);
  const totalMins  = Math.round(totalSecs / 60);
  const isModified = blocks.some((b, i) =>
    b.duration !== DEFAULT_BLOCK_CONFIG[i].defaultDuration || !b.enabled
  );

  function toggleBlock(i) {
    setBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, enabled: !b.enabled } : b));
  }

  function startEdit(i) {
    if (editing !== null) commitEdit(editing);
    setEditing(i);
    setEditVal(String(Math.round(blocks[i].duration / 60)));
  }

  function commitEdit(i) {
    const mins = parseInt(editVal, 10);
    if (!isNaN(mins) && mins >= 1 && mins <= 99) {
      setBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, duration: mins * 60 } : b));
    }
    setEditing(null);
  }

  function handleEditKey(e, i) {
    if (e.key === "Enter")  { e.preventDefault(); commitEdit(i); }
    if (e.key === "Escape") setEditing(null);
  }

  function reset() {
    setBlocks(DEFAULT_BLOCK_CONFIG.map(b => ({ ...b, enabled: true, duration: b.defaultDuration })));
    setEditing(null);
  }

  function startLabel() {
    if (selected.length === 0) return "Select at least one block";
    if (selected.length === DEFAULT_BLOCK_CONFIG.length) return `Start Full Session \u00b7 ${totalMins} min`;
    if (selected.length === 1) return `Start ${selected[0].title} \u00b7 ${totalMins} min`;
    return `Start ${selected.length} Blocks \u00b7 ${totalMins} min`;
  }

  return (
    <div className="center-box" style={{ ...styles.centerBox, maxWidth: 500 }}>
      <h1 style={styles.idleTitle}>Ready to practice?</h1>

      <div style={idle.list}>
        {blocks.map((block, i) => {
          const color   = blockColor(block.type);
          const mins    = Math.round(block.duration / 60);
          const isDef   = block.duration === DEFAULT_BLOCK_CONFIG[i].defaultDuration;
          const isEditing = editing === i;

          return (
            <div
              className="idle-row"
              key={block.type}
              style={{ ...idle.row, opacity: block.enabled ? 1 : 0.4, borderBottom: i < blocks.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <button
                style={{ ...idle.toggle, background: block.enabled ? color : "var(--border)", borderColor: block.enabled ? color : "var(--border)" }}
                onClick={() => toggleBlock(i)}
                title={block.enabled ? "Disable" : "Enable"}
              >
                {block.enabled && <span style={{ fontSize: 11, fontWeight: 700, color: "#0d0d0d" }}>&#10003;</span>}
              </button>

              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />

              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{block.title}</span>

              {isEditing ? (
                <div style={idle.editWrap}>
                  <input
                    ref={editInputRef}
                    type="number"
                    min={1} max={99}
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={() => commitEdit(i)}
                    onKeyDown={e => handleEditKey(e, i)}
                    style={idle.editInput}
                    inputMode="numeric"
                  />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>min</span>
                </div>
              ) : (
                <button
                  style={{ ...idle.durChip, borderColor: isDef ? "var(--border)" : color, color: isDef ? "var(--text-muted)" : color }}
                  onClick={() => startEdit(i)}
                  title="Click to edit duration"
                >
                  {mins}&nbsp;min <span style={{ opacity: 0.4, fontSize: 10 }}>&#9999;</span>
                </button>
              )}

              {/* Quick-start: launch this block solo */}
              <button
                className="idle-solo"
                style={{ ...idle.soloBtn, background: color + "18", color, borderColor: color + "40" }}
                onClick={() => onStart([{ ...block, enabled: true }])}
                title={`Start ${block.title} only`}
              >
                &#9654;
              </button>
            </div>
          );
        })}
      </div>

      <div style={idle.summary}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {selected.length} of {blocks.length} blocks selected
          {selected.length > 0 && <> &middot; {totalMins} min total</>}
        </span>
        {isModified && (
          <button style={idle.resetBtn} onClick={reset}>Reset defaults</button>
        )}
      </div>

      <button
        style={{ ...styles.startBtn, opacity: selected.length === 0 ? 0.35 : 1, width: "100%" }}
        onClick={() => selected.length > 0 && onStart(blocks)}
        disabled={selected.length === 0}
      >
        {startLabel()}
      </button>
    </div>
  );
}

function SessionScreen({ block, blockIndex, totalBlocks, secondsLeft, totalSeconds, paused,
  onPauseResume, onNext, onPrev, onStop, onAdjustTime, onFretboardScore, onEarTrainingScore,
  audioPlaying, currentTrack, onMusicToggle, onNextTrack }) {

  const [adjusting, setAdjusting] = useState(false);

  const progress      = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const color         = blockColor(block.type);
  const R             = 68;
  const circumference = 2 * Math.PI * R;
  const dashOffset    = circumference * (1 - progress);
  const hasAudio      = (block.type === "rhythm" || block.type === "improv") && block.config?.tracks?.length > 0;
  const overallPct    = ((blockIndex + (1 - progress)) / totalBlocks) * 100;

  return (
    <div style={ses.wrap} className="session-wrap">
      {/* Overall progress bar */}
      <div style={ses.progressTrack}>
        <div style={{ ...ses.progressFill, width: `${overallPct}%`, background: color }} />
      </div>

      {/* Block dots + label */}
      <div style={ses.topRow}>
        <span style={ses.blockLabel}>Block {blockIndex + 1} / {totalBlocks}</span>
        <div style={ses.dots}>
          {Array.from({ length: totalBlocks }).map((_, i) => (
            <div key={i} style={{
              width: i === blockIndex ? 20 : 8, height: 8, borderRadius: 4,
              background: i <= blockIndex ? color : "var(--border)",
              opacity: i === blockIndex ? 1 : i < blockIndex ? 0.5 : 0.18,
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>
      </div>

      {/* Type badge */}
      <div style={{ ...ses.badge, background: color + "18", color, borderColor: color + "40" }}>
        {block.type.toUpperCase()}
      </div>

      {/* Title */}
      <h2 style={ses.title}>{block.title}</h2>

      {/* Timer ring — click to adjust */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
          style={{ ...ses.timerWrap, cursor: "pointer" }}
          onClick={() => setAdjusting(a => !a)}
          title="Click to adjust time"
        >
          <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--border)" strokeWidth="7" />
            <circle cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.9s linear", filter: `drop-shadow(0 0 8px ${color}66)` }} />
          </svg>
          <div style={ses.timerText}>{formatTime(secondsLeft)}</div>
          {paused && !adjusting && <div style={ses.pausedBadge}>PAUSED</div>}
          {!adjusting && <div style={ses.timerHint}>&#9999;</div>}
        </div>

        {/* Time adjustment controls */}
        {adjusting && (
          <div className="adjust-row" style={ses.adjustRow}>
            <button
              className="adjust-btn"
              style={{ ...ses.adjustBtn, opacity: secondsLeft <= 10 ? 0.3 : 1 }}
              onClick={e => { e.stopPropagation(); onAdjustTime(-60); }}
              disabled={secondsLeft <= 10}
            >
              − 1 min
            </button>
            <span style={ses.adjustHint}>tap timer to close</span>
            <button
              className="adjust-btn"
              style={ses.adjustBtn}
              onClick={e => { e.stopPropagation(); onAdjustTime(+60); }}
            >
              + 1 min
            </button>
          </div>
        )}
      </div>

      {/* Music player — rhythm & improv only */}
      {hasAudio && (
        <div className="music-card" style={{ ...ses.musicCard, borderColor: color + "40" }}>
          <div style={ses.musicInfo}>
            <span style={ses.musicLabel}>&#9835; NOW PLAYING</span>
            <span style={ses.musicName}>{currentTrack || "Loading…"}</span>
          </div>
          <div className="music-btns" style={ses.musicBtns}>
            <button
              className="music-btn"
              style={{ ...ses.musicBtn, background: color + "18", color, borderColor: color + "44" }}
              onClick={onMusicToggle}
            >
              {audioPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button className="music-btn" style={ses.musicBtnGhost} onClick={onNextTrack}>
              &#8635; Next track
            </button>
          </div>
        </div>
      )}

      {/* Block content */}
      {block.type === "fretboard" && (
        <FretboardQuiz color={color} paused={paused} onScoreChange={onFretboardScore} />
      )}
      {block.type === "technique" && (
        <EarTrainingQuiz color={color} paused={paused} onScoreChange={onEarTrainingScore} />
      )}
      {block.type !== "fretboard" && block.type !== "technique" && (
        <ul style={ses.instructions}>
          {block.instructions.map((line, i) => (
            <li key={i} style={ses.instrItem}>
              <span style={{ color, marginRight: 8, fontSize: 13, flexShrink: 0 }}>▸</span>
              {line}
            </li>
          ))}
        </ul>
      )}

      {/* Primary controls */}
      <div className="ctrl-row" style={ses.controls}>
        <button
          className="ctrl-btn"
          style={{ ...ses.ctrlBtn, opacity: blockIndex === 0 ? 0.28 : 1 }}
          onClick={onPrev}
          disabled={blockIndex === 0}
          title="Previous block"
        >
          ← Prev
        </button>
        <button
          className="ctrl-btn-main"
          style={{ ...ses.ctrlBtnMain, background: color, color: "#0d0d0d" }}
          onClick={onPauseResume}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button className="ctrl-btn" style={ses.ctrlBtn} onClick={onNext}>
          Next →
        </button>
      </div>

      {/* End session — subtle link */}
      <button style={ses.endLink} onClick={onStop}>End session</button>
    </div>
  );
}

const ses = {
  wrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 14, width: "100%", maxWidth: 560, padding: "4px 16px 16px",
  },
  progressTrack: { width: "100%", height: 3, background: "var(--border)", borderRadius: 2 },
  progressFill:  { height: "100%", borderRadius: 2, transition: "width 0.6s ease" },
  topRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
  },
  blockLabel: { fontSize: 12, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.4px" },
  dots: { display: "flex", gap: 5, alignItems: "center" },
  badge: {
    padding: "4px 13px", borderRadius: 99, fontSize: 10, fontWeight: 700,
    letterSpacing: "1.8px", border: "1px solid",
  },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", textAlign: "center" },
  timerWrap: {
    position: "relative", display: "flex", alignItems: "center",
    justifyContent: "center", width: 160, height: 160,
  },
  timerText: {
    position: "absolute", fontFamily: "'Space Mono', monospace",
    fontSize: 32, fontWeight: 700, letterSpacing: "-1.5px",
  },
  pausedBadge: {
    position: "absolute", bottom: 10, fontSize: 9, fontWeight: 700,
    letterSpacing: "2.5px", color: "var(--text-muted)", textTransform: "uppercase",
  },
  timerHint: {
    position: "absolute", bottom: 8, fontSize: 11, color: "var(--text-muted)", opacity: 0.4,
  },
  adjustRow: {
    display: "flex", alignItems: "center", gap: 10,
  },
  adjustBtn: {
    padding: "8px 18px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 700,
    cursor: "pointer", letterSpacing: "-0.2px",
  },
  adjustHint: {
    fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.3px",
  },
  musicCard: {
    width: "100%", background: "var(--surface)", border: "1px solid",
    borderRadius: 12, padding: "14px 16px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  musicInfo:     { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 },
  musicLabel:    { fontSize: 9, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1.5px" },
  musicName:     { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  musicBtns:     { display: "flex", gap: 7, flexShrink: 0 },
  musicBtn: {
    padding: "7px 14px", borderRadius: 8, border: "1px solid",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  musicBtnGhost: {
    padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: "transparent", color: "var(--text-muted)",
  },
  instructions: {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", padding: "16px 18px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  instrItem: { display: "flex", alignItems: "flex-start", fontSize: 14, lineHeight: 1.55 },
  controls: { display: "flex", gap: 10, width: "100%", justifyContent: "center", marginTop: 2 },
  ctrlBtn: {
    padding: "12px 22px", borderRadius: "var(--radius)", fontWeight: 600, fontSize: 14,
    background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)",
    cursor: "pointer", transition: "opacity 0.2s",
  },
  ctrlBtnMain: {
    padding: "12px 0", borderRadius: "var(--radius)", fontWeight: 700, fontSize: 15,
    flex: 1, maxWidth: 180, border: "none", cursor: "pointer",
  },
  endLink: {
    fontSize: 12, color: "var(--text-muted)", background: "none", border: "none",
    cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, marginTop: -4,
  },
};

function DoneScreen({ onReset, summary }) {
  const dur = summary?.durationSeconds || 0;
  const fb  = summary?.scores?.fretboard;
  const ear = summary?.scores?.ear_training;

  const rows = [
    { label: "Time practiced", value: fmtTime(dur), color: "var(--accent)" },
    fb?.total  > 0 && { label: "Fretboard",    value: `${fb.correct} / ${fb.total}`,   color: "#47b3ff" },
    ear?.total > 0 && { label: "Ear Training", value: `${ear.correct} / ${ear.total}`, color: "#ff8c47" },
  ].filter(Boolean);

  return (
    <div className="center-box" style={{ ...styles.centerBox, gap: 20 }}>
      {/* Trophy ring */}
      <div style={done.ring}>
        <span style={{ fontSize: 36, lineHeight: 1 }}>&#10003;</span>
      </div>

      <div style={{ textAlign: "center" }}>
        <h1 style={{ ...styles.idleTitle, marginBottom: 6 }}>Session Complete</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Great work. Rest up and come back tomorrow.</p>
      </div>

      <div style={done.card}>
        {rows.map((r, i) => (
          <div key={i} style={{ ...done.row, borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
            <span style={done.label}>{r.label}</span>
            <span style={{ ...done.value, color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>

      <button style={{ ...styles.startBtn, width: "100%" }} onClick={onReset}>
        Back to Home
      </button>
    </div>
  );
}

const done = {
  ring: {
    width: 80, height: 80, borderRadius: "50%",
    background: "linear-gradient(135deg, #1a3a1a, #0d2a0d)",
    border: "2px solid #47ff7a55",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#47ff7a", fontWeight: 700, fontSize: 36,
    boxShadow: "0 0 24px #47ff7a22",
  },
  card:  { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" },
  row:   { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px" },
  label: { fontSize: 13, color: "var(--text-muted)" },
  value: { fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace" },
};

// ─── Fretboard Quiz ───────────────────────────────────────────────────────────

function FretboardQuiz({ color, paused, onScoreChange }) {
  const [question, setQuestion]     = useState(() => randomFretQuestion());
  const [status, setStatus]         = useState("waiting");
  const [wrongGuess, setWrongGuess] = useState(null);
  const [score, setScore]           = useState({ correct: 0, total: 0 });
  const [revealed, setRevealed]     = useState(false);

  function nextQuestion() {
    setQuestion(randomFretQuestion());
    setStatus("waiting");
    setWrongGuess(null);
    setRevealed(false);
  }

  function handleGuess(note) {
    if (status === "correct" || paused) return;
    if (note === question.answer) {
      const ns = { correct: score.correct + 1, total: score.total + 1 };
      setScore(ns); setStatus("correct"); onScoreChange?.(ns);
    } else {
      const ns = { ...score, total: score.total + 1 };
      setScore(ns); setStatus("wrong"); setWrongGuess(note); onScoreChange?.(ns);
    }
  }

  const questionText = question.fret === 0
    ? `Open ${question.string} string`
    : `${question.string} string — ${fretLabel(question.fret)}`;

  return (
    <div style={styles.quizWrap}>
      <div style={styles.scoreRow}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Score</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color }}>{score.correct} / {score.total}</span>
      </div>

      <div className="question-box" style={styles.questionBox}>
        <p style={styles.questionLabel}>What note is this?</p>
        <p className="question-text" style={styles.questionText}>{questionText}</p>
        <MiniFretboard string={question.string} fret={question.fret} color={color}
          revealed={status === "correct" || revealed} answer={question.answer} />
      </div>

      {status === "correct" && (
        <div style={styles.feedbackCorrect}>
          ✅ Correct! It's <strong>{question.answer}</strong>
          <button style={{ ...styles.feedbackBtn, background: color, color: "#0d0d0d" }} onClick={nextQuestion}>Next question →</button>
        </div>
      )}
      {status === "wrong" && (
        <div style={styles.feedbackWrong}>
          ❌ <strong>{wrongGuess}</strong> is wrong
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button style={styles.feedbackBtn} onClick={() => { setStatus("waiting"); setWrongGuess(null); }}>Try again</button>
            {!revealed && <button style={styles.feedbackBtnGhost} onClick={() => setRevealed(true)}>Show answer</button>}
            {revealed && <span style={{ color: "#47b3ff", fontWeight: 700, alignSelf: "center" }}>→ {question.answer}</span>}
          </div>
        </div>
      )}

      <div className="note-grid" style={styles.noteGrid}>
        {NOTES.map((note) => {
          const isCorrect = (status === "correct" || revealed) && note === question.answer;
          const isWrong   = status === "wrong" && note === wrongGuess;
          let bg = "var(--surface)", border = "var(--border)", textColor = "var(--text)";
          if (isCorrect) { bg = "#1a3a1a"; border = "#47ff7a"; textColor = "#47ff7a"; }
          else if (isWrong) { bg = "#3a1a1a"; border = "#ff4d4d"; textColor = "#ff4d4d"; }
          return (
            <button key={note}
              style={{ ...styles.noteBtn, background: bg, borderColor: border, color: textColor }}
              onClick={() => handleGuess(note)}
              disabled={status === "correct" || paused}>
              {note}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini fretboard visual ────────────────────────────────────────────────────

function MiniFretboard({ string, fret, color, revealed, answer }) {
  const stringOrder = ["G", "D", "A", "E"];
  const activeRow   = stringOrder.indexOf(string);
  const cellW = 28, cellH = 18, nutW = 4, labelW = 22;
  const totalW = labelW + nutW + 13 * cellW;
  const totalH = stringOrder.length * cellH;

  return (
    <div style={{ overflowX: "auto", width: "100%", display: "flex", justifyContent: "center", marginTop: 8 }}>
      <svg width={totalW} height={totalH + 20} style={{ fontFamily: "'Space Mono', monospace" }}>
        {stringOrder.map((s, row) => (
          <text key={s} x={labelW - 4} y={row * cellH + cellH / 2 + 5}
            textAnchor="end" fontSize={10} fill={row === activeRow ? color : "#555"} fontWeight={row === activeRow ? 700 : 400}>
            {s}
          </text>
        ))}
        <rect x={labelW} y={0} width={nutW} height={totalH} fill="#888" />
        {Array.from({ length: 14 }).map((_, f) => (
          <line key={f} x1={labelW + nutW + f * cellW} y1={0} x2={labelW + nutW + f * cellW} y2={totalH} stroke="#333" strokeWidth={1} />
        ))}
        {stringOrder.map((_, row) => (
          <line key={row} x1={labelW} y1={row * cellH + cellH / 2} x2={totalW} y2={row * cellH + cellH / 2} stroke="#444" strokeWidth={1} />
        ))}
        {[3, 5, 7, 9, 12].map(f => (
          <circle key={f} cx={labelW + nutW + (f - 0.5) * cellW} cy={totalH + 12} r={3} fill="#444" />
        ))}
        {fret > 0 && (
          <rect x={labelW + nutW + (fret - 1) * cellW + 1} y={activeRow * cellH + 1}
            width={cellW - 2} height={cellH - 2} rx={4} fill={color + "33"} stroke={color} strokeWidth={1.5} />
        )}
        {fret === 0 && (
          <rect x={labelW + 1} y={activeRow * cellH + 1} width={nutW + cellW - 2} height={cellH - 2}
            rx={4} fill={color + "33"} stroke={color} strokeWidth={1.5} />
        )}
        {revealed && (
          <g>
            <circle cx={fret === 0 ? labelW + nutW + cellW / 2 - 8 : labelW + nutW + (fret - 0.5) * cellW}
              cy={activeRow * cellH + cellH / 2} r={9} fill={color} />
            <text x={fret === 0 ? labelW + nutW + cellW / 2 - 8 : labelW + nutW + (fret - 0.5) * cellW}
              y={activeRow * cellH + cellH / 2 + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0d0d0d">
              {answer}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── Ear Training Quiz ────────────────────────────────────────────────────────

const DIFFICULTY_LABELS = { simple: "Simple", diatonic: "Diatonic", all: "All" };

function EarTrainingQuiz({ color, paused, onScoreChange }) {
  const audioCtxRef = useRef(null);
  const [difficulty, setDifficulty] = useState("simple");
  const [question, setQuestion]     = useState(() => randomIntervalQuestion("simple"));
  const [status, setStatus]         = useState("idle");
  const [wrongGuess, setWrongGuess] = useState(null);
  const [score, setScore]           = useState({ correct: 0, total: 0 });
  const [playing, setPlaying]       = useState(false);
  const [revealed, setRevealed]     = useState(false);

  const activePool = DIFFICULTY_SETS[difficulty].map(s => INTERVALS.find(i => i.semitones === s));

  function getCtx() {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function changeDifficulty(d) {
    setDifficulty(d);
    setQuestion(randomIntervalQuestion(d));
    setStatus("idle"); setWrongGuess(null); setRevealed(false);
    const ns = { correct: 0, total: 0, difficulty: d };
    setScore(ns); onScoreChange?.(ns);
  }

  function handlePlay() {
    if (paused || playing) return;
    setPlaying(true);
    setStatus(s => s === "idle" ? "waiting" : s);
    playIntervalTones(getCtx(), question.baseMidi, question.interval.semitones, () => setPlaying(false));
  }

  function handleGuess(interval) {
    if (status === "correct" || status === "idle" || paused) return;
    if (interval.semitones === question.interval.semitones) {
      const ns = { correct: score.correct + 1, total: score.total + 1, difficulty };
      setScore(ns); setStatus("correct"); onScoreChange?.(ns);
    } else {
      const ns = { ...score, total: score.total + 1, difficulty };
      setScore(ns); setStatus("wrong"); setWrongGuess(interval); onScoreChange?.(ns);
    }
  }

  function handleNext() {
    setQuestion(randomIntervalQuestion(difficulty));
    setStatus("idle"); setWrongGuess(null); setRevealed(false);
  }

  return (
    <div style={styles.quizWrap}>
      <div style={styles.difficultyRow}>
        {Object.keys(DIFFICULTY_LABELS).map(d => (
          <button key={d}
            style={{ ...styles.diffBtn, background: difficulty === d ? color : "var(--surface)", color: difficulty === d ? "#0d0d0d" : "var(--text-muted)", borderColor: difficulty === d ? color : "var(--border)", fontWeight: difficulty === d ? 700 : 500 }}
            onClick={() => changeDifficulty(d)}>
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
      </div>

      <div style={styles.poolRow}>
        {activePool.map(iv => (
          <span key={iv.semitones} style={{ ...styles.poolPill, borderColor: color + "55", color }}>{iv.short}</span>
        ))}
      </div>

      <div style={styles.scoreRow}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Score</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color }}>{score.correct} / {score.total}</span>
      </div>

      <div style={styles.questionBox}>
        <p style={styles.questionLabel}>Identify the interval</p>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>Two notes will play sequentially — ascending</p>
        <button className="play-btn" style={{ ...styles.playBtn, background: playing ? "var(--border)" : color, color: playing ? "var(--text-muted)" : "#0d0d0d", cursor: playing ? "default" : "pointer" }}
          onClick={handlePlay} disabled={playing || paused}>
          {playing ? "♪  Playing..." : status === "idle" ? "▶  Play Interval" : "↺  Play Again"}
        </button>
        {revealed && status !== "correct" && (
          <p style={{ marginTop: 10, fontSize: 14, color: "#47b3ff" }}>Answer: <strong>{question.interval.name}</strong></p>
        )}
      </div>

      {status === "correct" && (
        <div style={styles.feedbackCorrect}>
          ✅ Correct! &nbsp;<strong>{question.interval.name}</strong>
          <button style={{ ...styles.feedbackBtn, background: color, color: "#0d0d0d", marginTop: 8 }} onClick={handleNext}>Next interval →</button>
        </div>
      )}
      {status === "wrong" && (
        <div style={styles.feedbackWrong}>
          ❌ <strong>{wrongGuess?.name}</strong> is wrong
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button style={styles.feedbackBtn} onClick={() => { setStatus("waiting"); setWrongGuess(null); }}>Try again</button>
            {!revealed && <button style={styles.feedbackBtnGhost} onClick={() => setRevealed(true)}>Show answer</button>}
          </div>
        </div>
      )}

      <div className="interval-grid" style={styles.intervalGrid}>
        {activePool.map((interval) => {
          const isCorrect = status === "correct" && interval.semitones === question.interval.semitones;
          const isWrong   = status === "wrong"   && interval.semitones === wrongGuess?.semitones;
          const isReveal  = revealed && interval.semitones === question.interval.semitones;
          const disabled  = status === "idle" || status === "correct" || paused;
          let bg = "var(--surface)", border = "var(--border)", textColor = disabled ? "var(--text-muted)" : "var(--text)";
          if (isCorrect || isReveal) { bg = "#1a3a1a"; border = "#47ff7a"; textColor = "#47ff7a"; }
          else if (isWrong)          { bg = "#3a1a1a"; border = "#ff4d4d"; textColor = "#ff4d4d"; }
          return (
            <button key={interval.semitones}
              style={{ ...styles.intervalBtn, background: bg, borderColor: border, color: textColor, opacity: disabled && !isCorrect && !isReveal ? 0.5 : 1 }}
              onClick={() => handleGuess(interval)} disabled={disabled}>
              <span style={{ fontSize: 10, opacity: 0.6, display: "block", marginBottom: 2 }}>{interval.short}</span>
              {interval.name}
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
        Press Play first, then guess the interval between the two notes
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  root: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" },
  header: {
    padding: "13px 22px", borderBottom: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "var(--surface)",
  },
  logo: { fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px" },
  headerBtn: {
    padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer",
  },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 16px" },
  centerBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", maxWidth: 480, width: "100%" },
  idleTitle: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.8px", lineHeight: 1.15 },
  startBtn: {
    background: "var(--accent)", color: "#0d0d0d", padding: "15px 40px",
    borderRadius: "var(--radius)", fontSize: 16, fontWeight: 700, cursor: "pointer", border: "none",
    letterSpacing: "-0.2px",
  },
  quizWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  scoreRow: { display: "flex", justifyContent: "space-between", width: "100%", padding: "6px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 },
  questionBox: { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px 20px", textAlign: "center" },
  questionLabel: { fontSize: 11, color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 },
  questionText: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", fontFamily: "'Space Mono', monospace" },
  feedbackCorrect: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 20px", background: "#0f2a0f", border: "1px solid #47ff7a44", borderRadius: "var(--radius)", width: "100%", textAlign: "center", fontSize: 15, color: "#47ff7a" },
  feedbackWrong:   { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 20px", background: "#2a0f0f", border: "1px solid #ff4d4d44", borderRadius: "var(--radius)", width: "100%", textAlign: "center", fontSize: 15, color: "#ff4d4d" },
  feedbackBtn:     { padding: "8px 18px", borderRadius: 8, fontWeight: 700, fontSize: 14, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer" },
  feedbackBtnGhost:{ padding: "8px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" },
  noteGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, width: "100%" },
  noteBtn: { padding: "12px 4px", borderRadius: 8, fontWeight: 700, fontSize: 14, border: "1px solid", cursor: "pointer", fontFamily: "'Space Mono', monospace", transition: "background 0.15s" },
  difficultyRow: { display: "flex", gap: 8, width: "100%" },
  diffBtn: { flex: 1, padding: "9px 4px", borderRadius: 8, fontSize: 13, border: "1px solid", cursor: "pointer", transition: "background 0.15s" },
  poolRow: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  poolPill: { padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: "1px solid", fontFamily: "'Space Mono', monospace" },
  playBtn: { padding: "14px 36px", borderRadius: "var(--radius)", fontWeight: 700, fontSize: 16, border: "none", transition: "background 0.2s", letterSpacing: "-0.3px" },
  intervalGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" },
  intervalBtn: { padding: "10px 6px", borderRadius: 8, fontWeight: 600, fontSize: 13, border: "1px solid", cursor: "pointer", textAlign: "center", lineHeight: 1.3, transition: "background 0.15s" },
};
