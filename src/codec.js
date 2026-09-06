// Packs a game record into a compact base64url string for the URL hash.
//
// Layout (bits):
//   3  version (0)
//   2  board size index into SIZES
//   4  handicap
//   6  komi in half points
//   1  score accepted
//   12 move count
//   then one field per move, each ceil(log2(size*size + 2)) bits:
//      0..n-1 = point, n = pass, n+1 = resign
//   if the game is in the scoring phase (last two moves are passes):
//      dead-stone count followed by that many point fields, same width.
import { SIZES, PASS, RESIGN, MAX_MOVES } from './rules.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map([...ALPHABET].map((ch, i) => [ch, i]));
const VERSION = 0;

class BitWriter {
  constructor() { this.bits = []; }
  write(value, width) {
    for (let i = width - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  toString() {
    let out = '';
    for (let i = 0; i < this.bits.length; i += 6) {
      let v = 0;
      for (let j = 0; j < 6; j++) v = (v << 1) | (this.bits[i + j] ?? 0);
      out += ALPHABET[v];
    }
    return out;
  }
}

class BitReader {
  constructor(str) {
    this.str = str;
    this.pos = 0;
    this.total = str.length * 6;
  }
  read(width) {
    if (this.pos + width > this.total) throw new Error('truncated');
    let v = 0;
    for (let i = 0; i < width; i++) {
      const ch = this.str[Math.floor(this.pos / 6)];
      const code = LOOKUP.get(ch);
      if (code === undefined) throw new Error('bad character');
      const bit = (code >> (5 - (this.pos % 6))) & 1;
      v = (v << 1) | bit;
      this.pos++;
    }
    return v;
  }
}

const bitsFor = (count) => Math.ceil(Math.log2(count));
const isScoring = (moves) =>
  moves.length >= 2 && moves[moves.length - 1] === PASS && moves[moves.length - 2] === PASS;

export function encode(record) {
  const { size, handicap, komi, moves, dead, accepted } = record;
  const sizeIndex = SIZES.indexOf(size);
  if (sizeIndex < 0) throw new Error('unsupported size');
  if (moves.length > MAX_MOVES) throw new Error('too many moves');
  const n = size * size;
  const width = bitsFor(n + 2);
  const w = new BitWriter();
  w.write(VERSION, 3);
  w.write(sizeIndex, 2);
  w.write(handicap, 4);
  w.write(Math.round(komi * 2), 6);
  w.write(accepted ? 1 : 0, 1);
  w.write(moves.length, 12);
  for (const m of moves) w.write(m === PASS ? n : m === RESIGN ? n + 1 : m, width);
  if (isScoring(moves)) {
    w.write(dead.length, width);
    for (const d of dead) w.write(d, width);
  }
  return w.toString();
}

export function decode(str) {
  const r = new BitReader(str);
  const version = r.read(3);
  if (version !== VERSION) throw new Error(`unsupported version ${version}`);
  const size = SIZES[r.read(2)];
  if (!size) throw new Error('unsupported size');
  const handicap = r.read(4);
  const komi = r.read(6) / 2;
  const accepted = r.read(1) === 1;
  const count = r.read(12);
  const n = size * size;
  const width = bitsFor(n + 2);
  const moves = [];
  for (let i = 0; i < count; i++) {
    const v = r.read(width);
    if (v === n) moves.push(PASS);
    else if (v === n + 1) moves.push(RESIGN);
    else if (v < n) moves.push(v);
    else throw new Error('bad move');
  }
  const dead = [];
  if (isScoring(moves)) {
    const deadCount = r.read(width);
    for (let i = 0; i < deadCount; i++) {
      const v = r.read(width);
      if (v >= n) throw new Error('bad dead point');
      dead.push(v);
    }
  }
  return { size, handicap, komi, moves, dead, accepted };
}
