import { describe, it, expect } from "vitest";
import { reducer, initialState, IDLE, RUNNING, PAUSED, DONE } from "../sessionReducer.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockProgram = {
  id: "30min_full_bass",
  blocks: [
    { type: "fretboard", duration: 300 },
    { type: "technique", duration: 300 },
    { type: "rhythm",    duration: 300 },
    { type: "improv",    duration: 300 },
    { type: "fun",       duration: 600 },
  ],
};

function runningState(blockIndex = 0) {
  const block = mockProgram.blocks[blockIndex];
  return {
    phase: RUNNING,
    program: mockProgram,
    blockIndex,
    secondsLeft: block.duration,
    totalSeconds: block.duration,
  };
}

// ─── initialState ─────────────────────────────────────────────────────────────

describe("initialState", () => {
  it("starts in IDLE phase", () => {
    expect(initialState().phase).toBe(IDLE);
  });

  it("has no program", () => {
    expect(initialState().program).toBeNull();
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

describe("START action", () => {
  it("transitions from IDLE to RUNNING", () => {
    const state = reducer(initialState(), { type: "START", program: mockProgram });
    expect(state.phase).toBe(RUNNING);
  });

  it("loads the first block", () => {
    const state = reducer(initialState(), { type: "START", program: mockProgram });
    expect(state.blockIndex).toBe(0);
    expect(state.secondsLeft).toBe(300);
    expect(state.totalSeconds).toBe(300);
  });

  it("stores the program", () => {
    const state = reducer(initialState(), { type: "START", program: mockProgram });
    expect(state.program).toBe(mockProgram);
  });
});

// ─── TICK ────────────────────────────────────────────────────────────────────

describe("TICK action", () => {
  it("decrements secondsLeft by 1", () => {
    const before = runningState(0);
    const after  = reducer(before, { type: "TICK" });
    expect(after.secondsLeft).toBe(299);
  });

  it("does not go below 0", () => {
    const state  = { ...runningState(0), secondsLeft: 1 };
    const after  = reducer(state, { type: "TICK" });
    expect(after.secondsLeft).toBe(0);
  });

  it("is a no-op when paused", () => {
    const state = { ...runningState(0), phase: PAUSED };
    const after = reducer(state, { type: "TICK" });
    expect(after).toBe(state); // same reference = no change
  });
});

// ─── NEXT_BLOCK ──────────────────────────────────────────────────────────────

describe("NEXT_BLOCK action", () => {
  it("advances to the next block", () => {
    const state = reducer(runningState(0), { type: "NEXT_BLOCK" });
    expect(state.blockIndex).toBe(1);
    expect(state.secondsLeft).toBe(300);
  });

  it("resets timer to new block's duration", () => {
    const state = reducer(runningState(3), { type: "NEXT_BLOCK" });
    expect(state.blockIndex).toBe(4);
    expect(state.secondsLeft).toBe(600); // fun block is 600s
  });

  it("transitions to DONE after the last block", () => {
    const lastBlock = runningState(4); // fun = last block
    const state = reducer(lastBlock, { type: "NEXT_BLOCK" });
    expect(state.phase).toBe(DONE);
    expect(state.secondsLeft).toBe(0);
  });
});

// ─── PREV_BLOCK ──────────────────────────────────────────────────────────────

describe("PREV_BLOCK action", () => {
  it("goes back to the previous block", () => {
    const state = reducer(runningState(2), { type: "PREV_BLOCK" });
    expect(state.blockIndex).toBe(1);
    expect(state.secondsLeft).toBe(300);
    expect(state.totalSeconds).toBe(300);
  });

  it("is a no-op when already at the first block", () => {
    const state  = runningState(0);
    const after  = reducer(state, { type: "PREV_BLOCK" });
    expect(after.blockIndex).toBe(0);
    expect(after).toBe(state); // same reference
  });
});

// ─── ADJUST_TIME ─────────────────────────────────────────────────────────────

describe("ADJUST_TIME action", () => {
  it("adds seconds to the timer", () => {
    const state = { ...runningState(0), secondsLeft: 120 };
    expect(reducer(state, { type: "ADJUST_TIME", delta: 60 }).secondsLeft).toBe(180);
  });

  it("subtracts seconds from the timer", () => {
    const state = { ...runningState(0), secondsLeft: 120 };
    expect(reducer(state, { type: "ADJUST_TIME", delta: -60 }).secondsLeft).toBe(60);
  });

  it("clamps at 10 seconds minimum", () => {
    const state = { ...runningState(0), secondsLeft: 30 };
    expect(reducer(state, { type: "ADJUST_TIME", delta: -60 }).secondsLeft).toBe(10);
  });

  it("works while paused", () => {
    const state = { ...runningState(0), phase: PAUSED, secondsLeft: 90 };
    expect(reducer(state, { type: "ADJUST_TIME", delta: 60 }).secondsLeft).toBe(150);
  });
});

// ─── PAUSE / RESUME ──────────────────────────────────────────────────────────

describe("PAUSE / RESUME actions", () => {
  it("pauses a running session", () => {
    const state = reducer(runningState(0), { type: "PAUSE" });
    expect(state.phase).toBe(PAUSED);
  });

  it("resumes a paused session", () => {
    const paused = { ...runningState(0), phase: PAUSED };
    const state  = reducer(paused, { type: "RESUME" });
    expect(state.phase).toBe(RUNNING);
  });

  it("preserves blockIndex and timer through pause/resume", () => {
    const running = { ...runningState(2), secondsLeft: 150 };
    const paused  = reducer(running, { type: "PAUSE" });
    const resumed = reducer(paused,  { type: "RESUME" });
    expect(resumed.blockIndex).toBe(2);
    expect(resumed.secondsLeft).toBe(150);
  });
});

// ─── RESET ────────────────────────────────────────────────────────────────────

describe("RESET action", () => {
  it("returns to initial state from running", () => {
    const state = reducer(runningState(3), { type: "RESET" });
    expect(state.phase).toBe(IDLE);
    expect(state.program).toBeNull();
    expect(state.blockIndex).toBe(0);
  });

  it("returns to initial state from DONE", () => {
    const done  = { ...runningState(4), phase: DONE, secondsLeft: 0 };
    const state = reducer(done, { type: "RESET" });
    expect(state.phase).toBe(IDLE);
  });
});

// ─── fmtTime (api.js) ────────────────────────────────────────────────────────

import { fmtTime } from "../api.js";

describe("fmtTime", () => {
  it("returns '0m' for zero/falsy", () => {
    expect(fmtTime(0)).toBe("0m");
    expect(fmtTime(null)).toBe("0m");
    expect(fmtTime(undefined)).toBe("0m");
  });

  it("returns minutes only for < 1 hour", () => {
    expect(fmtTime(60)).toBe("1m");
    expect(fmtTime(1800)).toBe("30m");
    expect(fmtTime(3540)).toBe("59m");
  });

  it("returns hours only when minutes = 0", () => {
    expect(fmtTime(3600)).toBe("1h");
    expect(fmtTime(7200)).toBe("2h");
  });

  it("returns hours and minutes", () => {
    expect(fmtTime(3660)).toBe("1h 1m");
    expect(fmtTime(5400)).toBe("1h 30m");
  });
});
