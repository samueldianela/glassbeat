// Ambient colour. Reads the current cover art through a canvas, pulls three
// distinct hues out of it and repaints the backdrop orbs that the glass refracts.
//
// The Spotify image CDN sends Access-Control-Allow-Origin, so the canvas stays
// readable. If a read ever throws (tainted canvas, blocked request, an image that
// is a data URI with no CORS), the palette falls back to hues derived from the
// track URI so the interface keeps its colour instead of snapping back to stock.
(() => {
'use strict';

const root = document.documentElement;
const cache = new Map();
const clamp = (n, lo, hi) => n < lo ? lo : n > hi ? hi : n;

let seq = 0;
let lastArt = '';
let lastColors = null;
let lastLight = root.dataset.theme === 'light';

// h in degrees, s and l in 0..1 -> "rgb(r,g,b)"
function hsl(h, s, l) {
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const m = Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * (l - a * m));
  };
  return 'rgb(' + f(0) + ',' + f(8) + ',' + f(4) + ')';
}

// 32x32 RGBA pixels -> up to three well separated hues, dominant first.
function palette(data) {
  const BINS = 24;
  const bins = [];
  for (let i = 0; i < BINS; i++) bins.push({ h: 0, s: 0, l: 0, w: 0 });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const d = mx - mn;
    if (!d) continue;                       // grey, no usable hue
    const l = (mx + mn) / 510;
    if (l < 0.1 || l > 0.92) continue;      // near black / near white
    const s = d / ((255 - Math.abs(mx + mn - 255)) || 1);
    if (s < 0.15) continue;                 // washed out

    let h;
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;

    const k = Math.min(BINS - 1, Math.floor(h / (360 / BINS)));
    const w = s * (1 - Math.abs(l - 0.5) * 1.1) + 0.002;
    const t = bins[k];
    t.h += h * w; t.s += s * w; t.l += l * w; t.w += w;
  }

  const ranked = bins.filter(t => t.w > 0)
    .map(t => ({ h: t.h / t.w, s: t.s / t.w, l: t.l / t.w, w: t.w }))
    .sort((a, b) => b.w - a.w);
  if (!ranked.length) return null;

  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const out = [ranked[0]];
  for (const c of ranked) {
    if (out.length === 3) break;
    if (out.every(o => dist(o.h, c.h) >= 32)) out.push(c);
  }
  while (out.length < 3) {
    const base = out[out.length - 1] || { h: 0, s: 0.5, l: 0.5 };
    out.push({ h: (base.h + 120) % 360, s: base.s, l: base.l, w: 0 });
  }
  return out;
}

// Deterministic fallback: same track always paints the same colours.
function fromHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return [
    { h, s: 0.62, l: 0.5, w: 1 },
    { h: (h + 132) % 360, s: 0.55, l: 0.5, w: 1 },
    { h: (h + 224) % 360, s: 0.5, l: 0.52, w: 1 }
  ];
}

function paint(colors) {
  if (!colors || !colors.length) return;
  const light = root.dataset.theme === 'light';
  const lum = light ? 0.58 : 0.5;
  const css = colors.map((c, i) =>
    hsl(c.h, clamp(0.35 + c.s * 0.55, 0.35, 0.85), clamp(lum + i * 0.03, 0, 1)));

  root.style.setProperty('--violet', css[0]);
  root.style.setProperty('--aqua', css[1]);
  root.style.setProperty('--peach', css[2]);
  lastColors = colors;

  // chrome.js picks this up for the theme-colour bar; anything else can too.
  window.dispatchEvent(new CustomEvent('gb:palette', {
    detail: { colors, css, light, art: lastArt }
  }));
}

function read(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return new Promise(resolve => {
    let settled = false;
    const done = v => {
      if (settled) return;
      settled = true;
      if (v) {
        if (cache.size > 80) cache.clear();
        cache.set(url, v);
      }
      resolve(v);
    };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onerror = () => done(null);
    img.onload = () => {
      try {
        const size = 32;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, size, size);
        done(palette(cx.getImageData(0, 0, size, size).data));
      } catch (e) {
        done(null);           // tainted canvas
      }
    };
    img.src = url;
  });
}

async function setArt(url) {
  if (!url || url === lastArt) return;
  lastArt = url;
  const n = ++seq;
  const found = await read(url);
  if (n !== seq) return;      // a newer cover landed while this one decoded
  paint(found || fromHash(url));
}

// Theme flips keep the album's hues, only the lightness is re-tuned for contrast.
new MutationObserver(() => {
  const light = root.dataset.theme === 'light';
  if (light === lastLight) return;
  lastLight = light;
  if (lastColors) paint(lastColors);
}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

const style = document.createElement('style');
style.textContent = [
  "@property --violet{syntax:'<color>';inherits:true;initial-value:#6d5dfc}",
  "@property --aqua{syntax:'<color>';inherits:true;initial-value:#35d0c8}",
  "@property --peach{syntax:'<color>';inherits:true;initial-value:#ff9e7a}",
  ".orbs i{transition:background-color 900ms cubic-bezier(.2,.8,.2,1)}",
  "@media (prefers-reduced-motion:reduce){.orbs i{transition:none}}"
].join('\n');
document.head.appendChild(style);

// Every player update goes through glassUI.set, so this is the one hook needed.
const ui = window.glassUI;
if (ui && typeof ui.set === 'function') {
  const orig = ui.set;
  ui.set = function (o) {
    if (o && o.img) setArt(o.img);
    return orig.apply(this, arguments);
  };
}

// Restored sessions paint before the first playback event arrives.
(function seed() {
  const art = document.querySelector('.sheet .art.xl');
  const raw = art && art.style.getPropertyValue('--img');
  const m = raw && raw.match(/url\(["']?(.*?)["']?\)/);
  if (m && m[1]) setArt(m[1]);
})();

window.glassAmbient = {
  set: setArt,
  palette: () => lastColors,
  repaint: () => { if (lastColors) paint(lastColors); }
};
})();
