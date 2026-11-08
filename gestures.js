// Swipe controls for the player. Left and right on the cover skip tracks, dragging
// the sheet down closes it, and a swipe up on the mini player opens the full one.
//
// Pointer events only, so the same code covers touch, pen and the mouse. Drags that
// start on a button, a range input or the scrolling lyrics are ignored, and the
// browser's own horizontal back gesture is left alone outside the cover.
(() => {
'use strict';

const sheet = document.getElementById('sheet');
const mini = document.getElementById('mini');
if (!sheet) return;

const IGNORE = 'button,input,textarea,select,a,label,.lyrics,.pick,.cmdk';
const DY_CLOSE = 110;
const DX_SKIP = 70;
const MINI_UP = 42;

let tracking = false;
let axis = '';
let sx = 0, sy = 0, dx = 0, dy = 0, pid = null;

function reset() {
  sheet.style.transform = '';
  sheet.style.transition = '';
  axis = '';
  dx = dy = 0;
}

function start(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest(IGNORE)) return;
  tracking = true;
  axis = '';
  sx = e.clientX;
  sy = e.clientY;
  dx = dy = 0;
  pid = e.pointerId;
  sheet.style.transition = 'none';
}

function move(e) {
  if (!tracking || e.pointerId !== pid) return;
  dx = e.clientX - sx;
  dy = e.clientY - sy;

  if (!axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }

  if (axis === 'y') {
    const d = dy < 0 ? dy * 0.22 : dy;      // upward drag resists hard
    sheet.style.transform = 'translateY(' + Math.max(0, d) + 'px)';
  } else {
    sheet.style.transform = 'translateX(' + dx * 0.22 + 'px)';
  }
}

function close(animate) {
  if (!sheet.classList.contains('open')) return reset();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    sheet.removeEventListener('transitionend', finish);
    sheet.style.transition = '';
    sheet.style.transform = '';
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  };
  if (!animate) return finish();
  sheet.style.transition = 'transform .26s cubic-bezier(.4,0,1,1)';
  sheet.style.transform = 'translateY(104%)';
  sheet.addEventListener('transitionend', finish);
  setTimeout(finish, 420);          // transitionend never fires on a hidden tab
}

function end(e) {
  if (!tracking || e.pointerId !== pid) return;
  tracking = false;
  pid = null;

  const x = dx, y = dy;
  const dir = axis;
  axis = '';

  if (dir === 'y' && y > DY_CLOSE) return close(true);

  if (dir === 'x' && Math.abs(x) > DX_SKIP) {
    sheet.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1)';
    sheet.style.transform = '';
    const sp = window.gb && gb.sp;
    if (sp && sp.active) (x < 0 ? sp.next() : sp.prev());
    else if (window.toast) toast('Play a song first.');
    setTimeout(reset, 320);
    return;
  }

  // snap back
  sheet.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1)';
  sheet.style.transform = '';
  setTimeout(reset, 320);
}

sheet.addEventListener('pointerdown', start);
sheet.addEventListener('pointermove', move);
sheet.addEventListener('pointerup', end);
sheet.addEventListener('pointercancel', () => { tracking = false; pid = null; reset(); });

// Mini player: flick up to open, tap still works because this never consumes clicks.
if (mini) {
  let mTracking = false, msy = 0, mid = null;
  mini.addEventListener('pointerdown', e => {
    if (e.target.closest('button,a')) return;
    mTracking = true;
    msy = e.clientY;
    mid = e.pointerId;
  });
  mini.addEventListener('pointerup', e => {
    if (!mTracking || e.pointerId !== mid) return;
    mTracking = false;
    if (msy - e.clientY > MINI_UP) mini.click();
  });
}

// The cover owns the horizontal axis so the browser leaves it to us; the rest of
// the sheet keeps vertical scrolling.
const style = document.createElement('style');
style.textContent = `
.sheet .art.xl{touch-action:pan-y}
.sheet .lyrics{touch-action:pan-y}
`;
document.head.appendChild(style);

window.glassGestures = { close };
})();
