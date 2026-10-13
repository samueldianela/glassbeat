// Step 5: Lyrics from LRCLIB (a free, community-made lyrics database). Shown in the full player.
(() => {
const sheet = document.getElementById('sheet'), seek = document.getElementById('seek');
const panel = document.getElementById('lyrics'), btn = document.getElementById('lyr-btn');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const note = t => `<p class="lnote">${t}</p>`;
const title = () => sheet.querySelector('.t-title').textContent.trim();
const artist = () => sheet.querySelector('.t-artist').textContent.split(',')[0].trim();
const parse = lrc => lrc.split('\n').map(l => {
  const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
  return m ? { t: +m[1] * 60 + +m[2], s: m[3] } : null;
}).filter(Boolean);
const cache = new Map();
let on = false, key = '', seq = 0, lines = [], idx = -1;

function render(d) {
  lines = []; idx = -1;
  panel.classList.remove('plain');
  if (!d || (!d.syncedLyrics && !d.plainLyrics)) { panel.innerHTML = note(d && d.instrumental ? 'Instrumental.' : 'No lyrics found for this song.'); return; }
  lines = d.syncedLyrics ? parse(d.syncedLyrics) : [];
  const rows = lines.length ? lines.map(l => l.s) : String(d.plainLyrics || '').split('\n');
  if (!lines.length) panel.classList.add('plain');
  panel.innerHTML = rows.map((s, i) => `<p class="ly" data-i="${i}">${esc(s) || '&nbsp;'}</p>`).join('') + note('Lyrics from LRCLIB');
  panel.scrollTop = 0;
}
async function find(t, a, dur) {
  const base = { track_name: t, artist_name: a };
  let r = await fetch('https://lrclib.net/api/get?' + new URLSearchParams(dur ? { ...base, duration: dur } : base));
  if (r.ok) return r.json();
  r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(base));
  const arr = r.ok ? await r.json() : [];
  return (arr || []).find(x => x.syncedLyrics) || (arr || [])[0] || null;
}
async function load() {
  const t = title(), a = artist(), k = t + '|' + a;
  if (!t || k === key) return;
  key = k; const n = ++seq;
  lines = []; idx = -1;
  panel.innerHTML = note('Finding lyrics…');
  try {
    if (!cache.has(k)) cache.set(k, await find(t, a, Math.round(+seek.max) || 0));
    if (n === seq) render(cache.get(k));
  } catch { key = ''; if (n === seq) panel.innerHTML = note('Could not load lyrics.'); }
}

// Highlight the current line while the song plays
setInterval(() => {
  if (!on || !lines.length) return;
  const p = +seek.value + 0.3;
  let i = -1;
  for (let j = 0; j < lines.length && lines[j].t <= p; j++) i = j;
  if (i === idx) return;
  idx = i;
  panel.querySelectorAll('.ly.now').forEach(e => e.classList.remove('now'));
  const el = panel.querySelector(`.ly[data-i="${i}"]`);
  if (el) { el.classList.add('now'); panel.scrollTo({ top: el.offsetTop - panel.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' }); }
}, 300);

new MutationObserver(() => { if (on) load(); }).observe(sheet.querySelector('.t-title'), { childList: true, characterData: true, subtree: true });
btn.onclick = () => {
  on = !on;
  btn.setAttribute('aria-pressed', on);
  sheet.classList.toggle('lyr', on);
  if (on) load();
};
})();
