// Step 3: Library, playlists, save and add-to-playlist. Needs spotify.js first (window.gb).
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pic = imgs => ((imgs || [])[1] || (imgs || [])[0] || {}).url || '';
const names = x => (x.artists || []).map(a => a.name).join(', ');
const ext = x => `href="${esc((x.external_urls || {}).spotify || '#')}" target="_blank" rel="noopener"`;
const note = t => `<p class="note">${t}</p>`;
const out = $('#lres');
let tab = 'playlists', me = null, mine = [];

const paint = root => root.querySelectorAll('[data-img]').forEach(e => { if (e.dataset.img) e.style.setProperty('--img', `url("${e.dataset.img}")`); });
const say = h => { out.innerHTML = h; paint(out); };
const needLogin = () => {
  say('<div class="empty glass"><p>Log in with Spotify to see your library.</p><button class="login glass" id="ll">Log in with Spotify</button></div>');
  $('#ll').onclick = () => gb.login();
};
const fail = e => e.message === 'signed out' ? needLogin() : say(note(
  e.message === '429' ? 'Too many requests. Wait a moment and try again.'
  : e.message === '403' ? 'Spotify did not allow that. Log out and log in again to grant the new permissions.'
  : 'Something went wrong. Try again.'));

const heart = (on) => `<button class="ib sv" aria-label="Save to library" aria-pressed="${on}"><svg class="ic"><use href="#i-heart"/></svg></button><button class="ib ad" aria-label="Add to playlist"><svg class="ic"><use href="#i-plus"/></svg></button>`;
const trackRow = (x, saved) => `<div class="item glass" data-uri="${esc(x.uri)}"><button class="open" aria-label="Play ${esc(x.name)}"><div class="art sm" data-img="${esc(pic((x.album || {}).images))}"></div><div class="meta"><strong>${esc(x.name)}</strong><span>${esc(names(x))}</span></div></button><a class="ib ext" ${ext(x)} aria-label="Open in Spotify"><svg class="ic"><use href="#i-ext"/></svg></a>${heart(saved)}</div>`;
const linkRow = (img, title, sub, x) => `<div class="item glass"><a class="open" ${ext(x)}><div class="art sm" data-img="${esc(img)}"></div><div class="meta"><strong>${esc(title)}</strong><span>${esc(sub)}</span></div></a></div>`;
const list = rows => '<div class="list">' + rows.join('') + '</div>';
const ensureMe = async () => me || (me = await gb.api('/me'));
const ownOnly = (items, m) => (items || []).filter(p => p && (p.collaborative || (p.owner || {}).id === m.id));

function markSaved(root) {
  const rows = [...root.querySelectorAll('.item[data-uri]')].slice(0, 40);
  if (!rows.length) return;
  gb.api('/me/library/contains?uris=' + encodeURIComponent(rows.map(r => r.dataset.uri).join(',')))
    .then(v => (v || []).forEach((on, i) => rows[i].querySelector('.sv').setAttribute('aria-pressed', !!on)))
    .catch(() => {});
}

const loaders = {
  async playlists() {
    const [m, d] = await Promise.all([ensureMe(), gb.api('/me/playlists?limit=50')]);
    const all = (d.items || []).filter(Boolean);
    mine = ownOnly(all, m);
    say('<button class="login glass newpl" id="np">New playlist</button>' + (all.length ? list(all.map(p =>
      `<button class="item glass pl" data-id="${esc(p.id)}"><div class="art sm" data-img="${esc(pic(p.images))}"></div><div class="meta"><strong>${esc(p.name)}</strong><span>${(p.items || p.tracks || {}).total ?? 0} songs</span></div></button>`)) : note('No playlists yet.')));
    $('#np').onclick = newPlaylist;
  },
  async tracks() {
    const d = await gb.api('/me/tracks?limit=50');
    const l = (d.items || []).map(i => i.track).filter(Boolean);
    say(l.length ? list(l.map(x => trackRow(x, true))) : note('No saved songs yet. Tap the heart on a song in Search.'));
  },
  async albums() {
    const d = await gb.api('/me/albums?limit=50');
    const l = (d.items || []).map(i => i.album).filter(Boolean);
    say(l.length ? list(l.map(x => linkRow(pic(x.images), x.name, names(x), x))) : note('No saved albums yet.'));
  },
  async artists() {
    const d = await gb.api('/me/following?type=artist&limit=50');
    const l = ((d.artists || {}).items || []).filter(Boolean);
    say(l.length ? list(l.map(x => linkRow(pic(x.images), x.name, 'Artist', x))) : note('You are not following any artists yet.'));
  }
};

async function show(t) {
  tab = t;
  document.querySelectorAll('#ltabs .tab').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === t));
  if (!gb.signedIn()) return needLogin();
  say(note('Loading…'));
  try { await loaders[t](); } catch (e) { fail(e); }
}

async function detail(id, name) {
  say(note('Loading…'));
  const back = '<button class="login glass newpl" id="bk">Back</button><h2>' + esc(name) + '</h2>';
  try {
    const d = await gb.api(`/playlists/${encodeURIComponent(id)}/items?limit=50`);
    const l = (d.items || []).map(i => i.item || i.track).filter(x => x && String(x.uri).startsWith('spotify:track'));
    say(back + (l.length ? list(l.map(x => trackRow(x, false))) : note('No songs here yet.')));
    markSaved(out);
  } catch (e) {
    if (e.message !== '403') return fail(e);
    say(back + note('Spotify only shows the songs of playlists you own or share.'));
  }
  const bk = $('#bk'); if (bk) bk.onclick = () => show('playlists');
}

async function newPlaylist() {
  if (!gb.signedIn()) return toast('Log in with Spotify first.');
  const name = (prompt('Name your playlist') || '').trim();
  if (!name) return;
  try {
    await gb.api('/me/playlists', 'POST', { name, public: false });
    mine = []; tab = 'playlists';
    toast('Playlist created');
    document.querySelectorAll('.nav button')[2].click();
  } catch (e) {
    toast(e.message === '403' ? 'Log out and log in again to allow creating playlists.' : 'Could not create the playlist.');
  }
}

async function toggleSave(uri, btn) {
  const on = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', !on);
  try {
    await gb.api('/me/library?uris=' + encodeURIComponent(uri), on ? 'DELETE' : 'PUT');
    toast(on ? 'Removed from your library' : 'Saved to your library');
  } catch (e) {
    btn.setAttribute('aria-pressed', on);
    toast(e.message === '403' ? 'Log out and log in again to allow saving.' : 'Could not update your library.');
  }
}

async function pickPlaylist(uri) {
  if (!mine.length) {
    try { const [m, d] = await Promise.all([ensureMe(), gb.api('/me/playlists?limit=50')]); mine = ownOnly(d.items, m); }
    catch { return toast('Could not load your playlists.'); }
  }
  const dlg = document.createElement('div');
  dlg.className = 'pick';
  dlg.innerHTML = '<div class="sheetp glass"><h2>Add to playlist</h2>' + (mine.length
    ? mine.map(p => `<button class="opt" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')
    : note('Create a playlist first with the Create button.')) + '<button class="opt cancel">Cancel</button></div>';
  dlg.onclick = async e => {
    if (e.target === dlg || e.target.classList.contains('cancel')) return dlg.remove();
    const o = e.target.closest('.opt[data-id]');
    if (!o) return;
    dlg.remove();
    try { await gb.api(`/playlists/${encodeURIComponent(o.dataset.id)}/items`, 'POST', { uris: [uri] }); toast('Added to ' + o.textContent); }
    catch (er) { toast(er.message === '403' ? 'You can only add songs to playlists you own.' : 'Could not add the song.'); }
  };
  document.body.appendChild(dlg);
}

document.querySelectorAll('#ltabs .tab').forEach(b => b.onclick = () => show(b.dataset.t));
out.addEventListener('click', e => {
  const o = e.target.closest('button.open');
  if (o) return gb.play(o.closest('.item').dataset.uri, [...o.closest('.list').querySelectorAll('.item[data-uri]')].map(i => i.dataset.uri));
  const act = e.target.closest('.sv, .ad');
  if (act) { const uri = act.closest('.item').dataset.uri; return act.classList.contains('sv') ? toggleSave(uri, act) : pickPlaylist(uri); }
  const p = e.target.closest('.pl');
  if (p) detail(p.dataset.id, p.querySelector('strong').textContent);
});

Object.assign(gb, { openLibrary: () => show(tab), newPlaylist, toggleSave, pickPlaylist, markSaved });
})();
