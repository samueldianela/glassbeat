// Placeholder content only. Replace with your own titles and cover images.
const items = [
  { type: 'music',   title: 'Six Forty Seven',    sub: 'Single, Instupendo', artist: 'Instupendo', src: 'music/six-forty-seven.mp3' },
  { type: 'music',   title: 'Morning light',      sub: 'Album, Artist name' },
  { type: 'podcast', title: 'Short stories',      sub: 'Podcast, Host name' },
  { type: 'music',   title: 'Study loops',        sub: 'Playlist' },
  { type: 'music',   title: 'Weekend mix',        sub: 'Mix for you' },
  { type: 'podcast', title: 'Tech in plain words', sub: 'Podcast, Host name' }
];
const made = [
  { type: 'music',   title: 'Discover mix',       sub: 'New picks from artists you like' },
  { type: 'music',   title: 'Daily mix 1',        sub: 'Artist name and more' },
  { type: 'music',   title: 'Throwback mix',      sub: 'Songs you replayed' },
  { type: 'podcast', title: 'Catch up',           sub: 'New episodes for you' },
  { type: 'music',   title: 'Release radar',      sub: 'This week\'s new music' }
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icon = id => `<svg class="ic"><use href="#i-${id}"/></svg>`;

// Greeting by time of day
const h = new Date().getHours();
$('#greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

// Render
$('#quick').innerHTML = items.map((x, i) =>
  `<button class="tile glass" data-type="${x.type}" data-i="${i}"><div class="art"></div><span>${x.title}</span></button>`).join('');
const card = (x, i, k) =>
  `<button class="card" data-type="${x.type}" data-k="${k}" data-i="${i}"><div class="art"><span class="go">${icon('play')}</span></div><b>${x.title}</b><small>${x.sub}</small></button>`;
$('#jump').innerHTML = items.map((x, i) => card(x, i, 'a')).join('');
$('#made').innerHTML = made.map((x, i) => card(x, i, 'b')).join('');

// Filter chips
$$('.chip').forEach(c => c.addEventListener('click', () => {
  $$('.chip').forEach(o => o.setAttribute('aria-pressed', o === c));
  const f = c.dataset.f;
  $$('[data-type]').forEach(el => el.hidden = f !== 'all' && el.dataset.type !== f);
}));

// Bottom nav highlight
$$('.nav button').forEach(b => b.addEventListener('click', () => {
  $$('.nav button').forEach(o => { o.classList.remove('on'); o.removeAttribute('aria-current'); });
  b.classList.add('on'); b.setAttribute('aria-current', 'page');
}));

// Player: tracks with a "src" play real audio, the rest simulate playback
const queue = [...items, ...made];
const audio = new Audio();
const sheet = $('#sheet'), mini = $('#mini'), seek = $('#seek');
let idx = 0, pos = 0, len = 200, playing = false, timer;
const real = () => !!queue[idx].src;
const sp = () => (window.gb && gb.sp && gb.sp.active) ? gb.sp : null;
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function draw() {
  const p = (pos / len * 100) + '%';
  mini.style.setProperty('--p', p);
  seek.style.setProperty('--p', p);
  seek.max = len; seek.value = pos;
  $('#cur').textContent = fmt(pos);
  $('#dur').textContent = fmt(len);
  $$('.play use').forEach(u => u.setAttribute('href', playing ? '#i-pause' : '#i-play'));
  $$('.play').forEach(b => b.setAttribute('aria-label', playing ? 'Pause' : 'Play'));
}
function load(i) {
  idx = (i + queue.length) % queue.length; pos = 0; len = 200;
  const t = queue[idx];
  $$('.mini .art, .sheet .art').forEach(e => e.style.removeProperty('--img'));
  audio.pause(); clearInterval(timer);
  if (t.src) audio.src = t.src; else audio.removeAttribute('src');
  $$('.t-title').forEach(e => e.textContent = t.title);
  $$('.t-artist').forEach(e => e.textContent = t.artist || 'Artist name');
  draw();
}
function toggle(force) {
  const s = sp(); if (s) return s.toggle();
  playing = force ?? !playing;
  clearInterval(timer);
  if (real()) {
    if (playing) audio.play().catch(() => { playing = false; draw(); });
    else audio.pause();
  } else if (playing) {
    timer = setInterval(() => { pos += 1; if (pos >= len) { load(idx + 1); toggle(true); } draw(); }, 1000);
  }
  draw();
}
audio.addEventListener('loadedmetadata', () => { len = audio.duration; draw(); });
audio.addEventListener('timeupdate', () => { pos = audio.currentTime; draw(); });
audio.addEventListener('ended', () => { load(idx + 1); toggle(true); });

$$('.play').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggle(); }));
$('#next').onclick = () => { const s = sp(); if (s) return s.next(); const was = playing; load(idx + 1); toggle(was); };
$('#prev').onclick = () => {
  const s = sp(); if (s) return s.prev();
  if (pos > 3) { pos = 0; if (real()) audio.currentTime = 0; draw(); }
  else { const was = playing; load(idx - 1); toggle(was); }
};
seek.oninput = () => { const s = sp(); if (s) return s.seek(+seek.value); pos = +seek.value; if (real()) audio.currentTime = pos; draw(); };
$$('.like').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  const on = b.getAttribute('aria-pressed') !== 'true';
  $$('.like').forEach(l => l.setAttribute('aria-pressed', on));
}));

// Tap a tile or card to play it
document.addEventListener('click', e => {
  const t = e.target.closest('.tile, .card');
  if (!t || t.dataset.i === undefined) return;
  if (window.gb && gb.sp) gb.sp.release();
  const list = t.dataset.k === 'b' ? made : items;
  const item = list[+t.dataset.i];
  load(queue.indexOf(item)); toggle(true);
});

// Open and close the full player
const open = v => { sheet.classList.toggle('open', v); sheet.setAttribute('aria-hidden', !v); (v ? $('.close') : mini).focus(); };
mini.addEventListener('click', () => open(true));
mini.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === mini) open(true); });
$('.close').onclick = () => open(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });

// Hook for player.js: shows Spotify playback in the glass player
window.glassUI = {
  set(o) {
    audio.pause(); clearInterval(timer);
    if (o.title != null) {
      $$('.t-title').forEach(e => e.textContent = o.title);
      $$('.t-artist').forEach(e => e.textContent = o.artist || '');
      $$('.mini .art, .sheet .art').forEach(e => o.img ? e.style.setProperty('--img', `url("${o.img}")`) : e.style.removeProperty('--img'));
    }
    playing = !!o.playing; pos = o.pos || 0; len = o.len || 1; draw();
  }
};

load(0);
