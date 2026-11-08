// Two home shelves Spotify's current API no longer hands out ready-made:
//
//   New from your artists  — recent albums and singles pulled from the artists you
//                            actually listen to and follow, because /browse/new-releases
//                            is closed to apps created after Nov 2024.
//   Worth another listen   — long-term top tracks you have not played recently.
//
// The artist fan-out is six requests, so the result is cached for twelve hours and
// the shelf renders from cache while a refresh runs in the background.
(() => {
'use strict';

const CACHE = 'gb_discover';
const TTL = 12 * 36e5;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');

let busy = false;
let mounted = false;

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE));
    if (d && typeof d === 'object' && Array.isArray(d.albums)) return d;
  } catch (e) {}
  return null;
}

function write(d) {
  try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) {}
}

function paint(root) {
  root.querySelectorAll('[data-img]').forEach(e => {
    if (e.dataset.img) e.style.setProperty('--img', 'url("' + e.dataset.img + '")');
  });
}

function mount() {
  if (mounted) return;
  const host = document.getElementById('view-home');
  if (!host) return;
  mounted = true;

  const fresh = document.createElement('section');
  fresh.id = 'sec-new';
  fresh.innerHTML = '<h2 id="h-new">New from your artists</h2><div class="row" id="newrel"></div>';
  host.appendChild(fresh);

  const back = document.createElement('section');
  back.id = 'sec-back';
  back.innerHTML = '<h2 id="h-back">Worth another listen</h2><div class="row" id="again"></div>';
  host.appendChild(back);
}

const albumCard = x =>
  '<button class="card opn" data-kind="album" data-id="' + esc(x.id) + '" data-name="' + esc(x.name) +
  '" data-sub="' + esc('Album, ' + x.artist) + '" data-cover="' + esc(x.img) + '" data-url="' + esc(x.url) + '">' +
  '<div class="art" data-img="' + esc(x.img) + '"></div><b>' + esc(x.name) + '</b>' +
  '<small>' + esc(x.artist) + ' · ' + esc(x.date) + '</small></button>';

const trackCard = x =>
  '<button class="card" data-rec="' + esc(x.uri) + '"><div class="art" data-img="' + esc(x.img) + '">' +
  '<span class="go"><svg class="ic"><use href="#i-play"/></svg></span></div>' +
  '<b>' + esc(x.name) + '</b><small>' + esc(x.artist) + '</small></button>';

function render(d) {
  mount();
  const rowA = document.getElementById('newrel');
  const rowB = document.getElementById('again');
  if (!rowA || !rowB) return;

  const albums = (d && d.albums) || [];
  const old = (d && d.tracks) || [];

  const secA = document.getElementById('sec-new');
  const secB = document.getElementById('sec-back');

  if (albums.length) {
    rowA.innerHTML = albums.map(albumCard).join('');
    paint(rowA);
    secA.hidden = false;
  } else {
    secA.hidden = true;
  }

  if (old.length) {
    rowB.innerHTML = old.map(trackCard).join('');
    paint(rowB);
    secB.hidden = false;
    rowB.onclick = e => {
      const c = e.target.closest('[data-rec]');
      if (!c) return;
      const uris = old.map(x => x.uri);
      if (window.gb && gb.play) gb.play(c.dataset.rec, uris);
    };
  } else {
    secB.hidden = true;
  }
}

function stamp(date) {
  if (!date) return '';
  const p = date.split('-');
  if (p.length === 1) return p[0];
  const d = new Date(+p[0], +p[1] - 1, p[2] ? +p[2] : 1);
  return d.toLocaleDateString(undefined, { month: 'short', day: p[2] ? 'numeric' : undefined });
}

async function collect() {
  const get = p => gb.api(p).catch(() => null);
  const [topA, follow, topT] = await Promise.all([
    get('/me/top/artists?limit=12&time_range=medium_term'),
    get('/me/following?type=artist&limit=20'),
    get('/me/top/tracks?limit=50&time_range=long_term')
  ]);

  const seen = new Set();
  const artists = []
    .concat(((topA || {}).items) || [])
    .concat((((follow || {}).artists) || {}).items || [])
    .filter(a => a && a.id && !seen.has(a.id) && seen.add(a.id))
    .slice(0, 6);

  const pages = await Promise.all(artists.map(a =>
    get('/artists/' + encodeURIComponent(a.id) + '/albums?include_groups=album,single&limit=4')));

  const cutoff = Date.now() - 150 * 864e5;
  const albums = [];
  const ids = new Set();
  pages.forEach((page, i) => {
    const owner = artists[i] ? artists[i].name : '';
    ((page || {}).items || []).forEach(a => {
      if (!a || !a.id || ids.has(a.id)) return;
      const when = a.release_date ? new Date(a.release_date) : null;
      if (!when || isNaN(when) || when.getTime() < cutoff) return;
      ids.add(a.id);
      albums.push({
        id: a.id,
        name: a.name,
        artist: owner,
        img: pic(a.images),
        url: (a.external_urls || {}).spotify || '',
        date: stamp(a.release_date),
        at: when.getTime()
      });
    });
  });
  albums.sort((a, b) => b.at - a.at);

  let recent = new Set();
  try {
    const h = JSON.parse(localStorage.getItem('gb_history')) || [];
    recent = new Set(h.map(x => x.uri));
  } catch (e) {}

  const tracks = (((topT || {}).items) || [])
    .filter(t => t && t.uri && !recent.has(t.uri))
    .slice(0, 12)
    .map(t => ({
      uri: t.uri,
      name: t.name,
      artist: names(t),
      img: pic((t.album || {}).images)
    }));

  return { at: Date.now(), albums: albums.slice(0, 12), tracks };
}

async function load() {
  if (busy || !window.gb || !gb.signedIn()) return;
  mount();
  const cached = read();
  if (cached) render(cached);
  if (cached && Date.now() - cached.at < TTL) return;

  busy = true;
  try {
    const d = await collect();
    if (d.albums.length || d.tracks.length) { write(d); render(d); }
  } catch (e) { /* a failed refresh keeps whatever the cache had */ }
  busy = false;
}

addEventListener('gb:signedin', load);
addEventListener('gb:signedout', () => {
  const a = document.getElementById('sec-new'), b = document.getElementById('sec-back');
  if (a) a.hidden = true;
  if (b) b.hidden = true;
});

// spotify.js may have finished before this file parsed, so check once directly too.
if (window.gb && gb.signedIn && gb.signedIn()) setTimeout(load, 600);

window.glassDiscover = { load, clear: () => { try { localStorage.removeItem(CACHE); } catch (e) {} } };
})();
