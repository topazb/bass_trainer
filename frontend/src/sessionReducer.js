export const IDLE    = "IDLE";
export const RUNNING = "RUNNING";
export const PAUSED  = "PAUSED";
export const DONE    = "DONE";

export function initialState() {
  return { phase: IDLE, program: null, blockIndex: 0, secondsLeft: 0, totalSeconds: 0 };
}

export function reducer(state, action) {
  switch (action.type) {
    case "START": {
      const block = action.program.blocks[0];
      return { phase: RUNNING, program: action.program, blockIndex: 0, secondsLeft: block.duration, totalSeconds: block.duration };
    }
    case "TICK": {
      if (state.phase !== RUNNING) return state;
      const next = state.secondsLeft - 1;
      return { ...state, secondsLeft: next <= 0 ? 0 : next };
    }
    case "NEXT_BLOCK": {
      const nextIdx = state.blockIndex + 1;
      if (nextIdx >= state.program.blocks.length) return { ...state, phase: DONE, secondsLeft: 0 };
      const block = state.program.blocks[nextIdx];
      return { ...state, blockIndex: nextIdx, secondsLeft: block.duration, totalSeconds: block.duration };
    }
    case "PREV_BLOCK": {
      const prevIdx = state.blockIndex - 1;
      if (prevIdx < 0) return state;
      const block = state.program.blocks[prevIdx];
      return { ...state, blockIndex: prevIdx, secondsLeft: block.duration, totalSeconds: block.duration };
    }
    case "ADJUST_TIME": {
      const newSecs = Math.max(10, state.secondsLeft + action.delta);
      return { ...state, secondsLeft: newSecs };
    }
    case "PAUSE":  return { ...state, phase: PAUSED };
    case "RESUME": return { ...state, phase: RUNNING };
    case "RESET":  return initialState();
    default:       return state;
  }
}
