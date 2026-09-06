import * as R from './rules.js';
import { encode, decode } from './codec.js';
import { renderBoard, pointFromEvent } from './board.js';

const $ = (id) => document.getElementById(id);
const els = {
  board: $('board'), message: $('message'),
  black: $('player-black'), white: $('player-white'),
  capBlack: $('captures-black'), capWhite: $('captures-white'),
  undo: $('undo'), pass: $('pass'), accept: $('accept'), resign: $('resign'), reset: $('reset'),
  share: $('share'), menu: $('menu'), settings: $('settings'), form: $('settings-form'), cancel: $('cancel'),
  toast: $('toast'),
};

let record;
let view;
let lastHash = '';

function loadFromHash() {
  const hash = location.hash.slice(1);
  if (hash === lastHash && record) return;
  try {
    record = hash ? decode(hash) : R.newRecord();
    view = R.derive(record);
  } catch (err) {
    console.warn('Could not read game from URL:', err);
    record = R.newRecord();
    view = R.derive(record);
    toast('That link was not a valid game. Started a new one.');
  }
  lastHash = hash;
  render();
}

function update(next, { push = false } = {}) {
  if (next === record) return;
  try {
    const nextView = R.derive(next);
    record = next;
    view = nextView;
  } catch (err) {
    console.error(err);
    return;
  }
  lastHash = encode(record);
  // A new game gets its own history entry so the browser back button
  // returns to the game it replaced.
  history[push ? 'pushState' : 'replaceState'](null, '', '#' + lastHash);
  render();
}

const NAMES = { [R.BLACK]: 'Black', [R.WHITE]: 'White' };

function render() {
  renderBoard(els.board, view);
  els.capBlack.textContent = view.captures[R.BLACK];
  els.capWhite.textContent = view.captures[R.WHITE];
  els.black.classList.toggle('active', view.phase === 'play' && view.toPlay === R.BLACK);
  els.white.classList.toggle('active', view.phase === 'play' && view.toPlay === R.WHITE);
  els.black.classList.toggle('winner', view.phase === 'over' && view.result.winner === R.BLACK);
  els.white.classList.toggle('winner', view.phase === 'over' && view.result.winner === R.WHITE);

  let msg = '';
  if (view.phase === 'play') {
    if (view.lastMove === R.PASS) msg = `<small>${NAMES[R.other(view.toPlay)]} passed</small>`;
  } else if (view.phase === 'scoring') {
    const { black, white } = view.scoring;
    msg = `B ${black} &middot; W ${white}<small>tap dead stones, then accept</small>`;
  } else if (view.result.type === 'resign') {
    msg = `${NAMES[view.result.winner]} wins<small>by resignation</small>`;
  } else if (view.result.winner === R.EMPTY) {
    msg = 'Draw';
  } else {
    msg = `${NAMES[view.result.winner]} wins<small>by ${view.result.margin} points</small>`;
  }
  els.message.innerHTML = msg;

  els.pass.hidden = view.phase !== 'play';
  els.accept.hidden = view.phase !== 'scoring';
  els.undo.disabled = view.moveCount === 0 && !record.accepted;
  els.resign.hidden = view.phase !== 'play';
  els.reset.disabled = view.moveCount === 0;
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

async function shareLink() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    if (navigator.share) {
      try { await navigator.share({ url }); return; } catch { /* cancelled */ }
    }
    prompt('Copy this link:', url);
  }
}

els.board.addEventListener('click', (e) => {
  const idx = pointFromEvent(els.board, view.size, e);
  if (idx === null) return;
  if (view.phase === 'play') update(R.play(record, view, idx));
  else if (view.phase === 'scoring') update(R.toggleDead(record, view, idx));
});
els.undo.addEventListener('click', () => update(R.undo(record, view)));
els.pass.addEventListener('click', () => update(R.pass(record, view)));
els.accept.addEventListener('click', () => update(R.accept(record, view)));
els.share.addEventListener('click', shareLink);

els.menu.addEventListener('click', () => {
  els.form.elements.size.value = String(record.size);
  els.form.elements.handicap.value = String(record.handicap);
  els.form.elements.komi.value = String(record.komi);
  els.settings.showModal();
});
els.cancel.addEventListener('click', () => els.settings.close());
els.form.elements.handicap.addEventListener('change', (e) => {
  // Convention: handicap games use half-point komi so ties are impossible.
  els.form.elements.komi.value = e.target.value === '0' ? '7.5' : '0.5';
});
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = els.form.elements;
  update(R.newRecord({
    size: Number(f.size.value),
    handicap: Number(f.handicap.value),
    komi: Number(f.komi.value),
  }), { push: true });
  els.settings.close();
});
els.reset.addEventListener('click', () => {
  update(R.newRecord({ size: record.size, handicap: record.handicap, komi: record.komi }), { push: true });
});
els.resign.addEventListener('click', () => {
  if (!confirm(`${NAMES[view.toPlay]} resigns?`)) return;
  update(R.resign(record, view));
});

window.addEventListener('hashchange', loadFromHash);
loadFromHash();
