// Glass dialogs. Replaces the browser's prompt() and confirm() so naming a
// playlist looks like the rest of the app instead of a system box.
//
// window.glassAsk({title, message, value, placeholder, ok, cancel}) -> string|null
// window.glassConfirm({title, message, ok, cancel}) -> boolean
(() => {
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
let live = null;

const style = document.createElement('style');
style.textContent = `
.gdlg{gap:.75rem}
.gdlg h2{margin:0 0 .25rem}
.gdlg .note{margin:0 0 .25rem}
.ginput{width:100%;height:3rem;padding:0 1rem;border-radius:1rem;
  border:1px solid rgba(var(--tint),.18);background:rgba(var(--tint),.08);
  color:var(--text);font:inherit;font-size:1rem;outline:none;
  transition:border-color .15s ease-out,background .15s ease-out}
.ginput::placeholder{color:var(--muted)}
.ginput:focus{border-color:rgba(var(--tint),.45);background:rgba(var(--tint),.12)}
.grow{display:flex;gap:.5rem;justify-content:flex-end;margin-top:.25rem}
.grow .opt{flex:0 0 auto;min-width:6.5rem;text-align:center}
.grow .gok{background:var(--text);color:var(--ink)}
html[data-theme=light] .grow .gok{background:var(--ink);color:var(--text)}
`;
document.head.appendChild(style);

function run(o) {
  const opts = Object.assign({
    title: '', message: '', value: '', placeholder: '',
    ok: 'OK', cancel: 'Cancel', input: true
  }, o || {});

  return new Promise(resolve => {
    if (live) { live.remove(); live = null; }

    const dlg = document.createElement('div');
    dlg.className = 'pick';
    const form = document.createElement('form');
    form.className = 'sheetp glass gdlg';
    form.noValidate = true;
    form.innerHTML =
      '<h2>' + esc(opts.title) + '</h2>' +
      (opts.message ? '<p class="note">' + esc(opts.message) + '</p>' : '') +
      (opts.input
        ? '<input class="ginput" type="text" autocomplete="off" spellcheck="false" value="' +
          esc(opts.value) + '" placeholder="' + esc(opts.placeholder) +
          '" aria-label="' + esc(opts.title) + '">'
        : '') +
      '<div class="grow">' +
        '<button type="button" class="opt cancel" data-x>' + esc(opts.cancel) + '</button>' +
        '<button type="submit" class="opt gok">' + esc(opts.ok) + '</button>' +
      '</div>';
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    live = dlg;

    const input = form.querySelector('.ginput');
    let done = false;

    const finish = val => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', key, true);
      if (live === dlg) live = null;
      dlg.remove();
      resolve(val);
    };

    const key = e => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(null);
    };
    document.addEventListener('keydown', key, true);

    dlg.addEventListener('pointerdown', e => { if (e.target === dlg) finish(null); });
    form.querySelector('[data-x]').onclick = () => finish(null);
    form.onsubmit = e => {
      e.preventDefault();
      finish(opts.input ? input.value.trim() : true);
    };

    if (input) { input.focus(); input.select(); }
    else form.querySelector('.gok').focus();
  });
}

window.glassAsk = o => run(Object.assign({ input: true }, o || {}));
window.glassConfirm = o => run(Object.assign({ input: false }, o || {}))
  .then(v => v === true);
})();
