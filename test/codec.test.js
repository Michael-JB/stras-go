import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../src/codec.js';
import { newRecord, derive, PASS, RESIGN } from '../src/rules.js';

test('round trips an empty default game in a handful of characters', () => {
  const rec = newRecord();
  const s = encode(rec);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.ok(s.length <= 6, `got ${s.length} chars`);
  assert.deepEqual(decode(s), rec);
});

test('round trips settings, moves, passes, resign', () => {
  for (const size of [9, 13, 19]) {
    const rec = { size, handicap: 3, komi: 0.5, moves: [0, size * size - 1, PASS, 5, RESIGN], dead: [], accepted: false };
    assert.deepEqual(decode(encode(rec)), rec);
  }
});

test('round trips scoring phase with dead marks and acceptance', () => {
  const rec = { size: 13, handicap: 0, komi: 7.5, moves: [10, 20, PASS, PASS], dead: [10, 20], accepted: true };
  assert.deepEqual(decode(encode(rec)), rec);
  // Dead marks are only written in the scoring phase.
  const playing = { ...rec, moves: [10, 20], dead: [10], accepted: false };
  assert.deepEqual(decode(encode(playing)), { ...playing, dead: [] });
});

test('a 300 move 19x19 game stays well under 500 characters', () => {
  const rec = newRecord();
  rec.moves = Array.from({ length: 300 }, (_, i) => i);
  const s = encode(rec);
  assert.ok(s.length < 500, `got ${s.length}`);
  assert.deepEqual(decode(s).moves, rec.moves);
});

test('rejects garbage', () => {
  assert.throws(() => decode(''));
  assert.throws(() => decode('!!!!'));
  assert.throws(() => decode('AAAA'.repeat(1) + '~'));
  // Wrong version bits.
  assert.throws(() => decode('gAAAA'));
});

test('a real replayed game survives the round trip', () => {
  const rec = newRecord({ size: 9 });
  rec.moves = [40, 41, 31, 32, 49, 50, 22, PASS, PASS];
  rec.dead = [41];
  const back = decode(encode(rec));
  assert.deepEqual(back, rec);
  assert.equal(derive(back).phase, 'scoring');
});
