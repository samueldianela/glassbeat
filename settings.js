// Settings screen: theme, playback, content preferences.
(() => {
const $ = id => document.getElementById(id);
const root = document.documentElement;
const panel = $('settings');
const pstore = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k,v) => { try { localStorage.setItem(k,v); } catch {} } };

function applyTheme(light) {
  if (light) root.dataset.theme = 'light'; else delete root.dataset.theme;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = light ? '#f1f3fb' : '#0a0d1a';
  $('lightsw').setAttribute('aria-checked', !!light);
  pstore.set('gb_theme', light ? 'light' : 'dark');
}

function applyVolLevel(level) {
  pstore.set('gb_vol_level', level);
  window.glassVolLevel = level;
  panel.querySelectorAll('[data-vlevel]').forEach(b => b.setAttribute('aria-checked', b.dataset.vlevel === level));
  const vol = level === 'quiet' ? 30 : level === 'loud' ? 100 : 70;
  if (window.gb && gb.sp && gb.sp.active) Promise.resolve(gb.sp.volume(vol)).catch(() => {});
}

function applyCrossfade(val) {
  pstore.set('gb_crossfade', val);
  window.glassXfade = +val;
  const lbl = document.getElementById('xflabel');
  if (lbl) lbl.textContent = val + 's';
}

function applyAutoplay(on) {
  pstore.set('gb_autoplay', on ? '1' : '0');
  window.glassAutoplay = on;
  const sw = $('autoplaysw'); if (sw) sw.setAttribute('aria-checked', on);
}

function applyExplicit(on) {
  pstore.set('gb_explicit', on ? '1' : '0');
  window.glassExplicit = on;
  const sw = $('explicitsw'); if (sw) sw.setAttribute('aria-checked', on);
}

function applyGapless(on) {
  pstore.set('gb_gapless', on ? '1' : '0');
  const sw = $('gaplesssw'); if (sw) sw.setAttribute('aria-checked', on);
}

function injectSections() {
  if (document.getElementById('autoplaysw')) return;
  const extra = document.createElement('div');
  extra.innerHTML = `
<div class="sset">
  <p class="shead">Playback</p>
  <label class="srow"><span>Autoplay</span><button class="tog" id="autoplaysw" role="switch" aria-checked="true"></button></label>
  <label class="srow"><span>Gapless playback</span><button class="tog" id="gaplesssw" role="switch" aria-checked="true"></button></label>
  <div class="srow col">
    <span>Crossfade</span>
    <div class="xfrow">
      <span class="xfl">0s</span>
      <input type="range" id="xfade" min="0" max="12" step="1" value="0" aria-label="Crossfade seconds">
      <span class="xfl" id="xflabel">0s</span>
    </div>
  </div>
  <div class="srow col">
    <span>Volume level</span>
    <div class="vlevels">
      <button class="vlev" data-vlevel="quiet" role="radio" aria-checked="false">Quiet</button>
      <button class="vlev" data-vlevel="normal" role="radio" aria-checked="true">Normal</button>
      <button class="vlev" data-vlevel="loud" role="radio" aria-checked="false">Loud</button>
    </div>
  </div>
</div>
<div class="sset">
  <p class="shead">Content</p>
  <label class="srow"><span>Allow explicit content</span><button class="tog" id="explicitsw" role="switch" aria-checked="true"></button></label>
</div>`;
  $('slogout').before(extra);

  $('autoplaysw').onclick = () => applyAutoplay($('autoplaysw').getAttribute('aria-checked') !== 'true');
  $('gaplesssw').onclick  = () => applyGapless($('gaplesssw').getAttribute('aria-checked') !== 'true');
  $('explicitsw').onclick = () => applyExplicit($('explicitsw').getAttribute('aria-checked') !== 'true');
  panel.querySelectorAll('[data-vlevel]').forEach(b => b.onclick = () => applyVolLevel(b.dataset.vlevel));
  const xf = $('xfade');
  xf.oninput = () => applyCrossfade(xf.value);

  const xfVal = pstore.get('gb_crossfade') || '0';
  xf.value = xfVal; applyCrossfade(xfVal);
  applyVolLevel(pstore.get('gb_vol_level') || 'normal');
  applyAutoplay(pstore.get('gb_autoplay') !== '0');
  applyGapless(pstore.get('gb_gapless') !== '0');
  applyExplicit(pstore.get('gb_explicit') !== '0');
}

function open() {
  injectSections();
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

window.glassSettings = { applyVolLevel, applyCrossfade, applyAutoplay, applyExplicit };

let light = false;
try { light = localStorage.getItem('gb_theme') === 'light'; } catch {}
applyTheme(light);

window.glassXfade    = +(pstore.get('gb_crossfade') || 0);
window.glassVolLevel = pstore.get('gb_vol_level') || 'normal';
window.glassAutoplay = pstore.get('gb_autoplay') !== '0';
window.glassExplicit = pstore.get('gb_explicit') !== '0';
})();
