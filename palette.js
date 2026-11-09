// Command palette. Ctrl+K / Cmd+K (or "/" anywhere outside a text field) opens a
// single input that runs app commands and searches Spotify at the same time.
//
// It drives what already exists instead of duplicating it: nav buttons, transport,
// shuffle, lyrics, queue, settings and the stats panel are all clicked or
// dispatched through their real handlers, so no state lives in two places.
(() => {
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const $ = s => document.querySelector(s);
const click = s => { const el = $(s); if (el) el.click(); };
const nav = i => { const b = document.querySelectorAll('.nav button')[i]; if (b) b.click(); };
const live = () => !!(window.gb && gb.sp && gb.sp.active);
const transport = () => { if (live()) gb.sp.toggle(); else click('.mini .play'); };

const COMMANDS = [
  { label: 'Home', hint: 'View', run: () => nav(0) },
  { label: 'Search', hint: 'View', run: () => nav(1) },
  { label: 'Library', hint: 'View', run: () => nav(2) },
  { label: 'New playlist', hint: 'Create', run: () => window.gb && gb.newPlaylist && gb.newPlaylist(), when: 'in' },
  { label: 'Play or pause', hint: 'Playback', run: transport },
  { label: 'Next song', hint: 'Playback', run: () => live() && gb.sp.next() },
  { label: 'Previous song', hint: 'Playback', run: () => live() && gb.sp.prev() },
  { label: 'Open player', hint: 'Playback', run: () => click('#mini') },
  { label: 'Shuffle', hint: 'Playback', run: () => click('#shuffle') },
  { label: 'Repeat', hint: 'Playback', run: () => click('#repeat') },
  { label: 'Queue', hint: 'Playback', run: () => click('#more') },
  { label: 'Play on another device', hint: 'Playback', run: () => click('#dev') },
  { label: 'Lyrics', hint: 'Player', run: () => click('#lyr-btn') },
  { label: 'Listening stats', hint: 'Open', run: () => window.glassStats && window.glassStats.open() },
  { label: 'Settings', hint: 'Open', run: () => dispatchEvent(new Event('gb:settings')) },
  { label: 'Light mode', hint: 'Toggle', run: () => click('#lightsw') },
  { label: 'Log in with Spotify', hint: 'Account', run: () => window.gb && gb.login && gb.login(), when: 'out' },
  { label: 'Log out', hint: 'Account', run: () => window.gb && gb.logout && gb.logout(), when: 'in' }
];

let root = null, input = null, listEl = null, noteEl = null;
let rows = [];
let cursor = 0;
let searchTimer = 0;
let searchSeq = 0;
let results = [];

function build() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'cmdk';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Command palette');
  root.innerHTML =
    '<div class="cbox glass">' +
      '<div class="crow">' +
        '<svg class="ic" aria-hidden="true"><use href="#i-search"/></svg>' +
        '<input id="cmdk-q" type="text" autocomplete="off" spellcheck="false" ' +
          'placeholder="Search Spotify or run a command" aria-label="Search or run a command" ' +
          'aria-controls="cmdk-list" aria-autocomplete="list">' +
        '<kbd>esc</kbd>' +
      '</div>' +
      '<div class="clist" id="cmdk-list" role="listbox" aria-label="Results"></div>' +
      '<p class="cnote" id="cmdk-note"></p>' +
    '</div>';
  document.body.appendChild(root);

  input = root.querySelector('#cmdk-q');
  listEl = root.querySelector('#cmdk-list');
  noteEl = root.querySelector('#cmdk-note');

  input.addEventListener('input', onType);
  input.addEventListener('keydown', onKey);
  root.addEventListener('click', e => { if (e.target === root) close(); });
  listEl.addEventListener('click', e => {
    const row = e.target.closest('[data-i]');
    if (row) run(rows[+row.dataset.i]);
  });
}

function open() {
  build();
  root.classList.add('open');
  document.body.classList.add('cmdk-on');
  input.value = '';
  results = [];
  rows = COMMANDS.slice();
  cursor = 0;
  noteEl.textContent = 'Type to search Spotify, or pick a command.';
  draw();
  input.focus();
  input.select();
}

function close() {
  if (!root) return;
  root.classList.remove('open');
  document.body.classList.remove('cmdk-on');
  clearTimeout(searchTimer);
  if (document.activeElement === input) input.blur();
}

function isOpen() { return !!root && root.classList.contains('open'); }

function score(label, q) {
  const l = label.toLowerCase(), s = q.toLowerCase();
  if (!s) return 1;
  if (l.startsWith(s)) return 100;
  const i = l.indexOf(s);
  if (i >= 0) return 80 - i;
  // subsequence, "lst" still finds "Listening stats"
  let k = 0;
  for (let j = 0; j < l.length && k < s.length; j++) if (l[j] === s[k]) k++;
  return k === s.length ? 30 : 0;
}

function draw() {
  rows = [];
  const q = input.value.trim();
  const signedIn = !!(window.gb && gb.signedIn && gb.signedIn());

  const cmds = COMMANDS
    .filter(c => !c.when || (c.when === 'in' ? signedIn : !signedIn))
    .map(c => ({ c, s: score(c.label, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, q ? 6 : COMMANDS.length)
    .map(x => ({ kind: 'cmd', ...x.c }));

  rows = cmds.concat(results);
  if (!rows.length) cursor = -1;
  else cursor = Math.min(cursor, rows.length - 1);
  if (cursor < 0 && rows.length) cursor = 0;

  listEl.innerHTML = rows.map((r, i) => {
    const on = i === cursor ? ' aria-selected="true"' : '';
    const hint = r.kind === 'cmd' ? (r.hint || '') : (r.sub || '');
    const art = r.img
      ? '<span class="cart" style="--img:url(&quot;' + esc(r.img) + '&quot;)"></span>'
      : '<span class="cart ph"></span>';
    const title = r.kind === 'cmd' ? r.label : r.title;
    return '<button class="crow-item" role="option" data-i="' + i + '"' + on + '>' +
      art + '<span class="ctxt"><b>' + esc(title) + '</b><small>' + esc(hint) + '</small></span>' +
      '<span class="ckind">' + (r.kind === 'cmd' ? '⌘' : esc(r.kind)) + '</span></button>';
  }).join('');

  if (!rows.length) {
    listEl.innerHTML = '<p class="cnone">Nothing matches. Try a different word.</p>';
  }
}

function onType() {
  const q = input.value.trim();
  cursor = 0;
  clearTimeout(searchTimer);
  if (q.length < 2 || !window.gb || !gb.signedIn()) {
    results = [];
    if (q.length >= 2 && !(window.gb && gb.signedIn())) noteEl.textContent = 'Log in with Spotify to search.';
    else noteEl.textContent = 'Type to search Spotify, or pick a command.';
    return draw();
  }
  noteEl.textContent = 'Searching…';
  draw();
  searchTimer = setTimeout(() => search(q), 240);
}

async function search(q) {
  const n = ++searchSeq;
  try {
    const d = await gb.api('/search?' + new URLSearchParams({ q, type: 'track,artist,album', limit: 4 }));
    if (n !== searchSeq || !isOpen()) return;
    const t = ((d.tracks || {}).items || []).filter(Boolean);
    const a = ((d.artists || {}).items || []).filter(Boolean);
    const al = ((d.albums || {}).items || []).filter(Boolean);
    const pic = (imgs) => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
    results = []
      .concat(t.map(x => ({
        kind: 'track', title: x.name, sub: (x.artists || []).map(y => y.name).join(', '),
        img: pic((x.album || {}).images), uri: x.uri, list: t.map(y => y.uri).filter(Boolean)
      })))
      .concat(a.map(x => ({
        kind: 'artist', title: x.name, sub: 'Artist', img: pic(x.images),
        id: x.id, url: (x.external_urls || {}).spotify || ''
      })))
      .concat(al.map(x => ({
        kind: 'album', title: x.name, sub: 'Album, ' + (x.artists || []).map(y => y.name).join(', '),
        img: pic(x.images), id: x.id, url: (x.external_urls || {}).spotify || ''
      })));
    noteEl.textContent = results.length ? 'Enter plays a song or opens an artist.' : 'No results for that.';
    cursor = 0;
    draw();
  } catch (e) {
    if (n !== searchSeq) return;
    results = [];
    noteEl.textContent = e.message === '429' ? 'Too many searches. Wait a moment.' : 'Search failed. Try again.';
    draw();
  }
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); return close(); }
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    if (rows.length) { cursor = (cursor + 1) % rows.length; draw(); }
    return;
  }
  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault();
    if (rows.length) { cursor = (cursor - 1 + rows.length) % rows.length; draw(); }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (cursor >= 0 && rows[cursor]) run(rows[cursor]);
  }
}

function openDetail(r) {
  // browse.js listens for .opn clicks anywhere in the document and reads dataset.
  const b = document.createElement('button');
  b.className = 'opn';
  b.hidden = true;
  b.dataset.kind = r.kind;
  b.dataset.id = r.id;
  b.dataset.name = r.title;
  b.dataset.sub = r.sub || '';
  b.dataset.cover = r.img || '';
  b.dataset.url = r.url || '';
  document.body.appendChild(b);
  b.click();
  b.remove();
}

function run(r) {
  if (!r) return;
  close();
  if (r.kind === 'cmd') return r.run();
  if (r.kind === 'track') {
    if (window.gb && gb.play) gb.play(r.uri, r.list && r.list.length ? r.list : [r.uri]);
    return;
  }
  openDetail(r);
}

addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    isOpen() ? close() : open();
    return;
  }
  if (e.key === 'Escape' && isOpen()) { e.preventDefault(); return close(); }
  if (e.key === '/' && !isOpen()) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    open();
  }
}, true);

const style = document.createElement('style');
style.textContent = `
body.cmdk-on{overflow:hidden}
.cmdk{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;
  padding:min(12vh,5rem) .875rem 1rem;background:rgba(5,7,14,.5);
  -webkit-backdrop-filter:blur(.5rem);backdrop-filter:blur(.5rem);
  opacity:0;pointer-events:none;transition:opacity .18s}
.cmdk.open{opacity:1;pointer-events:auto}
.cbox{width:min(100%,38rem);max-height:min(70vh,32rem);border-radius:1.5rem;display:flex;
  flex-direction:column;overflow:hidden;background:linear-gradient(160deg,rgba(60,55,120,.72),rgba(10,13,26,.9))}
html[data-theme=light] .cbox{background:linear-gradient(160deg,rgba(255,255,255,.96),rgba(230,234,250,.98))}
.crow{display:flex;align-items:center;gap:.6rem;padding:.9rem 1rem;border-bottom:1px solid rgba(var(--tint),.12)}
.crow input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--text);font:inherit;font-size:1rem}
.crow input::placeholder{color:var(--muted)}
.crow kbd{font:inherit;font-size:.72rem;font-weight:700;letter-spacing:.04em;color:var(--muted);
  border:1px solid rgba(var(--tint),.18);border-radius:.5rem;padding:.15rem .4rem}
.clist{overflow-y:auto;padding:.4rem;display:flex;flex-direction:column;gap:.15rem;scrollbar-width:none}
.clist::-webkit-scrollbar{display:none}
.crow-item{display:flex;align-items:center;gap:.7rem;width:100%;padding:.55rem .65rem;border-radius:1rem;text-align:left}
.crow-item[aria-selected=true]{background:rgba(var(--tint),.16)}
.crow-item .cart{width:2.25rem;height:2.25rem;border-radius:.7rem;flex:none;background:var(--img,linear-gradient(145deg,rgba(var(--tint),.16),rgba(var(--tint),.04)));background-size:cover;background-position:center;border:1px solid rgba(var(--tint),.12)}
.crow-item .ctxt{flex:1;min-width:0;display:flex;flex-direction:column}
.crow-item b{font-size:.94rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crow-item small{font-size:.78rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ckind{font-size:.72rem;color:var(--muted);text-transform:capitalize;flex:none}
.cnote{margin:0;padding:.5rem 1rem .85rem;font-size:.78rem;color:var(--muted)}
.cnone{margin:0;padding:1.25rem .85rem;font-size:.88rem;color:var(--muted);text-align:center}
html[data-motion=reduced] .cmdk{transition:none}
`;
document.head.appendChild(style);

window.glassPalette = { open, close };
})();
