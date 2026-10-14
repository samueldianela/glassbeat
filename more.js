// "More" menu in the full player: volume, up next (queue), sleep timer, go to artist/album, share.
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const sleep = { at: 0, end: false };
let dlg = null, vt;

function close() { if (dlg) { dlg.remove(); dlg = null; } }
function panel(html, onclick) {
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.className = 'pick';
    dlg.onclick = e => { if (e.target === dlg) close(); };
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = '<div class="sheetp glass">' + html + '</div>';
  dlg.firstChild.onclick = onclick;
}
const mark = () => $('#more').setAttribute('aria-pressed', !!(sleep.at || sleep.end));

function menu() {
  const i = gb.sp.info();
  let v = 80;
  try { v = +(localStorage.getItem('gb_vol') ?? 80); } catch {}
  const left = sleep.at ? ' (' + Math.max(1, Math.ceil((sleep.at - Date.now()) / 60000)) + ' min left)' : sleep.end ? ' (end of song)' : '';
  panel(`<h2>${esc(i.title || 'Now playing')}</h2><p class="note">${esc(i.artist || '')}</p>
    <label class="vrow"><svg class="ic"><use href="#i-vol"/></svg><input type="range" id="mvol" min="0" max="100" value="${v}" style="--p:${v}%" aria-label="Volume"></label>
    <button class="opt" data-a="queue">Up next</button>
    <button class="opt" data-a="sleep">Sleep timer${left}</button>
    ${i.artistId ? '<button class="opt" data-a="artist">Go to artist</button>' : ''}
    ${i.albumId ? '<button class="opt" data-a="album">Go to album</button>' : ''}
    ${i.uri ? '<button class="opt" data-a="share">Share song</button>' : ''}
    <button class="opt cancel" data-a="close">Close</button>`, onMenu);
  $('#mvol').oninput = e => {
    const x = +e.target.value;
    e.target.style.setProperty('--p', x + '%');
    try { localStorage.setItem('gb_vol', x); } catch {}
    clearTimeout(vt);
    vt = setTimeout(() => Promise.resolve(gb.sp.volume(x)).catch(() => toast('Could not change the volume. Use your device buttons.')), 200);
  };
}

function onMenu(e) {
  const o = e.target.closest('[data-a]');
  if (!o) return;
  const a = o.dataset.a, i = gb.sp.info();
  if (a === 'close') return close();
  if (a === 'queue') return queue();
  if (a === 'sleep') return sleepMenu();
  close();
  if (a === 'share') return gb.share(i.title, 'https://open.spotify.com/track/' + String(i.uri).split(':')[2]);
  const d = a === 'artist'
    ? { kind: 'artist', id: i.artistId, name: i.artistName, sub: 'Artist', cover: '', url: 'https://open.spotify.com/artist/' + i.artistId }
    : { kind: 'album', id: i.albumId, name: i.albumName, sub: 'Album', cover: i.img, url: 'https://open.spotify.com/album/' + i.albumId };
  const b = document.createElement('button');
  b.className = 'opn'; b.hidden = true;
  Object.assign(b.dataset, d);
  document.body.appendChild(b); b.click(); b.remove();
}

async function queue() {
  panel('<h2>Up next</h2><p class="note">Loading…</p>', () => {});
  const back = '<button class="opt" data-a="menu">Back</button>';
  try {
    const d = await gb.api('/me/player/queue');
    const now = d && d.currently_playing;
    const q = ((d && d.queue) || []).filter(Boolean).slice(0, 20);
    const uris = q.map(t => t.uri);
    panel('<h2>Up next</h2>' + (now ? `<p class="note">Now playing: ${esc(now.name)}</p>` : '') + (q.length
      ? q.map((t, k) => `<button class="opt" data-q="${k}">${esc(t.name)}<small>${esc((t.artists || []).map(a => a.name).join(', '))}</small></button>`).join('')
      : '<p class="note">Nothing is queued. Use the + on a song to add one.</p>') + back, e => {
      const o = e.target.closest('[data-q],[data-a]');
      if (!o) return;
      if (o.dataset.a === 'menu') return menu();
      const k = +o.dataset.q;
      close(); gb.play(uris[k], uris.slice(k));
    });
  } catch (er) {
    panel(`<h2>Up next</h2><p class="note">Could not load the queue (error ${esc(er.message)}).</p>` + back, e => { if (e.target.closest('[data-a=menu]')) menu(); });
  }
}

function sleepMenu() {
  panel('<h2>Sleep timer</h2>' + [5, 15, 30, 45, 60].map(m => `<button class="opt" data-m="${m}">${m} minutes</button>`).join('')
    + '<button class="opt" data-m="end">End of this song</button><button class="opt" data-m="off">Turn off</button><button class="opt" data-a="menu">Back</button>', e => {
    const o = e.target.closest('[data-m],[data-a]');
    if (!o) return;
    if (o.dataset.a === 'menu') return menu();
    const m = o.dataset.m;
    sleep.at = 0; sleep.end = false;
    if (m === 'end') { sleep.end = true; toast('Music will pause at the end of this song'); }
    else if (m === 'off') toast('Sleep timer is off');
    else { sleep.at = Date.now() + m * 60000; toast('Music will pause in ' + m + ' minutes'); }
    mark(); close();
  });
}

setInterval(() => {
  if (!gb.sp || !gb.sp.info || !(sleep.at || sleep.end)) return;
  const i = gb.sp.info();
  if (sleep.at && Date.now() >= sleep.at || sleep.end && i.playing && i.len - i.pos < 1.2) {
    sleep.at = 0; sleep.end = false; mark();
    gb.sp.pauseNow();
    toast('Sleep timer: music paused');
  }
}, 1000);

$('#more').onclick = () => {
  if (!gb.sp || !gb.sp.active) return toast('Play a Spotify song first.');
  menu();
};
})();
