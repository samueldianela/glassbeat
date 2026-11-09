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
  const sw = $('autoplaysw'); if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
}

function applyExplicit(on) {
  pstore.set('gb_explicit', on ? '1' : '0');
  window.glassExplicit = on;
  const sw = $('explicitsw'); if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
}

function applyGapless(on) {
  pstore.set('gb_gapless', on ? '1' : '0');
  const sw = $('gaplesssw'); if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
}

function applyMotion(reduced) {
  root.dataset.motion = reduced ? 'reduced' : 'full';
  pstore.set('gb_motion', reduced ? 'reduced' : 'full');
  const sw = $('motionsw'); if (sw) sw.setAttribute('aria-checked', reduced ? 'false' : 'true');
}

// Inject extra settings sections — matches the .sgroup glass / .srow / .switch <i> structure from index.html
function injectSections() {
  if (document.getElementById('autoplaysw')) return;
  const extra = document.createElement('div');
  extra.innerHTML =
    '<div class="sgroup glass">' +
      '<div class="srow"><div><strong>Autoplay</strong><span>Similar content plays when your listening ends</span></div>' +
        '<button class="switch" id="autoplaysw" role="switch" aria-checked="true" aria-label="Autoplay"><i></i></button></div>' +
      '<div class="srow"><div><strong>Gapless playback</strong><span>Removes gaps between tracks</span></div>' +
        '<button class="switch" id="gaplesssw" role="switch" aria-checked="true" aria-label="Gapless playback"><i></i></button></div>' +
      '<div class="srow" style="flex-direction:column;align-items:flex-start;gap:8px">' +
        '<div><strong>Crossfade</strong> &mdash; <span id="xflabel">0s</span></div>' +
        '<input type="range" id="xfade" min="0" max="12" step="1" value="0" style="width:100%" aria-label="Crossfade seconds"></div>' +
      '<div class="srow" style="flex-direction:column;align-items:flex-start;gap:8px">' +
        '<div><strong>Volume level</strong></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="login glass vlev" data-vlevel="quiet" role="radio" aria-checked="false">Quiet</button>' +
          '<button class="login glass vlev" data-vlevel="normal" role="radio" aria-checked="true">Normal</button>' +
          '<button class="login glass vlev" data-vlevel="loud" role="radio" aria-checked="false">Loud</button>' +
        '</div></div>' +
    '</div>' +
    '<div class="sgroup glass">' +
      '<div class="srow"><div><strong>Allow explicit content</strong><span>Explicit tracks labelled E are playable</span></div>' +
        '<button class="switch" id="explicitsw" role="switch" aria-checked="true" aria-label="Allow explicit content"><i></i></button></div>' +
    '</div>';
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
  av.style.backgroundImage = img ? 'url("' + img.url + '")' : '';
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

window.glassSettings = { applyVolLevel, applyCrossfade, applyAutoplay, applyExplicit, applyMotion };

let light = false;
try { light = localStorage.getItem('gb_theme') === 'light'; } catch {}
applyTheme(light);

const motsw = $('motionsw');
if (motsw) motsw.onclick = () => applyMotion(motsw.getAttribute('aria-checked') === 'true');
let motionReduced = false;
try { motionReduced = localStorage.getItem('gb_motion') === 'reduced'; } catch {}
applyMotion(motionReduced);

window.glassXfade    = +(pstore.get('gb_crossfade') || 0);
window.glassVolLevel = pstore.get('gb_vol_level') || 'normal';
window.glassAutoplay = pstore.get('gb_autoplay') !== '0';
window.glassExplicit = pstore.get('gb_explicit') !== '0';
})();
