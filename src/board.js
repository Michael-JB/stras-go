// Renders a game view into an <svg> element and reports taps as point indices.
import { BLACK, WHITE, EMPTY, PASS, RESIGN, starPoints } from './rules.js';

const STONE = { [BLACK]: '#111', [WHITE]: '#f6f6f6' };
const PAD = 0.2; // wood margin outside the outermost lines, in grid units

export function renderBoard(svg, view) {
  const { size, board, lastMove, phase, dead, scoring } = view;
  const extent = size + 2 * PAD;
  svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${extent} ${extent}`);
  const parts = [];
  parts.push(`<defs>
    <radialGradient id="gb" cx="0.38" cy="0.35" r="0.65"><stop offset="0" stop-color="#5a5a5a"/><stop offset="1" stop-color="#0a0a0a"/></radialGradient>
    <radialGradient id="gw" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#e6e4df"/><stop offset="1" stop-color="#b9b6ae"/></radialGradient>
  </defs>`);
  parts.push(`<rect x="${-PAD}" y="${-PAD}" width="${extent}" height="${extent}" rx="0.15" fill="var(--wood)" stroke="none"/>`);

  const lo = 0.5, hi = size - 0.5;
  for (let i = 0; i < size; i++) {
    const p = i + 0.5;
    parts.push(`<line x1="${lo}" y1="${p}" x2="${hi}" y2="${p}"/>`);
    parts.push(`<line x1="${p}" y1="${lo}" x2="${p}" y2="${hi}"/>`);
  }
  for (const s of starPoints(size)) {
    parts.push(`<circle cx="${(s % size) + 0.5}" cy="${Math.floor(s / size) + 0.5}" r="0.09" fill="var(--line)" stroke="none"/>`);
  }

  if (scoring) {
    for (let i = 0; i < board.length; i++) {
      const o = scoring.owner[i];
      if (!o) continue;
      const x = (i % size) + 0.5, y = Math.floor(i / size) + 0.5;
      parts.push(`<rect x="${x - 0.14}" y="${y - 0.14}" width="0.28" height="0.28" fill="${STONE[o]}" stroke="${o === WHITE ? '#555' : 'none'}" stroke-width="0.03"/>`);
    }
  }

  for (let i = 0; i < board.length; i++) {
    const c = board[i];
    if (c === EMPTY) continue;
    const x = (i % size) + 0.5, y = Math.floor(i / size) + 0.5;
    const isDead = dead.has(i);
    parts.push(`<g class="stone" ${isDead ? 'opacity="0.35"' : ''}>`);
    parts.push(`<circle cx="${x + 0.03}" cy="${y + 0.04}" r="0.47" fill="#000" opacity="0.28" stroke="none"/>`);
    parts.push(`<circle cx="${x}" cy="${y}" r="0.47" fill="url(#${c === BLACK ? 'gb' : 'gw'})" stroke="none"/>`);
    if (isDead) {
      const k = c === BLACK ? '#fff' : '#000';
      parts.push(`<line x1="${x - 0.22}" y1="${y - 0.22}" x2="${x + 0.22}" y2="${y + 0.22}" stroke="${k}" stroke-width="0.08"/>`);
      parts.push(`<line x1="${x + 0.22}" y1="${y - 0.22}" x2="${x - 0.22}" y2="${y + 0.22}" stroke="${k}" stroke-width="0.08"/>`);
    } else if (i === lastMove && phase === 'play') {
      parts.push(`<circle cx="${x}" cy="${y}" r="0.16" fill="none" stroke="${c === BLACK ? '#fff' : '#000'}" stroke-width="0.07"/>`);
    }
    parts.push('</g>');
  }

  // One invisible full-board target keeps hit testing simple.
  parts.push(`<rect class="hit" x="${-PAD}" y="${-PAD}" width="${extent}" height="${extent}" fill="transparent" stroke="none"/>`);
  svg.innerHTML = `<g stroke="var(--line)" stroke-width="0.035" stroke-linecap="square">${parts.join('')}</g>`;
}

// Translate a pointer event to a board index, or null if off the grid.
export function pointFromEvent(svg, size, event) {
  const rect = svg.getBoundingClientRect();
  const scale = (size + 2 * PAD) / rect.width;
  const col = Math.floor((event.clientX - rect.left) * scale - PAD);
  const row = Math.floor((event.clientY - rect.top) * scale - PAD);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;
  return row * size + col;
}

export { PASS, RESIGN };
