// Home screen with your real music (recent plays, playlists, top songs and artists). Needs spotify.js (gb) and player.js.
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');
const paint = root => root.querySelectorAll('[data-img]').forEach(e => { if (e.dataset.img) e.style.setProperty('--img', `url("${e.dataset.img}")`); });
const url = x => esc((x.external_urls || {}).spotify || '');

const trackCard = x => `<button class="card" data-play="${esc(x.uri)}"><div class="art" data-img="${esc(pic((x.album || {}).images))}"><span class="go"><svg class="ic"><use href="#i-play"/></svg></span></div><b>${esc(x.name)}</b><small>${esc(names(x))}</small></button>`;
const artistCard = x => `<button class="card round opn" data-kind="artist" data-id="${esc(x.id)}" data-name="${esc(x.name)}" data-sub="Artist" data-cover="${esc(pic(x.images))}" data-url="${url(x)}"><div class="art" data-img="${esc(pic(x.images))}"></div><b>${esc(x.name)}</b><small>Artist</small></button>`;
const tile = (p, me) => `<button class="tile glass opn" data-kind="playlist" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-sub="${(p.items || p.tracks || {}).total ?? 0} songs" data-cover="${esc(pic(p.images))}" data-url="${url(p)}" data-own="${(p.owner || {}).id === me ? 1 : 0}"><div class="art" data-img="${esc(pic(p.images))}"></div><span>${esc(p.name)}</span></button>`;

function fill(sel, html, heading, title) {
  $(sel).innerHTML = html; paint($(sel));
  if (heading) $(heading).textContent = title;
}

let done = false;
async function load() {
  const get = p => gb.api(p).catch(() => null);
  const [pls, rec, tops, topa] = await Promise.all([
    get('/me/playlists?limit=6'), get('/me/player/recently-played?limit=50'),
    get('/me/top/tracks?limit=10&time_range=short_term'), get('/me/top/artists?limit=10&time_range=short_term')
  ]);
  let real = false;
  const myId = gb.me && gb.me.id;
  const P = ((pls || {}).items || []).filter(Boolean);
  if (P.length) { fill('#quick', P.map(p => tile(p, myId)).join(''), '#h-pick', 'Your playlists'); real = true; }
  const seen = new Set();
  let R = ((rec || {}).items || []).map(i => i.track).filter(t => t && !seen.has(t.uri) && seen.add(t.uri)).slice(0, 10);
  if (!R.length) {
    let h = []; try { h = JSON.parse(localStorage.getItem('gb_history')) || []; } catch {}
    R = h.slice(0, 10).map(x => ({ uri: x.uri, name: x.title, artists: [{ name: x.artist }], album: { images: [{ url: x.img }] } }));
  }
  if (R.length) { fill('#jump', R.map(trackCard).join(''), '#h-jump', 'Recently played'); real = true; }
  const T = ((tops || {}).items || []).filter(Boolean);
  if (T.length) { fill('#top', T.map(trackCard).join('')); $('#sec-top').hidden = false; real = true; }
  const A = ((topa || {}).items || []).filter(Boolean);
  if (A.length) { fill('#made', A.map(artistCard).join(''), '#h-made', 'Your top artists'); real = true; }
  if (real) $('#view-home .chips').hidden = true;   // the Music/Podcasts chips only filter the placeholder content
}

window.addEventListener('gb:signedin', () => { if (!done) { done = true; load(); } });
window.addEventListener('gb:signedout', () => { if (done) location.reload(); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-play]');
  if (!c) return;
  gb.play(c.dataset.play, [...c.parentElement.querySelectorAll('[data-play]')].map(x => x.dataset.play));
});
})();
