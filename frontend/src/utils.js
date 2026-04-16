import { useState, useEffect } from "react";

// ─── Music / audio ────────────────────────────────────────────────────────────

export function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function getAudioSrc(block, excludeFile = null) {
  const tracks = block.config?.tracks;
  if (!tracks?.length) return null;
  const folder = block.type === "rhythm" ? "rhythm" : "improv";
  const available = (tracks.length > 1 && excludeFile)
    ? tracks.filter(t => t !== excludeFile)
    : tracks;
  return `/audio/${folder}/${pickRandom(available)}`;
}

export function cleanTrackName(filename) {
  return filename
    .replace(/\.mp3$/i, "")
    .replace(/^Module \d+ Lesson \d+\s+/i, "")
    .replace(/\s+(Full|Med)$/i, "");
}

// ─── Fretboard note logic ─────────────────────────────────────────────────────

export const NOTES    = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
export const STRINGS  = ["E", "A", "D", "G"];
export const OPEN_IDX = { E: 7, A: 0, D: 5, G: 10 };

export function noteAt(string, fret) {
  return NOTES[(OPEN_IDX[string] + fret) % 12];
}

export function randomFretQuestion() {
  const string = STRINGS[Math.floor(Math.random() * STRINGS.length)];
  const fret   = Math.floor(Math.random() * 13);
  return { string, fret, answer: noteAt(string, fret) };
}

export function fretLabel(fret) {
  if (fret === 0) return "open";
  const s = fret === 1 ? "st" : fret === 2 ? "nd" : fret === 3 ? "rd" : "th";
  return `${fret}${s} fret`;
}

// ─── Ear training — intervals ─────────────────────────────────────────────────

export const INTERVALS = [
  { name: "Unison",      short: "P1", semitones: 0  },
  { name: "Minor 2nd",   short: "m2", semitones: 1  },
  { name: "Major 2nd",   short: "M2", semitones: 2  },
  { name: "Minor 3rd",   short: "m3", semitones: 3  },
  { name: "Major 3rd",   short: "M3", semitones: 4  },
  { name: "Perfect 4th", short: "P4", semitones: 5  },
  { name: "Tritone",     short: "TT", semitones: 6  },
  { name: "Perfect 5th", short: "P5", semitones: 7  },
  { name: "Minor 6th",   short: "m6", semitones: 8  },
  { name: "Major 6th",   short: "M6", semitones: 9  },
  { name: "Minor 7th",   short: "m7", semitones: 10 },
  { name: "Major 7th",   short: "M7", semitones: 11 },
  { name: "Octave",      short: "P8", semitones: 12 },
];

export const DIFFICULTY_SETS = {
  simple:   [4, 7, 12],
  diatonic: [2, 3, 4, 5, 7, 9, 10, 12],
  all:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

export function randomIntervalQuestion(difficulty = "all") {
  const pool     = DIFFICULTY_SETS[difficulty].map(s => INTERVALS.find(i => i.semitones === s));
  const interval = pool[Math.floor(Math.random() * pool.length)];
  const baseMidi = 45 + Math.floor(Math.random() * 13);
  return { interval, baseMidi };
}

export function midiToHz(midi)   { return 440 * Math.pow(2, (midi - 69) / 12); }

// ─── UI helpers ───────────────────────────────────────────────────────────────

export function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function blockColor(type) {
  const map = { fretboard: "#47b3ff", technique: "#ff8c47", rhythm: "#e8ff47", improv: "#b847ff", fun: "#47ffb3" };
  return map[type] ?? "#888";
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("bt_theme");
    if (saved) return saved;
    // respect OS preference on first visit
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("bt_theme", theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");

  return { theme, toggle };
}
