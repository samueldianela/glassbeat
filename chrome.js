// Browser chrome. The tab title, the favicon and the theme-colour bar follow the
// current track, the way a native player does.
//
// The favicon is drawn from the cover art, which means reading a cross-origin
// image. If that read fails the dynamic icon is dropped entirely and the static
// icon.svg from index.html applies again — a broken favicon is worse than a
// generic one.
(() => {
'use strict';

const APP = 'Glassbeat';
const meta = document.querySelector('meta[name="theme-color"]');
let link = null;
let lastImg = '';
let lastTitle = '';
let lastArtist = '';

function ensureLink() {
  if (link) return link;
  link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.dataset.dyn = '1';
  document.head.appendChild(link);
  return link;
}

function dropLink() {
  if (link && link.parentNode) link.parentNode.removeChild(link);
  link = null;
}

function title(t, a) {
  if (t === lastTitle && a === lastArtist) return;
  lastTitle = t;
  lastArtist = a;
  document.title = !t ? APP : (a ? t + ' — ' + a : t) + ' · ' + APP;
}

function icon(url) {
  if (!url || url === lastImg) return;
  lastImg = url;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = dropLink;
  img.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      cv.getContext('2d').drawImage(img, 0, 0, 64, 64);
      ensureLink().href = cv.toDataURL('image/png');
    } catch (e) {
      dropLink();
    }
  };
  img.src = url;
}

// "rgb(r,g,b)" from ambient.js -> "#rrggbb" for the theme-color meta tag.
function hexOf(value) {
  const m = String(value).match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return null;
  return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
}

addEventListener('gb:palette', e => {
  if (!meta || !e.detail || !e.detail.css) return;
  const dark = hexOf(e.detail.css[0]);
  if (dark) meta.content = dark;
});

const ui = window.glassUI;
if (ui && typeof ui.set === 'function') {
  const orig = ui.set;
  ui.set = function (o) {
    if (o) {
      // script.js still seeds the placeholder card on load; don't let it own the tab.
      const placeholder = o.artist === 'Artist name' || o.title === 'Track title';
      if (o.title != null && !placeholder) title(o.title || '', o.artist || '');
      if (o.img) icon(o.img);
    }
    return orig.apply(this, arguments);
  };
}

// A page opened while something is already in the mini player.
(function seed() {
  const t = document.querySelector('.mini .t-title');
  const a = document.querySelector('.mini .t-artist');
  if (!t || !t.textContent) return;
  if (t.textContent === 'Track title' || (a && a.textContent === 'Artist name')) return;
  title(t.textContent, a ? a.textContent : '');
})();

window.glassChrome = { title };
})();
