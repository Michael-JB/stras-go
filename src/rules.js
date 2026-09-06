// Go rules engine: board state, captures, positional superko, area scoring.
// A game is a plain "record" object; everything else is derived from it by
// replaying the moves, so the record is the only thing that needs persisting.

export const SIZES = [9, 13, 19];
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const PASS = -1;
export const RESIGN = -2;
export const MAX_HANDICAP = 9;
export const MAX_MOVES = 4095; // 12-bit move counter in the URL codec

export const other = (color) => (color === BLACK ? WHITE : BLACK);

export function newRecord({ size = 19, handicap = 0, komi = 7.5 } = {}) {
  validateSettings({ size, handicap, komi });
  return { size, handicap, komi, moves: [], dead: [], accepted: false };
}

export function validateSettings({ size, handicap, komi }) {
  if (!SIZES.includes(size)) throw new Error(`unsupported board size ${size}`);
  if (handicap !== 0 && (handicap < 2 || handicap > MAX_HANDICAP)) {
    throw new Error(`handicap must be 0 or 2-${MAX_HANDICAP}`);
  }
  if (!Number.isFinite(komi) || komi < 0 || komi > 31.5 || (komi * 2) % 1 !== 0) {
    throw new Error(`komi must be a multiple of 0.5 between 0 and 31.5`);
  }
}

// The nine star points, row-major: TL TM TR / ML C MR / BL BM BR.
export function starPoints(size) {
  const edge = size >= 13 ? 3 : 2;
  const mid = (size - 1) / 2;
  const lines = [edge, mid, size - 1 - edge];
  const pts = [];
  for (const r of lines) for (const c of lines) pts.push(r * size + c);
  return pts;
}

// Fixed handicap placement in the conventional order.
export function handicapPoints(size, n) {
  if (n === 0) return [];
  const [TL, TM, TR, ML, C, MR, BL, BM, BR] = starPoints(size);
  const order = {
    2: [TR, BL],
    3: [TR, BL, BR],
    4: [TR, BL, BR, TL],
    5: [TR, BL, BR, TL, C],
    6: [TR, BL, BR, TL, ML, MR],
    7: [TR, BL, BR, TL, ML, MR, C],
    8: [TR, BL, BR, TL, ML, MR, TM, BM],
    9: [TR, BL, BR, TL, ML, MR, TM, BM, C],
  };
  if (!order[n]) throw new Error(`handicap must be 0 or 2-${MAX_HANDICAP}`);
  return order[n];
}

export function neighbors(size, idx) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0) out.push(idx - size);
  if (r < size - 1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size - 1) out.push(idx + 1);
  return out;
}

// Connected group containing idx, with its liberty count.
export function groupAt(board, size, idx) {
  const color = board[idx];
  const stones = [idx];
  const seen = new Uint8Array(board.length);
  seen[idx] = 1;
  const libs = new Set();
  for (let i = 0; i < stones.length; i++) {
    for (const n of neighbors(size, stones[i])) {
      if (board[n] === EMPTY) libs.add(n);
      else if (board[n] === color && !seen[n]) {
        seen[n] = 1;
        stones.push(n);
      }
    }
  }
  return { color, stones, liberties: libs.size };
}

// Place a stone and resolve captures. Returns null for occupied or suicide.
export function placeStone(board, size, idx, color) {
  if (board[idx] !== EMPTY) return null;
  const next = board.slice();
  next[idx] = color;
  const captured = [];
  for (const n of neighbors(size, idx)) {
    if (next[n] !== other(color)) continue;
    const g = groupAt(next, size, n);
    if (g.liberties === 0) {
      for (const s of g.stones) {
        next[s] = EMPTY;
        captured.push(s);
      }
    }
  }
  if (groupAt(next, size, idx).liberties === 0) return null;
  return { board: next, captured };
}

const positionKey = (board) => String.fromCharCode.apply(null, board);

// Replay the record into a full view of the game. Throws if the record is
// inconsistent (illegal move, superko violation, moves after the game ended).
export function derive(record) {
  const { size, handicap, komi, moves, dead, accepted } = record;
  validateSettings(record);
  if (moves.length > MAX_MOVES) throw new Error('too many moves');
  const n = size * size;
  let board = new Uint8Array(n);
  for (const p of handicapPoints(size, handicap)) board[p] = BLACK;
  let toPlay = handicap > 0 ? WHITE : BLACK;
  const captures = { [BLACK]: 0, [WHITE]: 0 };
  const positions = new Set([positionKey(board)]);
  let lastMove = null;
  let phase = 'play';
  let result = null;
  let passes = 0;

  moves.forEach((m, i) => {
    if (phase !== 'play') throw new Error(`move ${i} after game end`);
    if (m === PASS) {
      passes++;
      if (passes >= 2) phase = 'scoring';
    } else if (m === RESIGN) {
      phase = 'over';
      result = { type: 'resign', winner: other(toPlay) };
    } else {
      if (!Number.isInteger(m) || m < 0 || m >= n) throw new Error(`bad move ${i}`);
      const res = placeStone(board, size, m, toPlay);
      if (!res) throw new Error(`illegal move ${i}`);
      const k = positionKey(res.board);
      if (positions.has(k)) throw new Error(`superko violation at move ${i}`);
      positions.add(k);
      board = res.board;
      captures[toPlay] += res.captured.length;
      passes = 0;
    }
    lastMove = m;
    toPlay = other(toPlay);
  });

  let scoring = null;
  if (phase === 'scoring') {
    for (const d of dead) {
      if (!Number.isInteger(d) || d < 0 || d >= n || board[d] === EMPTY) {
        throw new Error('dead mark on empty point');
      }
    }
    scoring = score(board, size, dead, komi);
    if (accepted) {
      phase = 'over';
      result = { type: 'score', winner: scoring.winner, margin: scoring.margin };
    }
  }

  return {
    size, komi, handicap, board, toPlay, captures, positions, lastMove,
    phase, result, scoring, dead: new Set(dead), moveCount: moves.length,
  };
}

export function isLegal(view, idx) {
  if (view.phase !== 'play') return false;
  const res = placeStone(view.board, view.size, idx, view.toPlay);
  if (!res) return false;
  return !view.positions.has(positionKey(res.board));
}

// Area scoring: stones on the board plus surrounded empty points. Dead stones
// are removed before counting; their points become the opponent's territory.
export function score(board, size, dead, komi) {
  const b = board.slice();
  for (const d of dead) b[d] = EMPTY;
  const owner = new Uint8Array(b.length);
  const seen = new Uint8Array(b.length);
  const stones = { [BLACK]: 0, [WHITE]: 0 };
  const territory = { [BLACK]: 0, [WHITE]: 0 };
  for (let i = 0; i < b.length; i++) if (b[i]) stones[b[i]]++;
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== EMPTY || seen[i]) continue;
    const region = [i];
    seen[i] = 1;
    let borders = 0;
    for (let j = 0; j < region.length; j++) {
      for (const nb of neighbors(size, region[j])) {
        if (b[nb] === EMPTY) {
          if (!seen[nb]) {
            seen[nb] = 1;
            region.push(nb);
          }
        } else borders |= b[nb];
      }
    }
    if (borders === BLACK || borders === WHITE) {
      for (const p of region) owner[p] = borders;
      territory[borders] += region.length;
    }
  }
  const black = stones[BLACK] + territory[BLACK];
  const white = stones[WHITE] + territory[WHITE] + komi;
  const winner = black > white ? BLACK : white > black ? WHITE : EMPTY;
  return { black, white, owner, stones, territory, komi, winner, margin: Math.abs(black - white) };
}

// --- Record mutations. Each returns a new record. ---

export function play(record, view, idx) {
  if (!isLegal(view, idx)) return record;
  return { ...record, moves: [...record.moves, idx], dead: [], accepted: false };
}

export function pass(record, view) {
  if (view.phase !== 'play') return record;
  return { ...record, moves: [...record.moves, PASS], dead: [], accepted: false };
}

export function resign(record, view) {
  if (view.phase !== 'play') return record;
  return { ...record, moves: [...record.moves, RESIGN], dead: [], accepted: false };
}

export function undo(record, view) {
  if (record.accepted) return { ...record, accepted: false };
  if (record.moves.length === 0) return record;
  const moves = record.moves.slice(0, -1);
  // Leaving the scoring phase invalidates dead marks.
  const stillScoring = view.phase === 'scoring' && moves.length >= 2 &&
    moves[moves.length - 1] === PASS && moves[moves.length - 2] === PASS;
  return { ...record, moves, dead: stillScoring ? record.dead : [], accepted: false };
}

export function toggleDead(record, view, idx) {
  if (view.phase !== 'scoring' || view.board[idx] === EMPTY) return record;
  const { stones } = groupAt(view.board, view.size, idx);
  const dead = new Set(record.dead);
  const allDead = stones.every((s) => dead.has(s));
  for (const s of stones) allDead ? dead.delete(s) : dead.add(s);
  return { ...record, dead: [...dead].sort((a, b) => a - b), accepted: false };
}

export function accept(record, view) {
  if (view.phase !== 'scoring') return record;
  return { ...record, accepted: true };
}
