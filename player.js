// Step 4: Playback. Plays inside the page with Spotify's Web Playback SDK when the browser supports it,
// otherwise controls the Spotify app on your device. Needs Spotify Premium.
(() => {
const SDK = 'https://sdk.scdn.co/spotify-player.js';
const sp = { active: false };
let player = null, deviceId = null, sdkP = null, mode = 'sdk', pt = null, released = true, curUri = null;
let S = { playing: false, pos: 0, len: 1, t0: 0 };
const cur = () => Math.min(S.pos + (S.playing ? (Date.now() - S.t0) / 1000 : 0), S.len);
const pic = imgs => ((imgs || [])[0] || {}).url || '';
const artists = t => (t.artists || []).map(a => a.name).join(', ');

function push(o) {
  S = { playing: !!o.playing, pos: o.pos || 0, len: o.len || 1, t0: Date.now() };
  sp.active = true;
  glassUI.set(o);
  try {
    if ('mediaSession' in navigator) {
      if (o.title != null) navigator.mediaSession.metadata = new MediaMetadata({ title: o.title, artist: o.artist || '', artwork: o.img ? [{ src: o.img, sizes: '640x640' }] : [] });
      navigator.mediaSession.playbackState = o.playing ? 'playing' : 'paused';
    }
  } catch {}
}
setInterval(() => { if (sp.active && S.playing) glassUI.set({ playing: true, pos: cur(), len: S.len }); }, 500);

function fail(e) {
  const m = e.message;
  toast(m === 'nodevice' ? 'No Spotify app found. Open Spotify on this phone, play any song once, then try again.'
    : m === '403' ? 'Spotify refused. Playing songs needs Spotify Premium.'
    : m === '429' ? 'Too many requests. Wait a moment and try again.'
    : m === 'signed out' ? 'Please log in again.' : 'Could not play that. Try again.');
}

// In-page player
function onState(s) {
  const t = s.track_window && s.track_window.current_track;
  if (released || !t) return;
  mode = 'sdk';
  track(t.uri);
  push({ title: t.name, artist: artists(t), img: pic(t.album && t.album.images), playing: !s.paused, pos: s.position / 1000, len: s.duration / 1000 });
}
function ensureSdk() {
  if (sdkP) return sdkP;
  sdkP = new Promise(res => {
    const to = setTimeout(() => res(false), 6000);
    const no = () => { clearTimeout(to); res(false); };
    window.onSpotifyWebPlaybackSDKReady = () => {
      player = new Spotify.Player({ name: 'Glassbeat', volume: 0.8, getOAuthToken: cb => gb.token().then(t => t && cb(t)) });
      player.addListener('ready', ({ device_id }) => { deviceId = device_id; clearTimeout(to); res(true); });
      player.addListener('not_ready', () => { deviceId = null; });
      player.addListener('initialization_error', no);
      player.addListener('authentication_error', no);
      player.addListener('account_error', () => { toast('Playing songs needs Spotify Premium.'); no(); });
      player.addListener('playback_error', () => toast('Playback failed. Try another song.'));
      player.addListener('player_state_changed', s => s && onState(s));
      player.connect().then(ok => { if (!ok) no(); });
    };
    const sc = document.createElement('script');
    sc.src = SDK; sc.async = true; sc.onerror = no;
    document.head.appendChild(sc);
  });
  return sdkP;
}

// Fallback: control the Spotify app on this device
async function remote(body) {
  try { await gb.api('/me/player/play', 'PUT', body); }
  catch (e) {
    if (e.message !== '404') throw e;
    const d = await gb.api('/me/player/devices');
    const dev = ((d || {}).devices || []).find(x => !x.is_restricted);
    if (!dev) throw new Error('nodevice');
    await gb.api('/me/player/play?device_id=' + encodeURIComponent(dev.id), 'PUT', body);
  }
}
async function poll() {
  clearTimeout(pt);
  if (released || mode !== 'remote') return;
  try {
    const s = await gb.api('/me/player');
    const t = s && s.item;
    if (t && !released) track(t.uri);
    if (t && !released) push({ title: t.name, artist: artists(t), img: pic(t.album && t.album.images), playing: !!s.is_playing, pos: (s.progress_ms || 0) / 1000, len: (t.duration_ms || 1) / 1000 });
  } catch {}
  pt = setTimeout(poll, 3000);
}

async function play(uri, uris, ctx) {
  const body = ctx ? { context_uri: ctx, ...(uri ? { offset: { uri } } : {}) }
    : uris && uris.length > 1 ? { uris, offset: { uri } } : { uris: [uri] };
  released = false;
  try {
    const ok = await ensureSdk();
    if (ok && deviceId) {
      try { await player.activateElement(); } catch {}
      await gb.api('/me/player/play?device_id=' + encodeURIComponent(deviceId), 'PUT', body);
      mode = 'sdk';
    } else {
      await remote(body);
      mode = 'remote';
      setTimeout(poll, 700);
    }
  } catch (e) { released = true; fail(e); }
}

const web = (path, method) => gb.api(path, method).then(() => { if (mode === 'remote') setTimeout(poll, 500); }).catch(fail);
Object.assign(sp, {
  toggle() {
    S.pos = cur(); S.t0 = Date.now(); S.playing = !S.playing;
    glassUI.set({ playing: S.playing, pos: S.pos, len: S.len });
    mode === 'sdk' ? player.togglePlay() : web(S.playing ? '/me/player/play' : '/me/player/pause', 'PUT');
  },
  next() { mode === 'sdk' ? player.nextTrack() : web('/me/player/next', 'POST'); },
  prev() { if (cur() > 3) return sp.seek(0); mode === 'sdk' ? player.previousTrack() : web('/me/player/previous', 'POST'); },
  seek(sec) {
    S.pos = sec; S.t0 = Date.now();
    glassUI.set({ playing: S.playing, pos: sec, len: S.len });
    mode === 'sdk' ? player.seek(Math.round(sec * 1000)) : web('/me/player/seek?position_ms=' + Math.round(sec * 1000), 'PUT');
  },
  release() {
    if (!sp.active) return;
    sp.active = false; released = true; clearTimeout(pt);
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

// Shuffle and repeat
const shuf = document.getElementById('shuffle'), rep = document.getElementById('repeat');
const need = () => sp.active || (toast('Shuffle and repeat work while a Spotify song is playing.'), false);
let shuffleOn = false, repeatM = 'off';
shuf.onclick = () => {
  if (!need()) return;
  shuffleOn = !shuffleOn; shuf.setAttribute('aria-pressed', shuffleOn);
  gb.api('/me/player/shuffle?state=' + shuffleOn, 'PUT').catch(e => { shuffleOn = !shuffleOn; shuf.setAttribute('aria-pressed', shuffleOn); fail(e); });
};
rep.onclick = () => {
  if (!need()) return;
  const was = repeatM;
  repeatM = { off: 'context', context: 'track', track: 'off' }[was];
  rep.dataset.m = repeatM; rep.setAttribute('aria-pressed', repeatM !== 'off');
  gb.api('/me/player/repeat?state=' + repeatM, 'PUT').catch(e => { repeatM = was; rep.dataset.m = was; rep.setAttribute('aria-pressed', was !== 'off'); fail(e); });
};

// Lock screen and headphone buttons, and the space bar
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
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

// Play on another device
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
document.getElementById('dev').onclick = async () => {
  let list;
  try { list = ((await gb.api('/me/player/devices')) || {}).devices || []; } catch (e) { return fail(e); }
  const dlg = document.createElement('div');
  dlg.className = 'pick';
  const label = d => (d.id === deviceId ? 'This browser (Glassbeat)' : d.name) + (d.is_active ? ' (playing)' : '');
  dlg.innerHTML = '<div class="sheetp glass"><h2>Play on</h2>' + (list.length
    ? list.map(d => `<button class="opt" data-id="${escH(d.id)}">${escH(label(d))}</button>`).join('')
    : '<p class="note">No devices found. Open Spotify on a device first.</p>') + '<button class="opt cancel">Cancel</button></div>';
  dlg.onclick = async e => {
    if (e.target === dlg || e.target.classList.contains('cancel')) return dlg.remove();
    const o = e.target.closest('.opt[data-id]');
    if (!o) return;
    dlg.remove();
    try {
      await gb.api('/me/player', 'PUT', { device_ids: [o.dataset.id], play: true });
      mode = o.dataset.id === deviceId ? 'sdk' : 'remote';
      released = false;
      if (mode === 'remote') setTimeout(poll, 700);
      toast('Playing on ' + o.textContent);
    } catch (er) { fail(er); }
  };
  document.body.appendChild(dlg);
};

// Add a song to the play queue
gb.enqueue = async uri => {
  try {
    await gb.api('/me/player/queue?uri=' + encodeURIComponent(uri) + (mode === 'sdk' && deviceId ? '&device_id=' + encodeURIComponent(deviceId) : ''), 'POST');
    toast('Added to queue');
  } catch (e) { e.message === '404' ? toast('Play a song first, then add to the queue.') : fail(e); }
};

gb.sp = sp;
gb.play = play;
})();
