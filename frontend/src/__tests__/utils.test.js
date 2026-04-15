import { describe, it, expect } from "vitest";
import {
  noteAt, fretLabel, randomFretQuestion,
  NOTES, STRINGS, OPEN_IDX,
  randomIntervalQuestion, INTERVALS, DIFFICULTY_SETS,
  formatTime, blockColor,
  cleanTrackName, getAudioSrc,
  midiToHz,
} from "../utils.js";

// ─── noteAt ──────────────────────────────────────────────────────────────────

describe("noteAt", () => {
  it("returns the open string note at fret 0", () => {
    expect(noteAt("A", 0)).toBe("A");
    expect(noteAt("E", 0)).toBe("E");
    expect(noteAt("D", 0)).toBe("D");
    expect(noteAt("G", 0)).toBe("G");
  });

  it("correctly maps A string frets", () => {
    expect(noteAt("A", 1)).toBe("A#");
    expect(noteAt("A", 2)).toBe("B");
    expect(noteAt("A", 3)).toBe("C");
    expect(noteAt("A", 5)).toBe("D");
    expect(noteAt("A", 7)).toBe("E");
    expect(noteAt("A", 12)).toBe("A"); // octave
  });

  it("correctly maps E string frets", () => {
    expect(noteAt("E", 1)).toBe("F");
    expect(noteAt("E", 5)).toBe("A");
    expect(noteAt("E", 12)).toBe("E"); // octave
  });

  it("wraps around beyond the 12th fret", () => {
    expect(noteAt("A", 13)).toBe("A#"); // same as fret 1
  });
});

// ─── fretLabel ───────────────────────────────────────────────────────────────

describe("fretLabel", () => {
  it("returns 'open' for fret 0", () => {
    expect(fretLabel(0)).toBe("open");
  });

  it("uses correct ordinal suffixes", () => {
    expect(fretLabel(1)).toBe("1st fret");
    expect(fretLabel(2)).toBe("2nd fret");
    expect(fretLabel(3)).toBe("3rd fret");
    expect(fretLabel(4)).toBe("4th fret");
    expect(fretLabel(12)).toBe("12th fret");
  });
});

// ─── randomFretQuestion ───────────────────────────────────────────────────────

describe("randomFretQuestion", () => {
  it("returns a valid question object", () => {
    const q = randomFretQuestion();
    expect(STRINGS).toContain(q.string);
    expect(q.fret).toBeGreaterThanOrEqual(0);
    expect(q.fret).toBeLessThanOrEqual(12);
    expect(NOTES).toContain(q.answer);
  });

  it("answer matches noteAt(string, fret)", () => {
    for (let i = 0; i < 20; i++) {
      const q = randomFretQuestion();
      expect(q.answer).toBe(noteAt(q.string, q.fret));
    }
  });
});

// ─── randomIntervalQuestion ──────────────────────────────────────────────────

describe("randomIntervalQuestion", () => {
  it("returns an interval from the correct difficulty pool", () => {
    for (let i = 0; i < 20; i++) {
      const q = randomIntervalQuestion("simple");
      expect(DIFFICULTY_SETS.simple).toContain(q.interval.semitones);
    }
  });

  it("returns intervals within the diatonic set", () => {
    for (let i = 0; i < 20; i++) {
      const q = randomIntervalQuestion("diatonic");
      expect(DIFFICULTY_SETS.diatonic).toContain(q.interval.semitones);
    }
  });

  it("baseMidi is in a reasonable playing range", () => {
    for (let i = 0; i < 20; i++) {
      const q = randomIntervalQuestion("all");
      expect(q.baseMidi).toBeGreaterThanOrEqual(45);
      expect(q.baseMidi).toBeLessThanOrEqual(57);
    }
  });

  it("interval object has name, short, and semitones", () => {
    const q = randomIntervalQuestion("simple");
    expect(q.interval).toHaveProperty("name");
    expect(q.interval).toHaveProperty("short");
    expect(q.interval).toHaveProperty("semitones");
  });
});

// ─── formatTime ──────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("formats zero", () => expect(formatTime(0)).toBe("00:00"));
  it("formats seconds only", () => expect(formatTime(45)).toBe("00:45"));
  it("formats minutes and seconds", () => expect(formatTime(125)).toBe("02:05"));
  it("formats 30 minutes", () => expect(formatTime(1800)).toBe("30:00"));
  it("pads single-digit values", () => expect(formatTime(61)).toBe("01:01"));
});

// ─── blockColor ──────────────────────────────────────────────────────────────

describe("blockColor", () => {
  it("returns a hex color for each known block type", () => {
    for (const type of ["fretboard", "technique", "rhythm", "improv", "fun"]) {
      const c = blockColor(type);
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("returns fallback for unknown types", () => {
    expect(blockColor("unknown")).toBe("#888");
  });
});

// ─── cleanTrackName ──────────────────────────────────────────────────────────

describe("cleanTrackName", () => {
  it("strips Module/Lesson prefix", () => {
    expect(cleanTrackName("Module 14 Lesson 2 More Ultimate Groove Workout Full.mp3"))
      .toBe("More Ultimate Groove Workout");
  });

  it("strips .mp3 extension", () => {
    expect(cleanTrackName("My Track.mp3")).toBe("My Track");
  });

  it("strips trailing Full or Med", () => {
    expect(cleanTrackName("Track Name Full.mp3")).toBe("Track Name");
    expect(cleanTrackName("Track Name Med.mp3")).toBe("Track Name");
  });

  it("leaves unrelated names unchanged", () => {
    expect(cleanTrackName("Vamping with the Drummer Full.mp3"))
      .toBe("Vamping with the Drummer");
  });
});

// ─── getAudioSrc ─────────────────────────────────────────────────────────────

describe("getAudioSrc", () => {
  const rhythmBlock = {
    type: "rhythm",
    config: { tracks: ["track1.mp3", "track2.mp3", "track3.mp3"] },
  };
  const improvBlock = {
    type: "improv",
    config: { tracks: ["improv1.mp3"] },
  };
  const noAudioBlock = { type: "fun", config: {} };

  it("returns null when no tracks", () => {
    expect(getAudioSrc(noAudioBlock)).toBeNull();
    expect(getAudioSrc({ type: "fun" })).toBeNull();
  });

  it("returns a path with the correct folder prefix", () => {
    const src = getAudioSrc(rhythmBlock);
    expect(src).toMatch(/^\/audio\/rhythm\//);
  });

  it("uses improv folder for improv blocks", () => {
    const src = getAudioSrc(improvBlock);
    expect(src).toMatch(/^\/audio\/improv\//);
  });

  it("excludes the current track when exclude is set (and pool > 1)", () => {
    const excluded = "track1.mp3";
    for (let i = 0; i < 20; i++) {
      const src = getAudioSrc(rhythmBlock, excluded);
      expect(src).not.toContain(excluded);
    }
  });

  it("ignores exclude when only one track is available", () => {
    const src = getAudioSrc(improvBlock, "improv1.mp3");
    expect(src).toBe("/audio/improv/improv1.mp3");
  });
});

// ─── midiToHz ────────────────────────────────────────────────────────────────

describe("midiToHz", () => {
  it("A4 (MIDI 69) = 440 Hz", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 1);
  });

  it("A5 (MIDI 81) = 880 Hz", () => {
    expect(midiToHz(81)).toBeCloseTo(880, 1);
  });

  it("A3 (MIDI 57) = 220 Hz", () => {
    expect(midiToHz(57)).toBeCloseTo(220, 1);
  });
});
