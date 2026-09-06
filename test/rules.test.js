import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK, WHITE, EMPTY, PASS, RESIGN, newRecord, derive, play, pass, resign, undo,
  toggleDead, accept, isLegal, handicapPoints, starPoints, score,
} from '../src/rules.js';

const at = (size, r, c) => r * size + c;

function playAll(record, moves) {
  for (const m of moves) {
    const view = derive(record);
    if (m === PASS) record = pass(record, view);
    else {
      assert.ok(isLegal(view, m), `move ${m} should be legal`);
      record = play(record, view, m);
    }
  }
  return record;
}

test('single stone capture and capture count', () => {
  const s = 9;
  let rec = newRecord({ size: s });
  // Black surrounds a white stone at (4,4).
  rec = playAll(rec, [at(s, 3, 4), at(s, 4, 4), at(s, 5, 4), at(s, 0, 0), at(s, 4, 3), at(s, 0, 1), at(s, 4, 5)]);
  const v = derive(rec);
  assert.equal(v.board[at(s, 4, 4)], EMPTY);
  assert.equal(v.captures[BLACK], 1);
  assert.equal(v.captures[WHITE], 0);
  assert.equal(v.toPlay, WHITE);
});

test('suicide is illegal, but capturing into a single point is legal', () => {
  const s = 9;
  // White stones surround corner point (0,0); black cannot play there.
  let rec = newRecord({ size: s });
  rec = playAll(rec, [at(s, 8, 8), at(s, 0, 1), at(s, 8, 7), at(s, 1, 0)]);
  let v = derive(rec);
  assert.equal(v.toPlay, BLACK);
  assert.equal(isLegal(v, at(s, 0, 0)), false);
  // Now give the white stone at (0,1) only one other liberty and take it: black at (1,1),(0,2) then (0,0) captures.
  rec = playAll(rec, [at(s, 1, 1), at(s, 8, 6), at(s, 0, 2), at(s, 8, 5), at(s, 2, 0)]);
  v = derive(rec);
  assert.equal(v.toPlay, WHITE);
  rec = pass(rec, v);
  v = derive(rec);
  assert.equal(isLegal(v, at(s, 0, 0)), true);
  rec = play(rec, v, at(s, 0, 0));
  v = derive(rec);
  assert.equal(v.board[at(s, 0, 1)], EMPTY);
  assert.equal(v.board[at(s, 1, 0)], EMPTY);
  assert.equal(v.captures[BLACK], 2);
});

test('positional superko: real ko fight', () => {
  const s = 9;
  let rec = newRecord({ size: s });
  // Ko at points a=(4,3) and b=(4,4).
  // Black: (3,3),(5,3),(4,2)  White: (3,4),(5,4),(4,5)
  const seq = [at(s, 3, 3), at(s, 3, 4), at(s, 5, 3), at(s, 5, 4), at(s, 4, 2), at(s, 4, 5)];
  rec = playAll(rec, seq);
  // White plays a=(4,3)?? No: black to play; black plays b=(4,4) which is surrounded by white on 3 sides and empty a.
  rec = playAll(rec, [at(s, 4, 4)]);
  // White captures it by playing a=(4,3).
  let v = derive(rec);
  assert.ok(isLegal(v, at(s, 4, 3)));
  rec = play(rec, v, at(s, 4, 3));
  v = derive(rec);
  assert.equal(v.board[at(s, 4, 4)], EMPTY);
  assert.equal(v.captures[WHITE], 1);
  // Black may not retake immediately.
  assert.equal(isLegal(v, at(s, 4, 4)), false);
  // After a tenuki exchange, black can retake.
  rec = playAll(rec, [at(s, 0, 0), at(s, 8, 8)]);
  v = derive(rec);
  assert.ok(isLegal(v, at(s, 4, 4)));
  rec = play(rec, v, at(s, 4, 4));
  v = derive(rec);
  assert.equal(v.board[at(s, 4, 3)], EMPTY);
  assert.equal(v.captures[BLACK], 1);
});

test('two passes enter scoring, undo leaves it and clears dead marks', () => {
  const s = 9;
  let rec = newRecord({ size: s });
  rec = playAll(rec, [at(s, 4, 4), at(s, 2, 2), PASS, PASS]);
  let v = derive(rec);
  assert.equal(v.phase, 'scoring');
  rec = toggleDead(rec, v, at(s, 2, 2));
  assert.deepEqual(rec.dead, [at(s, 2, 2)]);
  v = derive(rec);
  assert.equal(v.scoring.stones[WHITE], 0);
  rec = accept(rec, v);
  v = derive(rec);
  assert.equal(v.phase, 'over');
  assert.equal(v.result.type, 'score');
  assert.equal(v.result.winner, BLACK);
  // Undo first un-accepts, then removes a pass and clears dead marks.
  rec = undo(rec, v);
  assert.equal(rec.accepted, false);
  v = derive(rec);
  assert.equal(v.phase, 'scoring');
  rec = undo(rec, v);
  assert.deepEqual(rec.dead, []);
  v = derive(rec);
  assert.equal(v.phase, 'play');
  assert.equal(v.toPlay, WHITE);
});

test('area scoring counts stones plus territory, komi to white', () => {
  const s = 9;
  const board = new Uint8Array(s * s);
  // Black wall down column 4, black owns columns 0-3, white owns 5-8 via wall at column 5.
  for (let r = 0; r < s; r++) { board[at(s, r, 4)] = BLACK; board[at(s, r, 5)] = WHITE; }
  const sc = score(board, s, [], 7.5);
  assert.equal(sc.black, 9 + 36);
  assert.equal(sc.white, 9 + 27 + 7.5);
  assert.equal(sc.winner, BLACK);
  assert.equal(sc.margin, 1.5);
  // Opening the black wall lets its region touch white, so it becomes neutral.
  board[at(s, 0, 4)] = EMPTY;
  const sc2 = score(board, s, [], 0);
  assert.equal(sc2.territory[BLACK], 0);
  assert.equal(sc2.territory[WHITE], 27);
  // Marking the whole white wall dead hands white's side to black.
  const wall = [];
  for (let r = 0; r < s; r++) wall.push(at(s, r, 5));
  const sc3 = score(board, s, wall, 0);
  assert.equal(sc3.stones[WHITE], 0);
  assert.equal(sc3.black, 8 + 36 + 1 + 9 + 27);
});

test('resign ends the game for the opponent', () => {
  let rec = newRecord({ size: 9 });
  rec = playAll(rec, [0]);
  let v = derive(rec);
  rec = resign(rec, v);
  v = derive(rec);
  assert.equal(v.phase, 'over');
  assert.deepEqual(v.result, { type: 'resign', winner: BLACK });
  assert.equal(isLegal(v, 5), false);
  rec = undo(rec, v);
  assert.equal(derive(rec).phase, 'play');
});

test('handicap places black stones and white moves first', () => {
  const rec = newRecord({ size: 19, handicap: 4, komi: 0.5 });
  const v = derive(rec);
  assert.equal(v.toPlay, WHITE);
  for (const p of handicapPoints(19, 4)) assert.equal(v.board[p], BLACK);
  assert.equal(starPoints(19).length, 9);
  assert.equal(starPoints(9)[4], at(9, 4, 4));
  assert.equal(starPoints(13)[0], at(13, 3, 3));
  assert.equal(handicapPoints(19, 9).length, 9);
  assert.throws(() => newRecord({ size: 19, handicap: 1 }));
  assert.throws(() => newRecord({ size: 10 }));
});

test('derive rejects corrupt records', () => {
  assert.throws(() => derive({ size: 9, handicap: 0, komi: 7.5, moves: [0, 0], dead: [], accepted: false }));
  assert.throws(() => derive({ size: 9, handicap: 0, komi: 7.5, moves: [RESIGN, 0], dead: [], accepted: false }));
  assert.throws(() => derive({ size: 9, handicap: 0, komi: 7.5, moves: [PASS, PASS], dead: [3], accepted: false }));
});
