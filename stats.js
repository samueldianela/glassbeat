// Listening stats. Counts time played and songs started from the player's own
// update stream — no extra API calls, no scrobbling, everything stays on device.
//
// The numbers are honest about their source: they start when this file first runs
// and they never invent history the app did not see.
(() => {
'use strict';

const KEY = 'gb_tally';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const $ = id => document.getElementById(id);

const blank = () => ({ ms: 0, starts: 0, artists: {}, tracks: {}, days: {}, since: Date.now() });
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

let T = load();
let panel = null;
let lastTitle = '';
let lastAt = 0;
let saveTimer = 0;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') return Object.assign(blank(), raw);
  } catch (e) { /* corrupted tally just resets */ }
  return blank();
}

function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(T)); } catch (e) {}
}

// Throttled, not debounced: the tick stream never lets a debounce fire.
function save(now) {
  if (now) { clearTimeout(saveTimer); saveTimer = 0; return flush(); }
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; flush(); }, 4000);
}

function bump(o) {
  const artist = o.artist || 'Unknown artist';
  T.artists[artist] = (T.artists[artist] || 0) + 1;
  const key = (o.title || '') + '\u0000' + artist;
  const t = T.tracks[key] || (T.tracks[key] = { title: o.title || '', artist, img: o.img || '', ms: 0, n: 0 });
  t.n += 1;
  if (o.img) t.img = o.img;
  T.starts += 1;
  // keep the map from growing without bound on very long-lived installs
  const keys = Object.keys(T.tracks);
  if (keys.length > 400) {
    keys.sort((a, b) => T.tracks[a].ms - T.tracks[b].ms)
      .slice(0, keys.length - 400)
      .forEach(k => delete T.tracks[k]);
  }
}

// Every player tick lands here: 500ms of wall clock while a song is actually playing.
const ui = window.glassUI;
if (ui && typeof ui.set === 'function') {
  const orig = ui.set;
  ui.set = function (o) {
    if (o) {
      const d = today();
      if (o.playing) {
        T.ms += 500;
        T.days[d] = (T.days[d] || 0) + 500;
        if (Object.keys(T.days).length > 400) {
          Object.keys(T.days).sort().slice(0, Object.keys(T.days).length - 400).forEach(k => delete T.days[k]);
        }
      }
      if (o.title && (o.title !== lastTitle || Date.now() - lastAt > 45000)) {
        lastTitle = o.title;
        lastAt = Date.now();
        bump(o);
      }
      save(false);
    }
    return orig.apply(this, arguments);
  };
}
addEventListener('pagehide', () => save(true));
addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

function fmt(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function bars(entries, unit) {
  const max = entries.reduce((n, e) => Math.max(n, e.value), 0) || 1;
  return entries.map(e =>
    '<div class="sbar"><div class="slab"><b>' + esc(e.label) + '</b>' +
    '<span>' + esc(e.note || '') + '</span></div>' +
    '<div class="strack"><i style="width:' + Math.round((e.value / max) * 100) + '%"></i></div></div>'
  ).join('');
}

function week() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    out.push({ key, label: 'SMTWTFS'[d.getDay()], value: T.days[key] || 0, full: d.toLocaleDateString(undefined, { weekday: 'short' }) });
  }
  const max = out.reduce((n, e) => Math.max(n, e.value), 0) || 1;
  return '<div class="sweek">' + out.map(d =>
    '<div class="sday" title="' + esc(d.full) + ': ' + fmt(d.value) + '">' +
      '<i style="height:' + Math.max(4, Math.round((d.value / max) * 100)) + '%"></i>' +
      '<span>' + d.label + '</span></div>'
  ).join('') + '</div>';
}

function body() {
  const artists = Object.entries(T.artists)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, n]) => ({ label: name, note: n + (n === 1 ? ' play' : ' plays'), value: n }));

  const tracks = Object.entries(T.tracks)
    .map(([, t]) => t).sort((a, b) => b.n - a.n).slice(0, 6)
    .map(t => ({ label: t.title || 'Unknown', note: t.artist + ' · ' + t.n + '×', value: t.n }));

  const days = Object.keys(T.days).length;
  const avg = days ? T.ms / days : 0;

  return '' +
    '<div class="scards">' +
      '<div class="scard glass"><strong>' + esc(fmt(T.ms)) + '</strong><span>Listened</span></div>' +
      '<div class="scard glass"><strong>' + T.starts + '</strong><span>Songs started</span></div>' +
      '<div class="scard glass"><strong>' + Object.keys(T.artists).length + '</strong><span>Artists</span></div>' +
      '<div class="scard glass"><strong>' + esc(fmt(avg)) + '</strong><span>Per active day</span></div>' +
    '</div>' +
    '<div class="sgroup glass"><div class="shead2"><strong>Last 7 days</strong><span>' + esc(fmt(T.days[today()] || 0)) + ' today</span></div>' + week() + '</div>' +
    (artists.length ? '<div class="sgroup glass"><div class="shead2"><strong>Top artists</strong><span>by plays</span></div>' + bars(artists) + '</div>' : '') +
    (tracks.length ? '<div class="sgroup glass"><div class="shead2"><strong>Top songs</strong><span>by plays</span></div>' + bars(tracks) + '</div>' : '') +
    (T.starts ? '' : '<p class="note">Play something and this fills in from the first track.</p>') +
    '<button class="login glass sreset" id="sreset">Reset stats</button>';
}

function build() {
  if (panel) return;
  panel = document.createElement('section');
  panel.className = 'stats';
  panel.id = 'stats';
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-label', 'Listening stats');
  panel.innerHTML = '<div class="spanel">' +
    '<div class="shead"><button class="ib" id="stclose" aria-label="Close stats">' +
      '<svg class="ic"><use href="#i-x"/></svg></button><h1>Listening stats</h1></div>' +
    '<div id="stbody"></div></div>';
  document.body.appendChild(panel);

  $('stclose').onclick = close;
  panel.addEventListener('click', e => {
    if (e.target === panel) return close();
    if (e.target.closest('#sreset')) {
      if (!confirm('Reset listening stats? This cannot be undone.')) return;
      T = blank();
      save(true);
      $('stbody').innerHTML = body();
    }
  });
}

function open() {
  build();
  $('stbody').innerHTML = body();
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  $('stclose').focus();
}

function close() {
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

addEventListener('keydown', e => {
  if (e.key === 'Escape' && panel && panel.classList.contains('open')) close();
});

// Entry point in settings, above Log out.
(function row() {
  const out = $('slogout');
  if (!out) return;
  const box = document.createElement('div');
  box.className = 'sgroup glass';
  box.innerHTML = '<div class="srow"><div><strong>Listening stats</strong><span>' +
    'Time played, top artists and songs, last 7 days</span></div>' +
    '<button class="login glass" id="stopen">Open</button></div>';
  out.parentNode.insertBefore(box, out);
  $('stopen').onclick = () => {
    const s = $('settings');
    if (s) { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }
    open();
  };
})();

const style = document.createElement('style');
style.textContent = `
.stats{position:fixed;inset:0;z-index:13;overflow-y:auto;background:linear-gradient(160deg,rgba(40,38,90,.86),rgba(10,13,26,.95));
  -webkit-backdrop-filter:blur(26px) saturate(160%);backdrop-filter:blur(26px) saturate(160%);
  transform:translateY(105%);visibility:hidden;transition:transform .45s cubic-bezier(.2,.9,.25,1),visibility 0s .45s;
  padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}
.stats.open{transform:none;visibility:visible;transition:transform .45s cubic-bezier(.2,.9,.25,1)}
html[data-theme=light] .stats{background:linear-gradient(160deg,rgba(255,255,255,.96),rgba(226,230,247,.98))}
.scards{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:.6rem;margin-bottom:1rem}
.scard{border-radius:1.375rem;padding:1rem;display:flex;flex-direction:column;gap:.15rem}
.scard strong{font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
.scard span{font-size:.8rem;color:var(--muted)}
.sgroup{padding:.25rem 1rem .75rem}
.shead2{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:.9rem 0 .6rem}
.shead2 strong{font-size:1rem}
.shead2 span{font-size:.8rem;color:var(--muted)}
.sbar{margin-bottom:.7rem}
.slab{display:flex;justify-content:space-between;gap:1rem;font-size:.85rem;margin-bottom:.3rem}
.slab b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slab span{color:var(--muted);flex:none}
.strack{height:.4rem;border-radius:99px;background:rgba(var(--tint),.14);overflow:hidden}
.strack i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--violet),var(--aqua))}
.sweek{display:flex;align-items:flex-end;gap:.45rem;height:6.5rem;padding:.25rem 0 .5rem}
.sday{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:.35rem}
.sday i{width:100%;border-radius:.4rem;background:linear-gradient(180deg,var(--aqua),var(--violet));min-height:4px}
.sday span{font-size:.7rem;color:var(--muted)}
.sreset{width:100%;padding:1rem;border-radius:1.5rem;font-weight:700;color:#ff8fa3}
`;
document.head.appendChild(style);

window.glassStats = { open, close, tally: () => T };
})();
