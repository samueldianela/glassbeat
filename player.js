// Playback. Plays inside the page with Spotify's Web Playback SDK when the browser supports it,
// otherwise controls the Spotify app on your device. Needs Spotify Premium.
// It also remembers what you were playing (and your history) across page refreshes.
(() => {
const SDK = 'https://sdk.scdn.co/spotify-player.js';
const sp = { active: false };
const el = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const pic = imgs => ((imgs || [])[0] || {}).url || '';
const artists = t => (t.artists || []).map(a => a.name).join(', ');
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const SK = 'gb_session', HK = 'gb_history';

let player = null, deviceId = null, sdkP = null, mode = 'sdk', pt = null, released = true;
let curUri = null, histUri = null, lastPush = 0, lastSave = 0, remoteDev = null, restored = null;
let list = [], origList = [], ctx = null, shuffleOn = false, shuffleMode = 'api', repeatM = 'off';
let meta = { title: '', artist: '', img: '' };
let S = { playing: false, pos: 0, len: 1, t0: 0 };
const raw = () => S.pos + (S.playing ? (Date.now() - S.t0) / 1000 : 0);
const cur = () => Math.min(raw(), S.len);
const shuffled = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---------- Remembering: current song and history survive a refresh ----------
function save(force) {
  if (!curUri || (!force && Date.now() - lastSave < 2000)) return;
  lastSave = Date.now();
  write(SK, { uri: curUri, ...meta, pos: cur(), len: S.len, list: list.slice(0, 100), ctx, shuffle: shuffleOn, repeat: repeatM });
}
function remember(o) {
  const h = read(HK, []).filter(x => x.uri !== curUri);
  h.unshift({ uri: curUri, title: o.title, artist: o.artist || '', img: o.img || '', at: Date.now() });
  write(HK, h.slice(0, 40));
}

// ---------- Showing state ----------
const ms = navigator.mediaSession;
let lastTitle = null;
function media(o) {
  if (!ms) return;
  try {
    if (o.title != null && o.title !== lastTitle) { lastTitle = o.title; ms.metadata = new MediaMetadata({ title: o.title, artist: o.artist || '', artwork: o.img ? [{ src: o.img, sizes: '640x640' }] : [] }); }
    ms.playbackState = o.playing ? 'playing' : 'paused';
  } catch {}
}
function push(o) {
  S = { playing: !!o.playing, pos: o.pos || 0, len: o.len || 1, t0: Date.now() };
  sp.active = true;
  lastPush = Date.now();
  if (o.title != null) {
    meta = { title: o.title, artist: o.artist || '', img: o.img || '' };
    if (curUri && histUri !== curUri) { histUri = curUri; remember(o); }
  }
  glassUI.set(o);
  media(o);
  save();
}
// Spotify stopped (or ended): make the bar, lyrics and buttons stop too
function stopped() {
  if (!S.playing) return;
  S.pos = cur(); S.playing = false;
  glassUI.set({ playing: false, pos: S.pos, len: S.len });
  media({ playing: false });
  save(true);
}
function syncExtras(shuffle, repeat) {
  if (shuffle != null && shuffleMode !== 'local') shuffleOn = !!shuffle;
  if (repeat != null) repeatM = repeat;
  shuf.setAttribute('aria-pressed', shuffleOn);
  rep.dataset.m = repeatM;
  rep.setAttribute('aria-pressed', repeatM !== 'off');
}
setInterval(() => {
  if (!sp.active || !S.playing) return;
  if (raw() >= S.len + 3) return stopped();
  glassUI.set({ playing: true, pos: cur(), len: S.len });
  save();
}, 500);

function fail(e) {
  const m = e.message, d = e.detail ? ': ' + e.detail : '';
  toast(m === 'nodevice' ? 'No Spotify app found. Open Spotify on this phone, play any song once, then try again.'
    : m === '429' ? 'Too many requests. Wait a moment and try again.'
    : m === '404' ? 'Spotify has no active player. Start a song first, then try again.'
    : m === 'signed out' ? 'Please log in again.'
    : 'Spotify could not do that (error ' + m + d + ').');
}

// ---------- In-page player ----------
function onState(s) {
  const t = s.track_window && s.track_window.current_track;
  if (released || !t) return;
  mode = 'sdk';
  track(t.uri);
  syncExtras(s.shuffle, ['off', 'context', 'track'][s.repeat_mode] || 'off');
  push({ title: t.name, artist: artists(t), img: pic(t.album && t.album.images), playing: !s.paused, pos: s.position / 1000, len: s.duration / 1000 });
}
function ensureSdk() {
  if (sdkP) return sdkP;
  sdkP = new Promise(res => {
    const to = setTimeout(() => res(false), 6000);
    const no = () => { clearTimeout(to); res(false); };
    const boot = () => {
      player = new Spotify.Player({ name: 'Glassbeat', volume: 0.8, getOAuthToken: cb => gb.token().then(t => t && cb(t)) });
      player.addListener('ready', ({ device_id }) => { deviceId = device_id; clearTimeout(to); res(true); });
      player.addListener('not_ready', () => {
        deviceId = null;
        if (!released && mode === 'sdk') { stopped(); toast('The in-page player disconnected. Tap a song to reconnect.'); }
      });
      player.addListener('initialization_error', no);
      player.addListener('authentication_error', no);
      player.addListener('account_error', () => { toast('Playing songs needs Spotify Premium.'); no(); });
      player.addListener('playback_error', () => { stopped(); toast('Playback failed. Try another song.'); });
      player.addListener('autoplay_failed', () => { stopped(); toast('Your browser blocked autoplay. Tap play to start.'); });
      player.addListener('player_state_changed', s => { if (s) onState(s); else if (!released && mode === 'sdk') stopped(); });
      player.connect().then(ok => { if (!ok) no(); });
    };
    if (window.Spotify) return boot();
    window.onSpotifyWebPlaybackSDKReady = boot;
    const sc = document.createElement('script');
    sc.src = SDK; sc.async = true; sc.onerror = no;
    document.head.appendChild(sc);
  });
  return sdkP;
}
const waitDevice = () => new Promise(r => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (deviceId || Date.now() - t0 > 3000) { clearInterval(iv); r(); } }, 100);
});

// ---------- Fallback: control the Spotify app on this device ----------
async function remote(body) {
  try { await gb.api('/me/player/play', 'PUT', body); }
  catch (e) {
    if (e.message !== '404') throw e;
    const d = await gb.api('/me/player/devices');
    const dev = ((d || {}).devices || []).find(x => !x.is_restricted);
    if (!dev) throw new Error('nodevice');
    remoteDev = dev.id;
    await gb.api('/me/player/play?device_id=' + encodeURIComponent(dev.id), 'PUT', body);
  }
}
async function poll() {
  clearTimeout(pt);
  if (released || mode !== 'remote') return;
  try {
    const s = await gb.api('/me/player');
    const t = s && s.item;
    if (s && s.device) remoteDev = s.device.id;
    if (!t) stopped();
    else if (!released) {
      track(t.uri);
      syncExtras(s.shuffle_state, s.repeat_state);
      push({ title: t.name, artist: artists(t), img: pic(t.album && t.album.images), playing: !!s.is_playing, pos: (s.progress_ms || 0) / 1000, len: (t.duration_ms || 1) / 1000 });
    }
  } catch {}
  pt = setTimeout(poll, 3000);
}
const start = body => (mode === 'sdk' && deviceId)
  ? gb.api('/me/player/play?device_id=' + encodeURIComponent(deviceId), 'PUT', body)
  : remote(body);

// Check again that Spotify is really still playing (every few seconds, and when you come back to the page)
async function reconcile() {
  if (released || !sp.active) return;
  if (mode === 'remote') return poll();
  if (!player) return;
  try {
    const st = await player.getCurrentState();
    if (st) onState(st);
    else if (S.playing && Date.now() - lastPush > 5000) stopped();
  } catch {}
}
setInterval(() => { if (S.playing) reconcile(); }, 3000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); else reconcile(); });
addEventListener('pagehide', () => save(true));

// ---------- Playing ----------
async function play(uri, uris, c, startMs) {
  restored = null; released = false;
  const many = !c && uris && uris.length > 1;
  origList = c ? [] : many ? uris.slice(0, 100) : [uri];
  list = origList.slice();
  if (many && shuffleOn && shuffleMode === 'local') list = [uri, ...shuffled(origList.filter(u => u !== uri))];
  ctx = c || null;
  if (uri) curUri = null;   // re-read the heart state for the new song
  const body = c ? { context_uri: c, ...(uri ? { offset: { uri } } : {}) }
    : list.length > 1 ? { uris: list, offset: { uri } } : { uris: [uri] };
  if (startMs > 0) body.position_ms = Math.round(startMs);
  try {
    const ok = await ensureSdk();
    if (ok && player && !deviceId) { try { await player.connect(); } catch {} await waitDevice(); }
    if (ok && deviceId) {
      try { await player.activateElement(); } catch {}
      mode = 'sdk';
      await start(body);
    } else {
      mode = 'remote';
      await start(body);
      setTimeout(poll, 700);
    }
  } catch (e) { released = true; fail(e); }
}
function jump(d) {
  const t = list[list.indexOf(restored ? restored.uri : curUri) + d];
  if (!t) return toast('Press play to continue.');
  play(t, list, null);
}

const web = (path, method) => gb.api(path, method).then(() => { if (mode === 'remote') setTimeout(poll, 500); }).catch(fail);
Object.assign(sp, {
  toggle() {
    if (restored) { const r = restored; return void play(r.uri, r.list, r.ctx, S.pos * 1000); }
    S.pos = cur(); S.t0 = Date.now(); S.playing = !S.playing;
    glassUI.set({ playing: S.playing, pos: S.pos, len: S.len });
    if (mode === 'sdk') (S.playing ? player.resume() : player.pause()).catch(() => reconcile());
    else web(S.playing ? '/me/player/play' : '/me/player/pause', 'PUT');
  },
  next() { if (restored) return jump(1); mode === 'sdk' ? player.nextTrack() : web('/me/player/next', 'POST'); },
  prev() {
    if (cur() > 3) return sp.seek(0);
    if (restored) return jump(-1);
    mode === 'sdk' ? player.previousTrack() : web('/me/player/previous', 'POST');
  },
  seek(sec) {
    S.pos = sec; S.t0 = Date.now();
    glassUI.set({ playing: S.playing, pos: sec, len: S.len });
    if (restored) return;
    mode === 'sdk' ? player.seek(Math.round(sec * 1000)) : web('/me/player/seek?position_ms=' + Math.round(sec * 1000), 'PUT');
  },
  release() {
    if (!sp.active) return;
    sp.active = false; released = true; restored = null; clearTimeout(pt);
    try { mode === 'sdk' ? player.pause() : gb.api('/me/player/pause', 'PUT').catch(() => {}); } catch {}
  }
});

// The heart in the player saves the current Spotify song
const likes = () => [...document.querySelectorAll('.like')];
function track(uri) {
  if (!uri || uri === curUri) return;
  curUri = uri;
  gb.api('/me/library/contains?uris=' + encodeURIComponent(uri))
    .then(v => likes().forEach(l => l.setAttribute('aria-pressed', !!(v && v[0])))).catch(() => {});
}
likes().forEach(b => b.addEventListener('click', e => {
  if (!sp.active || !curUri) return;
  e.stopImmediatePropagation();
  gb.toggleSave(curUri, b).then(() => { const on = b.getAttribute('aria-pressed'); likes().forEach(l => l.setAttribute('aria-pressed', on)); });
}, true));

// ---------- Shuffle and repeat ----------
const shuf = el('shuffle'), rep = el('repeat');
const dev = () => { const id = mode === 'sdk' ? deviceId : remoteDev; return id ? '&device_id=' + encodeURIComponent(id) : ''; };
const need = () => restored ? (toast('Press play first, then use shuffle and repeat.'), false)
  : sp.active || (toast('Shuffle and repeat work while a Spotify song is playing.'), false);

// Spotify sometimes refuses shuffle (for example for a short list). Then we shuffle our own list instead.
async function setShuffle(on) {
  try { await gb.api('/me/player/shuffle?state=' + on + dev(), 'PUT'); shuffleMode = 'api'; return; }
  catch (e) { if (!(origList.length > 1 && curUri)) throw e; }
  const next = on ? [curUri, ...shuffled(origList.filter(u => u !== curUri))] : origList.slice();
  list = next;
  await start({ uris: next, offset: { uri: curUri }, position_ms: Math.round(cur() * 1000) });
  shuffleMode = on ? 'local' : 'api';
}
shuf.onclick = async () => {
  if (!need()) return;
  const on = !shuffleOn;
  shuffleOn = on; syncExtras();
  try { await setShuffle(on); } catch (e) { shuffleOn = !on; syncExtras(); fail(e); }
  save(true);
};
rep.onclick = async () => {
  if (!need()) return;
  const order = (origList.length > 1 || ctx) ? ['off', 'context', 'track'] : ['off', 'track'];
  const next = order[(order.indexOf(repeatM) + 1) % order.length];
  const apply = async s => { await gb.api('/me/player/repeat?state=' + s + dev(), 'PUT'); repeatM = s; syncExtras(); };
  try { await apply(next); }
  catch (e) {
    if (next === 'context') { try { await apply('track'); toast('Repeating this song instead.'); return; } catch {} }
    syncExtras(); fail(e);
  }
  save(true);
};

// ---------- Lock screen, headphone buttons and the space bar ----------
if (ms) {
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  h('play', () => { if (sp.active && !S.playing) sp.toggle(); });
  h('pause', () => { if (sp.active && S.playing) sp.toggle(); });
  h('nexttrack', () => { if (sp.active) sp.next(); });
  h('previoustrack', () => { if (sp.active) sp.prev(); });
  h('seekto', d => { if (sp.active) sp.seek(d.seekTime); });
}
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || /^(INPUT|TEXTAREA|BUTTON|A|SELECT)$/.test(e.target.tagName)) return;
  e.preventDefault();
  document.querySelector('.mini .play').click();
});

// ---------- Play on another device ----------
el('dev').onclick = async () => {
  let devices;
  try { devices = ((await gb.api('/me/player/devices')) || {}).devices || []; } catch (e) { return fail(e); }
  const dlg = document.createElement('div');
  dlg.className = 'pick';
  const label = d => (d.id === deviceId ? 'This browser (Glassbeat)' : d.name) + (d.is_active ? ' (playing)' : '');
  dlg.innerHTML = '<div class="sheetp glass"><h2>Play on</h2>' + (devices.length
    ? devices.map(d => `<button class="opt" data-id="${esc(d.id)}">${esc(label(d))}</button>`).join('')
    : '<p class="note">No devices found. Open Spotify on a device first.</p>') + '<button class="opt cancel">Cancel</button></div>';
  dlg.onclick = async e => {
    if (e.target === dlg || e.target.classList.contains('cancel')) return dlg.remove();
    const o = e.target.closest('.opt[data-id]');
    if (!o) return;
    dlg.remove();
    try {
      await gb.api('/me/player', 'PUT', { device_ids: [o.dataset.id], play: true });
      mode = o.dataset.id === deviceId ? 'sdk' : 'remote';
      if (mode === 'remote') remoteDev = o.dataset.id;
      released = false; restored = null;
      if (mode === 'remote') setTimeout(poll, 700);
      toast('Playing on ' + o.textContent);
    } catch (er) { fail(er); }
  };
  document.body.appendChild(dlg);
};

// ---------- Bring back what you were playing before the refresh ----------
(function restore() {
  const s = read(SK, null);
  if (!s || !s.uri) return;
  restored = s; curUri = s.uri; histUri = null;
  list = origList = s.list || []; ctx = s.ctx || null;
  shuffleOn = !!s.shuffle; shuffleMode = s.shuffle ? 'local' : 'api'; repeatM = s.repeat || 'off';
  meta = { title: s.title || '', artist: s.artist || '', img: s.img || '' };
  S = { playing: false, pos: s.pos || 0, len: s.len || 1, t0: Date.now() };
  sp.active = true;
  glassUI.set({ title: meta.title, artist: meta.artist, img: meta.img, playing: false, pos: S.pos, len: S.len });
})();
syncExtras();

gb.sp = sp;
gb.play = play;
})();
