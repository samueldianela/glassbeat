// Step 2: Search. Needs spotify.js to load first (it provides window.gb).
(() => {
const $q = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');
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
  if (!box.children.length || box.querySelector('#sl')) say(HINT);
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
  setNav(i);
  if (i === 1) { render(); $q('#q').focus(); }
  window.scrollTo(0, 0);
}
navBtns.forEach((b, i) => b.addEventListener('click', () => {
  if (i < 2) return go(i);
  setNav(current);
  toast('Library and playlists are coming in step 3.');
}));

// Results
function show(d) {
  const t = ((d.tracks || {}).items || []).filter(Boolean);
  const ar = ((d.artists || {}).items || []).filter(Boolean);
  const al = ((d.albums || {}).items || []).filter(Boolean);
  if (!t.length && !ar.length && !al.length) return say('<p class="note">No results. Try another spelling.</p>');
  const link = x => `href="${esc((x.external_urls || {}).spotify || '#')}" target="_blank" rel="noopener"`;
  const cards = (arr, round, sub) => '<div class="row">' + arr.map(x =>
    `<a class="card${round ? ' round' : ''}" ${link(x)}><div class="art" data-img="${esc(pic(x.images))}"></div><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></a>`).join('') + '</div>';
  let h = '';
  if (t.length) h += '<h2>Songs</h2><div class="list">' + t.map(x =>
    `<a class="item glass" ${link(x)}><div class="art sm" data-img="${esc(pic((x.album || {}).images))}"></div><div class="meta"><strong>${esc(x.name)}</strong><span>${esc(names(x))}</span></div><span class="dur">${mmss(x.duration_ms)}</span></a>`).join('') + '</div>';
  if (ar.length) h += '<h2>Artists</h2>' + cards(ar, true, () => 'Artist');
  if (al.length) h += '<h2>Albums</h2>' + cards(al, false, x => 'Album, ' + names(x));
  say(h + '<p class="note">Tap a result to open it in Spotify.</p>');
  box.querySelectorAll('[data-img]').forEach(e => { if (e.dataset.img) e.style.setProperty('--img', `url("${e.dataset.img}")`); });
}

async function run(term) {
  const n = ++seq;
  say('<p class="note">Searching…</p>');
  try {
    const d = await gb.api('/search?' + new URLSearchParams({ q: term, type: 'track,artist,album', limit: 10 }));
    if (n === seq) show(d);
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
  if (term.length < 2) { seq++; return say(HINT); }
  timer = setTimeout(() => run(term), 350);
});
})();
