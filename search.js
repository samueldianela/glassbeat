// Step 2: Search. Needs spotify.js to load first (it provides window.gb).
(() => {
const $q = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');
const RK = 'gb_recent';
const recents = () => { try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; } };
const saveRecent = t => { try { localStorage.setItem(RK, JSON.stringify([t, ...recents().filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 8))); } catch {} };
const hint = () => { const r = recents(); return HINT + (r.length ? '<div class="recents">' + r.map(t => `<button class="recent" data-t="${esc(t)}">${esc(t)}</button>`).join('') + '<button class="recent clear" data-clear="1">Clear</button></div>' : ''); };
const HINT = '<p class="note">Search for songs, artists and albums.</p>';
const box = $q('#sres');
const navBtns = [...document.querySelectorAll('.nav button')];
let current = 0, seq = 0, timer;

const say = html => { box.innerHTML = html; };
function needLogin() {
  say('<div class="empty glass"><p>Log in with Spotify to search.</p><button class="login glass" id="sl">Log in with Spotify</button></div>');
  $q('#sl').onclick = () => gb.login();
}
function render() {
  if (!gb.signedIn()) return needLogin();
  if (!box.children.length || box.querySelector('#sl')) say(hint());
}

// Switching between Home and Search
function setNav(i) {
  navBtns.forEach((b, j) => {
    b.classList.toggle('on', i === j);
    i === j ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
}
function go(i) {
  current = i;
  $q('#view-home').hidden = i !== 0;
  $q('#view-search').hidden = i !== 1;
  $q('#view-library').hidden = i !== 2;
  setNav(i);
  if (i === 1) { render(); $q('#q').focus(); }
  if (i === 2) gb.openLibrary();
  window.scrollTo(0, 0);
}
navBtns.forEach((b, i) => b.addEventListener('click', () => {
  if (i < 3) return go(i);
  setNav(current);
  gb.newPlaylist();
}));

// Results
function show(d) {
  const t = ((d.tracks || {}).items || []).filter(Boolean);
  const ar = ((d.artists || {}).items || []).filter(Boolean);
  const al = ((d.albums || {}).items || []).filter(Boolean);
  if (!t.length && !ar.length && !al.length) return say('<p class="note">No results. Try another spelling.</p>');
  const link = x => `href="${esc((x.external_urls || {}).spotify || '#')}" target="_blank" rel="noopener"`;
  const cards = (arr, round, sub, kind) => '<div class="row">' + arr.map(x =>
    `<button class="card opn${round ? ' round' : ''}" data-kind="${kind}" data-id="${esc(x.id)}" data-name="${esc(x.name)}" data-sub="${esc(sub(x))}" data-cover="${esc(pic(x.images))}" data-url="${esc((x.external_urls || {}).spotify || '')}"><div class="art" data-img="${esc(pic(x.images))}"></div><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></button>`).join('') + '</div>';
  let h = '';
  if (t.length) h += '<h2>Songs</h2><div class="list">' + t.map(x =>
    `<div class="item glass" data-uri="${esc(x.uri)}"><button class="open" aria-label="Play ${esc(x.name)}"><div class="art sm" data-img="${esc(pic((x.album || {}).images))}"></div><div class="meta"><strong>${esc(x.name)}</strong><span>${esc(names(x))}</span></div></button><a class="ib ext" ${link(x)} aria-label="Open in Spotify"><svg class="ic"><use href="#i-ext"/></svg></a><button class="ib sv" aria-label="Save to library" aria-pressed="false"><svg class="ic"><use href="#i-heart"/></svg></button><button class="ib ad" aria-label="Add to playlist"><svg class="ic"><use href="#i-plus"/></svg></button></div>`).join('') + '</div>';
  if (ar.length) h += '<h2>Artists</h2>' + cards(ar, true, () => 'Artist', 'artist');
  if (al.length) h += '<h2>Albums</h2>' + cards(al, false, x => 'Album, ' + names(x), 'album');
  say(h + '<p class="note">Tap a result to open it in Spotify.</p>');
  box.querySelectorAll('[data-img]').forEach(e => { if (e.dataset.img) e.style.setProperty('--img', `url("${e.dataset.img}")`); });
  gb.markSaved(box);
}

async function run(term) {
  const n = ++seq;
  say('<p class="note">Searching…</p>');
  try {
    const d = await gb.api('/search?' + new URLSearchParams({ q: term, type: 'track,artist,album', limit: 10 }));
    if (n === seq) { show(d); saveRecent(term); }
  } catch (e) {
    if (n !== seq) return;
    if (e.message === 'signed out') return needLogin();
    say(`<p class="note">${e.message === '429' ? 'Too many searches. Wait a moment and try again.' : 'Search failed. Try again.'}</p>`);
  }
}

$q('#q').addEventListener('input', e => {
  clearTimeout(timer);
  const term = e.target.value.trim();
  if (!gb.signedIn()) return needLogin();
  if (term.length < 2) { seq++; return say(hint()); }
  timer = setTimeout(() => run(term), 350);
});
box.addEventListener('click', e => {
  const o = e.target.closest('button.open');
  if (o) return gb.play(o.closest('.item').dataset.uri, [...o.closest('.list').querySelectorAll('.item[data-uri]')].map(i => i.dataset.uri));
  const b = e.target.closest('.sv, .ad');
  if (!b) return;
  const uri = b.closest('.item').dataset.uri;
  b.classList.contains('sv') ? gb.toggleSave(uri, b) : gb.pickPlaylist(uri);
});
box.addEventListener('click', e => {
  const r = e.target.closest('.recent');
  if (!r) return;
  if (r.dataset.clear) { try { localStorage.removeItem(RK); } catch {} return say(hint()); }
  $q('#q').value = r.dataset.t;
  run(r.dataset.t);
});
})();
