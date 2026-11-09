// Motion pass for the interface, built around the twenty craft rules:
// ease-out entrances, menus at 180ms, rows staggered at 30ms, presses land on
// .97, knobs stretch while dragged, exits run 20% shorter than entrances,
// popovers grow from the control that opened them, and the cover art is the
// same object between the mini player and the full one.
//
// Additive only: CSS is injected, the DOM writes are a flight clone, a fading
// ghost during view changes, and per-row delay indices. Nothing here changes
// how the app stores state or talks to Spotify.
(() => {
'use strict';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => calm.matches;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (n, lo, hi) => n < lo ? lo : n > hi ? hi : n;

// ---------------------------------------------------------------- styles
const style = document.createElement('style');
style.textContent = `
:root{--mb-in:.42s;--mb-out:.336s}

/* 4. Press feedback lands on .97, fast enough to feel like contact. */
.tile,.card,.item,.opt,.chip,.tab,.recent,.login,.ib,.avatar,.nav button,.switch{
  transition:transform .14s cubic-bezier(.4,0,.2,1)}
.tile:active,.card:active,.item:active,.opt:active,.chip:active,.tab:active,
.recent:active,.login:active,.ib:active,.avatar:active,.nav button:active,.switch:active{
  transform:scale(.97)}

/* 5/14. Knobs stretch 12% along the drag axis, instantly while held. */
input[type=range]::-webkit-slider-thumb{transition:transform .12s ease-out}
input[type=range]:active::-webkit-slider-thumb{transform:scaleX(1.12) scaleY(.94)}
input[type=range]::-moz-range-thumb{transition:transform .12s ease-out}
input[type=range]:active::-moz-range-thumb{transform:scaleX(1.12) scaleY(.94)}
input[type=range][data-mb-held]::-webkit-slider-thumb{transition:none}
input[type=range][data-mb-held]::-moz-range-thumb{transition:none}

/* 1/3/6/9. Entrances ease out, details settle in sequence. translate is used
   instead of transform so :active scale keeps working on the same nodes. */
.mb-in{animation:mb-rise .3s cubic-bezier(.2,.8,.2,1) both;
  animation-delay:calc(var(--mb-i,0) * 30ms)}
@keyframes mb-rise{from{opacity:0;translate:0 10px}to{opacity:1;translate:0 0}}
.mb-view-in{animation:mb-view .28s cubic-bezier(.4,0,.2,1) both}
@keyframes mb-view{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}
.mb-mask{animation:mb-mask .42s cubic-bezier(.2,.8,.2,1) both}
@keyframes mb-mask{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0)}}

/* 10/11. Popovers grow from the control that opened them. */
.pick .sheetp{animation:mb-pop .18s cubic-bezier(.2,.8,.2,1) both;
  transform-origin:var(--mb-ox,50%) var(--mb-oy,100%)}
@keyframes mb-pop{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:none}}

/* 2/13/15. Menus stay in the 150-250ms band, exits 20% shorter. */
.cmdk{transition:opacity .15s ease-out}
.cmdk.open{transition:opacity .18s ease-out}
.cmdk .cbox{opacity:0;transform:scale(.95);transform-origin:50% 0;
  transition:opacity .15s ease-out,transform .15s cubic-bezier(.2,.8,.2,1)}
.cmdk.open .cbox{opacity:1;transform:none;transition-duration:.18s}
.sheet:not(.open){transition:transform var(--mb-out) cubic-bezier(.2,.9,.25,1),
  visibility 0s var(--mb-out)}
.sheet.open{transition:transform var(--mb-in) cubic-bezier(.2,.9,.25,1),
  visibility 0s 0s}
.settings:not(.open){transition:transform .36s cubic-bezier(.2,.9,.25,1),
  visibility 0s .36s}
.settings.open{transition:transform .45s cubic-bezier(.2,.9,.25,1),visibility 0s 0s}
.stats:not(.open){transition:transform .36s cubic-bezier(.2,.9,.25,1),
  visibility 0s .36s}
.stats.open{transition:transform .45s cubic-bezier(.2,.9,.25,1),visibility 0s 0s}

/* 8. A short pulse confirms that something landed. */
#toast.mb-pulse{animation:mb-toast .34s cubic-bezier(.2,.8,.2,1)}
@keyframes mb-toast{
  0%{transform:translateX(-50%) scale(1)}
  35%{transform:translateX(-50%) scale(1.05)}
  100%{transform:translateX(-50%) scale(1)}}
.like.mb-pulse .ic,.sv.mb-pulse .ic{animation:mb-heart .42s cubic-bezier(.2,.8,.2,1)}
@keyframes mb-heart{
  0%{transform:scale(1)}35%{transform:scale(1.22)}
  70%{transform:scale(.94)}100%{transform:scale(1)}}

/* 7/20. The cover is one object: a fixed clone flies the arc between the
   mini player and the full player, then the real element takes over. */
.mb-fly{position:fixed;z-index:11;pointer-events:none;background-size:cover;
  background-position:center;border:1px solid rgba(var(--tint),.12);
  box-shadow:0 18px 50px rgba(0,0,0,.4);will-change:transform}
.mb-art-reveal{transition:opacity .18s ease-out}
.mb-measure{transform:none!important;transition:none!important}
.mb-ghost{pointer-events:none!important;z-index:0!important}
`;
document.head.appendChild(style);

const body = document.body;

// ------------------------------------------------------------ row stagger
// 3/6. New rows and cards inherit an index; 30ms apart, capped so a long
// shelf never takes more than a beat to settle.
const STAGER = '.list,.row,.quick,.recents,.scards,.sweek';
const queued = new Set();
let raf = 0;
function stagger(c) {
  if (!c.isConnected) return;
  [...c.children].slice(0, 16).forEach((n, i) => {
    if (n.nodeType !== 1 || n.hasAttribute('data-mb')) return;
    n.setAttribute('data-mb', '');
    n.style.setProperty('--mb-i', Math.min(i, 8));
    if (!reduced()) n.classList.add('mb-in');
  });
}
function enqueue(el) {
  if (!el || reduced()) return;
  queued.add(el);
  if (!raf) raf = requestAnimationFrame(() => {
    raf = 0;
    queued.forEach(stagger);
    queued.clear();
  });
}
function cascade(root, sel) {
  if (!root || reduced()) return;
  [...root.querySelectorAll(sel)].forEach((n, i) => {
    n.classList.remove('mb-in');
    n.style.setProperty('--mb-i', Math.min(i, 8));
    void n.offsetWidth;
    n.classList.add('mb-in');
  });
}
function detailIn(node) {
  if (!node || reduced()) return;
  const hits = [];
  if (node.matches('.dtop,.dact')) hits.push(node);
  if (node.querySelectorAll) hits.push(...node.querySelectorAll('.dtop,.dact'));
  hits.forEach((n, i) => {
    if (n.dataset.mbDetail) return;
    n.dataset.mbDetail = '';
    n.style.setProperty('--mb-i', Math.min(i, 8));
    n.classList.add('mb-in');
  });
  const top = node.matches('.dtop') ? node : node.querySelector('.dtop');
  const art = top && top.querySelector('.art');
  if (art) art.classList.add('mb-mask');
}
new MutationObserver(muts => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(STAGER)) enqueue(n);
      if (n.querySelectorAll) n.querySelectorAll(STAGER).forEach(enqueue);
      const p = n.parentElement && n.parentElement.closest(STAGER);
      if (p) enqueue(p);
      detailIn(n);
    }
  }
}).observe(body, { childList: true, subtree: true });
requestAnimationFrame(() => $$('.row,.quick,.list').forEach(stagger));

// ------------------------------------------------------- 16. old and new
// A fading clone of the outgoing page sits under the incoming one for 170ms,
// so the swap overlaps instead of blinking.
function visibleView() {
  return ['view-home', 'view-search', 'view-library', 'view-detail']
    .map(id => document.getElementById(id)).find(v => v && !v.hidden);
}
function ghost(el) {
  if (!el || reduced() || !el.isConnected || el.hidden) return;
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 40) return;
  let c;
  try { c = el.cloneNode(true); } catch (e) { return; }
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.querySelectorAll('.mb-view-in,.mb-in')
    .forEach(n => n.classList.remove('mb-view-in', 'mb-in'));
  c.classList.remove('mb-view-in', 'mb-in');
  Object.assign(c.style, {
    position: 'absolute', left: (r.left + scrollX) + 'px',
    top: (r.top + scrollY) + 'px', width: r.width + 'px',
    margin: '0', pointerEvents: 'none', zIndex: '0'
  });
  body.appendChild(c);
  const a = c.animate(
    [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }],
    { duration: 170, easing: 'cubic-bezier(.4,0,.2,1)' });
  a.onfinish = () => c.remove();
  setTimeout(() => c.remove(), 260);
}
document.addEventListener('click', e => {
  if (reduced()) return;
  const nav = e.target.closest('.nav button');
  if (nav) {
    const i = $$('.nav button').indexOf(nav);
    if (i >= 0 && i < 3) ghost(visibleView());
    return;
  }
  if (e.target.closest('.opn')) return ghost(visibleView());
  if (e.target.closest('#dback')) {
    const d = document.getElementById('view-detail');
    if (d && !d.hidden) ghost(d);
  }
}, true);

// Views animate in whenever the app flips their hidden flag.
['view-home', 'view-search', 'view-library'].forEach(id => {
  const v = document.getElementById(id);
  if (!v) return;
  let was = v.hidden;
  new MutationObserver(() => {
    if (v.hidden === was) return;
    was = v.hidden;
    if (v.hidden || reduced()) return;
    v.classList.remove('mb-view-in');
    void v.offsetWidth;
    v.classList.add('mb-view-in');
  }).observe(v, { attributes: true, attributeFilter: ['hidden'] });
});

// ------------------------------------------------- 10/11/12. popovers
let point = { x: innerWidth / 2, y: innerHeight * 0.82 };
document.addEventListener('pointerdown', e => {
  point = { x: e.clientX, y: e.clientY };
}, true);

function origin(sp) {
  const r = sp.getBoundingClientRect();
  if (!r.width || !r.height) return;
  sp.style.setProperty('--mb-ox', clamp(point.x - r.left, 0, r.width) + 'px');
  sp.style.setProperty('--mb-oy', clamp(point.y - r.top, 0, r.height) + 'px');
}

function exitGhost(node) {
  if (!node || node.classList.contains('mb-exit')) return;
  if (reduced() || document.hidden) return;
  let c;
  try { c = node.cloneNode(true); } catch (e) { return; }
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.classList.add('mb-exit');
  Object.assign(c.style, {
    position: 'fixed', inset: '0', zIndex: '29', pointerEvents: 'none'
  });
  const sp = c.querySelector('.sheetp');
  if (sp) sp.style.animation = 'none';
  body.appendChild(c);
  const fade = c.animate([{ opacity: 1 }, { opacity: 0 }],
    { duration: 150, easing: 'cubic-bezier(.4,0,.2,1)' });
  if (sp) {
    sp.style.transformOrigin = 'var(--mb-ox,50%) var(--mb-oy,100%)';
    sp.animate([{ transform: 'scale(1)' }, { transform: 'scale(.95)' }],
      { duration: 150, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  }
  fade.onfinish = () => c.remove();
  setTimeout(() => c.remove(), 240);
}

new MutationObserver(muts => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList.contains('pick')) {
        queueMicrotask(() => {
          const sp = n.querySelector('.sheetp');
          if (sp) origin(sp);
        });
      }
      if (n.classList.contains('sheetp')) queueMicrotask(() => origin(n));
      if (n.classList.contains('stats')) watchStats(n);
    }
    for (const n of m.removedNodes) {
      if (n.nodeType === 1 && n.classList.contains('pick') &&
          !n.classList.contains('mb-exit')) exitGhost(n);
    }
  }
}).observe(body, { childList: true, subtree: true });

// --------------------------------------------------- 8. success feedback
const toastEl = document.getElementById('toast');
if (toastEl) {
  const kick = () => {
    if (toastEl.hidden || reduced()) return;
    toastEl.classList.remove('mb-pulse');
    void toastEl.offsetWidth;
    toastEl.classList.add('mb-pulse');
    setTimeout(() => toastEl.classList.remove('mb-pulse'), 380);
  };
  new MutationObserver(kick).observe(toastEl, {
    childList: true, attributes: true, attributeFilter: ['hidden']
  });
}
new MutationObserver(muts => {
  for (const m of muts) {
    if (!m.target.matches('.like,.sv')) continue;
    if (m.oldValue === m.target.getAttribute('aria-pressed')) continue;
    const b = m.target;
    b.classList.remove('mb-pulse');
    void b.offsetWidth;
    b.classList.add('mb-pulse');
    setTimeout(() => b.classList.remove('mb-pulse'), 460);
  }
}).observe(body, {
  subtree: true, attributes: true, attributeFilter: ['aria-pressed'],
  attributeOldValue: true
});

// ------------------------------------------------ 18. icon crossfade + blur
const lastHref = new WeakMap();
function flash(svg) {
  if (reduced() || !svg) return;
  svg.animate([
    { opacity: 1, filter: 'blur(0px)' },
    { opacity: 0, filter: 'blur(3px)', offset: .45 },
    { opacity: 0, filter: 'blur(3px)', offset: .55 },
    { opacity: 1, filter: 'blur(0px)' }
  ], { duration: 240, easing: 'ease-out' });
}
document.querySelectorAll('use[href]')
  .forEach(u => lastHref.set(u, u.getAttribute('href')));
new MutationObserver(muts => {
  for (const m of muts) {
    if (!m.target.closest) continue;
    const v = m.target.getAttribute('href');
    if (lastHref.get(m.target) === v) continue;
    lastHref.set(m.target, v);
    const svg = m.target.closest('svg.ic');
    if (svg) flash(svg);
  }
}).observe(body, { subtree: true, attributes: true, attributeFilter: ['href'] });

// ------------------------------------------------ 14. no tween while held
const findRange = e => e.target.closest && e.target.closest('input[type=range]');
document.addEventListener('pointerdown', e => {
  const r = findRange(e);
  if (r) r.setAttribute('data-mb-held', '');
}, true);
const dropRange = e => {
  const r = findRange(e);
  if (r) r.removeAttribute('data-mb-held');
};
document.addEventListener('pointerup', dropRange, true);
document.addEventListener('pointercancel', dropRange, true);

// --------------------------------------------- 19. rubber band on the mini
// Pulling the mini player past its rest position resists, then snaps back.
const mini = document.getElementById('mini');
if (mini) {
  let sy = null, pid = null;
  mini.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button,a,input')) return;
    sy = e.clientY; pid = e.pointerId;
    mini.style.transition = 'none';
  }, { passive: true });
  mini.addEventListener('pointermove', e => {
    if (sy == null || e.pointerId !== pid) return;
    const d = e.clientY - sy;
    const pull = d > 0 ? Math.min(26, d * .3) : -Math.min(18, -d * .14);
    mini.style.transform = 'translateY(' + pull.toFixed(1) + 'px)';
  }, { passive: true });
  const release = () => {
    if (sy == null) return;
    sy = null; pid = null;
    mini.style.transition = 'transform .26s cubic-bezier(.2,.9,.25,1)';
    mini.style.transform = '';
    setTimeout(() => { if (sy == null) mini.style.transition = ''; }, 300);
  };
  mini.addEventListener('pointerup', release);
  mini.addEventListener('pointercancel', release);
}

// --------------------------------------------------- 6. settings settle
const settingsEl = document.getElementById('settings');
if (settingsEl) {
  let open = settingsEl.classList.contains('open');
  new MutationObserver(() => {
    const now = settingsEl.classList.contains('open');
    if (now === open) return;
    open = now;
    if (now) cascade(settingsEl, '.sprofile,.sgroup,.slogout');
  }).observe(settingsEl, { attributes: true, attributeFilter: ['class'] });
}

// Stats is built on first open, so watch for the panel and then its class.
function watchStats(panel) {
  if (!panel || panel.dataset.mbWatch) return;
  panel.dataset.mbWatch = '';
  let open = panel.classList.contains('open');
  const run = () => cascade(panel, '#stbody .scard,#stbody .sgroup');
  new MutationObserver(() => {
    const now = panel.classList.contains('open');
    if (now === open) return;
    open = now;
    if (now) run();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  if (open) run();
}
const statsEl = document.querySelector('.stats');
if (statsEl) watchStats(statsEl);

// ------------------------------------------------ 7/20. shared cover flight
// The cover is one object. A clone leaves the mini art, arcs to the resting
// place of the large art, and the real element takes over when it lands.
const sheet = document.getElementById('sheet');
const sheetArt = sheet && sheet.querySelector('.art.xl');
const miniArt = document.querySelector('#mini .art.sm');
let flying = null;

// Finish events do not fire in every browser context (background tabs, some
// embedded webviews), so every flight settles on the event or on a timer,
// whichever lands first. A stuck clone would otherwise leave the art hidden.
function settle(node, ms, after) {
  let done = false;
  const end = () => {
    if (done || !flying || flying.node !== node) return;
    done = true;
    node.remove();
    flying = null;
    after();
  };
  if (flying && flying.anim) flying.anim.onfinish = end;
  setTimeout(end, ms);
}

function restoreFlight() {
  if (!flying) return;
  const f = flying;
  flying = null;
  try { f.anim.cancel(); } catch (e) {}
  f.node.remove();
  if (miniArt) miniArt.style.opacity = '';
  if (sheetArt) {
    sheetArt.style.opacity = '';
    sheetArt.classList.remove('mb-art-reveal');
  }
}

// Resting rect of the large art, measured from a hidden clone of the sheet so
// the live transition is never interrupted.
function restRect() {
  if (!sheet) return null;
  const c = sheet.cloneNode(true);
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.classList.add('open', 'mb-measure');
  Object.assign(c.style, {
    position: 'fixed', visibility: 'hidden', zIndex: '-1',
    pointerEvents: 'none', transition: 'none', transform: 'none'
  });
  body.appendChild(c);
  const a = c.querySelector('.art.xl');
  const r = a && a.getClientRects().length ? a.getBoundingClientRect() : null;
  c.remove();
  return r;
}

function flyOpen() {
  if (!sheet || !sheetArt || !miniArt || reduced()) return;
  if (!sheetArt.getClientRects().length) return;
  restoreFlight();
  const from = miniArt.getBoundingClientRect();
  const to = restRect();
  if (!from.width || !to || !to.width) return;

  const rs = parseFloat(getComputedStyle(miniArt).borderTopLeftRadius) || 16;
  const rt = parseFloat(getComputedStyle(sheetArt).borderTopLeftRadius) || 34;
  const scale = to.width / from.width;
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);

  const c = document.createElement('div');
  c.className = 'mb-fly';
  Object.assign(c.style, {
    left: from.left + 'px', top: from.top + 'px',
    width: from.width + 'px', height: from.height + 'px',
    borderRadius: rs + 'px',
    backgroundImage: getComputedStyle(miniArt).backgroundImage
  });
  body.appendChild(c);

  sheetArt.classList.add('mb-art-reveal');
  sheetArt.style.opacity = '0';
  miniArt.style.opacity = '0';

  const anim = c.animate([
    { transform: 'translate(0px,0px) scale(1)', borderRadius: rs + 'px' },
    {
      transform: 'translate(' + (dx * .55) + 'px,' + (dy * .45 - 44) + 'px) scale(' +
        (1 + (scale - 1) * .5) + ')',
      borderRadius: ((rs + rt / scale) / 2) + 'px', offset: .5
    },
    {
      transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')',
      borderRadius: (rt / scale) + 'px'
    }
  ], { duration: 420, easing: 'cubic-bezier(.45,.05,.55,.95)' });

  flying = { node: c, anim };
  settle(c, 500, () => {
    miniArt.style.opacity = '';
    sheetArt.style.opacity = '1';
    setTimeout(() => {
      sheetArt.classList.remove('mb-art-reveal');
      sheetArt.style.opacity = '';
    }, 200);
  });
}

function flyClose() {
  if (!sheet || !sheetArt || !miniArt || reduced()) return;
  if (!sheetArt.getClientRects().length) return;
  const from = sheetArt.getBoundingClientRect();
  if (from.top > innerHeight * .6) return;      // swipe already took it away
  const to = miniArt.getBoundingClientRect();
  if (!from.width || !to.width) return;
  restoreFlight();

  const rs = parseFloat(getComputedStyle(sheetArt).borderTopLeftRadius) || 34;
  const rt = parseFloat(getComputedStyle(miniArt).borderTopLeftRadius) || 16;
  const scale = to.width / from.width;
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);

  const c = document.createElement('div');
  c.className = 'mb-fly';
  Object.assign(c.style, {
    left: from.left + 'px', top: from.top + 'px',
    width: from.width + 'px', height: from.height + 'px',
    borderRadius: rs + 'px',
    backgroundImage: getComputedStyle(sheetArt).backgroundImage
  });
  body.appendChild(c);

  sheetArt.style.opacity = '0';
  miniArt.style.opacity = '0';

  const anim = c.animate([
    { transform: 'translate(0px,0px) scale(1)', borderRadius: rs + 'px' },
    {
      transform: 'translate(' + (dx * .5) + 'px,' + (dy * .5 + 24) + 'px) scale(' +
        (1 + (scale - 1) * .55) + ')',
      borderRadius: ((rs + rt / scale) / 2) + 'px', offset: .5
    },
    {
      transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')',
      borderRadius: (rt / scale) + 'px'
    }
  ], { duration: 320, easing: 'cubic-bezier(.45,.05,.55,.95)' });

  flying = { node: c, anim };
  settle(c, 400, () => {
    miniArt.style.opacity = '';
    sheetArt.style.opacity = '';
  });
}

if (sheet) {
  let open = sheet.classList.contains('open');
  new MutationObserver(() => {
    const now = sheet.classList.contains('open');
    if (now === open) return;
    open = now;
    if (now) {
      cascade(sheet, '.stop,.np,#seek,.times,.ctrl');
      flyOpen();
      if (reduced() && sheetArt) {
        sheetArt.classList.remove('mb-mask');
        void sheetArt.offsetWidth;
        sheetArt.classList.add('mb-mask');
      }
    } else {
      flyClose();
    }
  }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
}

window.glassMotion = {
  stagger, cascade, ghost, open: flyOpen, close: flyClose,
  reduced: () => reduced()
};
})();
