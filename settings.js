// Settings screen (opens when you tap your profile picture): Light mode and Log out.
(() => {
const $ = id => document.getElementById(id);
const root = document.documentElement;
const panel = $('settings');

function applyTheme(light) {
  if (light) root.dataset.theme = 'light'; else delete root.dataset.theme;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = light ? '#f1f3fb' : '#0a0d1a';
  $('lightsw').setAttribute('aria-checked', !!light);
  try { localStorage.setItem('gb_theme', light ? 'light' : 'dark'); } catch {}
}
function open() {
  const me = window.gb && gb.me;
  const img = me && me.images && me.images[0];
  const av = $('sav');
  $('sname').textContent = me ? (me.display_name || 'Spotify user') : 'Not logged in';
  $('smeta').textContent = me ? 'Logged in with Spotify' : 'Log in to use Glassbeat';
  av.style.backgroundImage = img ? `url("${img.url}")` : '';
  av.classList.toggle('has-img', !!img);
  $('slogout').hidden = !me;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  $('sclose').focus();
}
function close() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

window.addEventListener('gb:settings', open);
$('sclose').onclick = close;
$('lightsw').onclick = () => applyTheme($('lightsw').getAttribute('aria-checked') !== 'true');
$('slogout').onclick = () => { close(); gb.logout(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });

let light = false;
try { light = localStorage.getItem('gb_theme') === 'light'; } catch {}
applyTheme(light);
})();
