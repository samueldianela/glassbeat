// Album and artist pages. Needs spotify.js, player.js (gb.play) and library.js (gb.markSaved, toggleSave, pickPlaylist).
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');
const note = t => `<p class="note">${t}</p>`;
const view = $('#view-detail');
const views = ['#view-home', '#view-search', '#view-library'];
let prev = null, hist = [], current = null;

// Open a page; Back returns to the previous page, then to the screen you came from
function go(fn) {
  if (view.hidden) { prev = views.map($).find(v => !v.hidden) || null; if (prev) prev.hidden = true; view.hidden = false; }
  else hist.push(current);
  current = fn; fn(); window.scrollTo(0, 0);
}
function back() {
  if (hist.length) { current = hist.pop(); current(); return; }
  view.hidden = true; if (prev) prev.hidden = false;
  prev = null; current = null;
}
const paint = () => view.querySelectorAll('[data-img]').forEach(e => { if (e.dataset.img) e.style.setProperty('--img', `url("${e.dataset.img}")`); });
const spotifyLink = url => url ? `<a class="login glass" href="${esc(url)}" target="_blank" rel="noopener">Open in Spotify</a>` : '';

function head(a, kind, ctx) {
  view.dataset.ctx = ctx;
  view.innerHTML = `<div class="dact"><button class="login glass" id="dback">Back</button></div>
    <div class="dtop"><div class="art" data-img="${esc(a.img)}"></div><div><h2 class="dname">${esc(a.name)}</h2><p class="dsub">${esc(a.sub || kind)}</p></div></div>
    <div class="dact"><button class="login glass" id="dplay">Play</button>${spotifyLink(a.url)}</div><div id="dbody">${note('Loading…')}</div>`;
  $('#dback').onclick = back;
  $('#dplay').onclick = () => gb.play(null, null, ctx);
  paint();
}
const body = h => { const b = $('#dbody'); if (!b) return; b.innerHTML = h; paint(); gb.markSaved(view); };
const fail = e => body(note(e.message === '429' ? 'Too many requests. Wait a moment and try again.' : e.message === 'signed out' ? 'Please log in again.' : 'Could not load this page (error ' + e.message + '). Try again.'));

const row = (x, cover, rm) => `<div class="item glass" data-uri="${esc(x.uri)}"><button class="open" aria-label="Play ${esc(x.name)}"><div class="art sm" data-img="${esc(cover)}"></div><div class="meta"><strong>${esc(x.name)}</strong><span>${esc(names(x))}</span></div></button><a class="ib ext" href="${esc((x.external_urls || {}).spotify || '#')}" target="_blank" rel="noopener" aria-label="Open in Spotify"><svg class="ic"><use href="#i-ext"/></svg></a><button class="ib sv" aria-label="Save to library" aria-pressed="false"><svg class="ic"><use href="#i-heart"/></svg></button><button class="ib ad" aria-label="Add to playlist"><svg class="ic"><use href="#i-plus"/></svg></button>${rm ? '<button class="ib rm" aria-label="Remove from playlist"><svg class="ic"><use href="#i-x"/></svg></button>' : ''}</div>`;

const albumRow = x => `<button class="item glass opn" data-kind="album" data-id="${esc(x.id)}" data-name="${esc(x.name)}" data-sub="${esc('Album, ' + names(x))}" data-cover="${esc(pic(x.images))}" data-url="${esc((x.external_urls || {}).spotify || '')}"><div class="art sm" data-img="${esc(pic(x.images))}"></div><div class="meta"><strong>${esc(x.name)}</strong><span>${esc((x.release_date || '').slice(0, 4))}</span></div></button>`;

async function album(a) {
  head(a, 'Album', 'spotify:album:' + a.id);
  try {
    const d = await gb.api(`/albums/${encodeURIComponent(a.id)}/tracks?limit=50`);
    const t = (d.items || []).filter(Boolean);
    body(t.length ? '<div class="list">' + t.map(x => row(x, a.img)).join('') + '</div>' : note('No songs found.'));
  } catch (e) { fail(e); }
}
async function artist(a) {
  head(a, 'Artist', 'spotify:artist:' + a.id);
  const id = encodeURIComponent(a.id), q = 'artist:"' + String(a.name).replace(/"/g, '') + '"';
  const mine = x => (x.artists || []).some(r => r.id === a.id);
  const albums = async () => {
    let last;
    for (const p of [`/artists/${id}/albums?include_groups=album,single&limit=20`, `/artists/${id}/albums?limit=10`]) {
      try { return ((await gb.api(p)).items || []).filter(Boolean); }
      catch (e) { last = e; if (e.message === 'signed out') throw e; }
    }
    try {
      const d = await gb.api('/search?' + new URLSearchParams({ q, type: 'album', limit: 10 }));
      return ((d.albums || {}).items || []).filter(x => x && mine(x));
    } catch { throw last; }
  };
  const songs = async () => {
    const d = await gb.api('/search?' + new URLSearchParams({ q, type: 'track', limit: 10 }));
    return ((d.tracks || {}).items || []).filter(x => x && mine(x));
  };
  const [al, so] = await Promise.allSettled([albums(), songs()]);
  if (al.status === 'rejected' && so.status === 'rejected') return fail(al.reason);
  const A = al.status === 'fulfilled' ? al.value : [], T = so.status === 'fulfilled' ? so.value : [];
  body((T.length ? '<h2>Songs</h2><div class="list">' + T.map(x => row(x, pic((x.album || {}).images))).join('') + '</div>' : '')
    + (A.length ? '<h2>Albums</h2><div class="list">' + A.map(albumRow).join('') + '</div>' : '')
    || note('Nothing found for this artist.'));
}

async function playlist(a) {
  head(a, 'Playlist', 'spotify:playlist:' + a.id);
  view.dataset.pid = a.id;
  const own = a.own === '1';
  $('#dplay').parentElement.insertAdjacentHTML('beforeend', own
    ? '<button class="login glass" id="dren">Rename</button><button class="login glass" id="ddel">Delete</button>'
    : '<button class="login glass" id="ddel">Remove</button>');
  const ren = $('#dren');
  if (ren) ren.onclick = async () => {
    const n = (prompt('Rename playlist', a.name) || '').trim();
    if (!n || n === a.name) return;
    try { await gb.api('/playlists/' + encodeURIComponent(a.id), 'PUT', { name: n }); a.name = n; $('.dname').textContent = n; toast('Renamed'); }
    catch (e) { toast('Could not rename it (error ' + e.message + ').'); }
  };
  $('#ddel').onclick = async () => {
    if (!confirm(own ? 'Delete this playlist?' : 'Remove this playlist from your library?')) return;
    try {
      await gb.api('/me/library?uris=' + encodeURIComponent('spotify:playlist:' + a.id), 'DELETE');
      toast(own ? 'Playlist deleted' : 'Removed from your library');
      back();
      setTimeout(() => { if (!$('#view-library').hidden) gb.openLibrary(); }, 50);
    } catch (e) { toast('Could not remove it (error ' + e.message + ').'); }
  };
  try {
    const d = await gb.api(`/playlists/${encodeURIComponent(a.id)}/items?limit=50`);
    const l = (d.items || []).map(i => i.item || i.track).filter(x => x && String(x.uri).startsWith('spotify:track'));
    body(l.length ? '<div class="list">' + l.map(x => row(x, pic((x.album || {}).images), own)).join('') + '</div>' : note('No songs here yet.'));
  } catch (e) {
    body(note(e.message === '403' ? 'Spotify only shows the songs of playlists you own or share. You can still press Play.' : 'Could not load this playlist (error ' + e.message + ').'));
  }
}

view.addEventListener('click', e => {
  const r = e.target.closest('.rm');
  if (r) {
    const li = r.closest('.item');
    return gb.api('/playlists/' + encodeURIComponent(view.dataset.pid) + '/items', 'DELETE', { items: [{ uri: li.dataset.uri }] })
      .then(() => { li.remove(); toast('Removed from playlist'); })
      .catch(er => toast('Could not remove it (error ' + er.message + ').'));
  }
  const o = e.target.closest('button.open');
  if (o) {
    const uri = o.closest('.item').dataset.uri;
    if (view.dataset.ctx.startsWith('spotify:album')) return gb.play(uri, null, view.dataset.ctx);
    return gb.play(uri, [...o.closest('.list').querySelectorAll('.item[data-uri]')].map(i => i.dataset.uri));
  }
  const b = e.target.closest('.sv, .ad');
  if (b) { const uri = b.closest('.item').dataset.uri; b.classList.contains('sv') ? gb.toggleSave(uri, b) : gb.pickPlaylist(uri); }
});
// Any album or artist card or row (Search, Library, artist page) opens its page
document.addEventListener('click', e => {
  const o = e.target.closest('.opn');
  if (!o) return;
  const d = o.dataset, a = { id: d.id, name: d.name, sub: d.sub, img: d.cover, url: d.url, own: d.own };
  go(() => d.kind === 'artist' ? artist(a) : d.kind === 'playlist' ? playlist(a) : album(a));
});
document.querySelectorAll('.nav button').forEach((b, i) => b.addEventListener('click', () => {
  if (i > 2 && prev) prev.hidden = false;
  view.hidden = true; prev = null; hist = []; current = null;
}));
})();
