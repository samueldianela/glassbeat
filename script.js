// Placeholder content only. Replace with your own titles and cover images.
const items = [
  { type: 'music',   title: 'Late night drive',   sub: 'Playlist' },
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

// Player
const queue = [...items, ...made];
const LEN = 200;
let idx = 0, pos = 0, playing = false, timer;
const sheet = $('#sheet'), mini = $('#mini'), seek = $('#seek');
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function draw() {
  const p = (pos / LEN * 100) + '%';
  mini.style.setProperty('--p', p);
  seek.style.setProperty('--p', p);
  seek.value = pos;
  $('#cur').textContent = fmt(pos);
  $$('.play use').forEach(u => u.setAttribute('href', playing ? '#i-pause' : '#i-play'));
  $$('.play').forEach(b => b.setAttribute('aria-label', playing ? 'Pause' : 'Play'));
}
function load(i) {
  idx = (i + queue.length) % queue.length; pos = 0;
  $$('.t-title').forEach(e => e.textContent = queue[idx].title);
  $$('.t-artist').forEach(e => e.textContent = 'Artist name');
  draw();
}
function toggle(force) {
  playing = force ?? !playing;
  clearInterval(timer);
  if (playing) timer = setInterval(() => { pos += 1; if (pos >= LEN) { load(idx + 1); } draw(); }, 1000);
  draw();
}

$$('.play').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggle(); }));
$('#next').onclick = () => { load(idx + 1); draw(); };
$('#prev').onclick = () => { pos > 3 ? (pos = 0) : load(idx - 1); draw(); };
seek.oninput = () => { pos = +seek.value; draw(); };
$$('.like').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  const on = b.getAttribute('aria-pressed') !== 'true';
  $$('.like').forEach(l => l.setAttribute('aria-pressed', on));
}));

// Tap a tile or card to play it
document.addEventListener('click', e => {
  const t = e.target.closest('.tile, .card');
  if (!t) return;
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

load(0);
