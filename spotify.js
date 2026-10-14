// Spotify login (PKCE) and profile. Runs fully in the browser: no server, no secret.
const SCOPES = 'user-read-private user-library-read user-library-modify user-follow-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public streaming user-read-email user-modify-playback-state user-read-playback-state user-read-recently-played user-top-read';
const CLIENT_ID = ''; // Optional: paste your Client ID here. If empty, the page asks once and remembers it.
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '');

const store = {
  get: k => { try { return localStorage.getItem('gb_' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('gb_' + k, v); } catch {} },
  del: k => { try { localStorage.removeItem('gb_' + k); } catch {} }
};
const el = s => document.querySelector(s);
const clientId = () => CLIENT_ID || store.get('cid');
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const baseGreeting = el('#greeting').textContent;

function toast(msg) {
  const t = el('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 6000);
}

async function login() {
  let id = clientId();
  if (!id) { id = (prompt('Paste your Spotify Client ID') || '').trim(); if (!id) return; store.set('cid', id); }
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  store.set('verifier', verifier);
  store.set('scopes', SCOPES);
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: REDIRECT,
    code_challenge_method: 'S256', code_challenge: challenge
  });
}

async function token(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), ...params })
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const d = await r.json();
  store.set('access', d.access_token);
  store.set('expires', Date.now() + d.expires_in * 1000 - 60000);
  if (d.refresh_token) store.set('refresh', d.refresh_token);
}

async function access() {
  if (!store.get('access')) return null;
  if (Date.now() > +store.get('expires')) {
    try { await token({ grant_type: 'refresh_token', refresh_token: store.get('refresh') }); }
    catch { logout(true); return null; }
  }
  return store.get('access');
}

// Used by every later step: await gb.api('/me'), or gb.api(path, 'POST', {json})
async function api(path, method = 'GET', body) {
  const t = await access();
  if (!t) throw new Error('signed out');
  const r = await fetch('https://api.spotify.com/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const e = new Error(r.status);
    try { e.detail = ((await r.json()).error || {}).message; } catch {}
    throw e;
  }
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }   // some Spotify player commands answer with plain text
}
window.gb = { api, login, token: access, signedIn: () => !!store.get('access') };

function logout(silent) {
  ['access', 'refresh', 'expires', 'verifier'].forEach(k => store.del(k));
  show(null);
  if (!silent) toast('Logged out');
}

function show(me) {
  const av = el('#avatar');
  el('#login').hidden = !!me;
  av.hidden = !me;
  el('#menu').hidden = true;
  av.style.backgroundImage = '';
  av.classList.remove('has-img');
  const first = me && (me.display_name || '').split(' ')[0];
  el('#greeting').textContent = first ? baseGreeting + ', ' + first : baseGreeting;
  if (!me) { gb.me = null; window.dispatchEvent(new Event('gb:signedout')); return; }
  gb.me = me;
  window.dispatchEvent(new Event('gb:signedin'));
  el('#uname').textContent = me.display_name || 'Your profile';
  const img = me.images && me.images[0];
  if (img) { av.style.backgroundImage = `url("${img.url}")`; av.classList.add('has-img'); }
}

async function init() {
  el('#login').onclick = login;
  el('#logout').onclick = () => logout();
  el('#avatar').onclick = () => {
    const m = el('#menu'); m.hidden = !m.hidden;
    el('#avatar').setAttribute('aria-expanded', !m.hidden);
  };
  document.addEventListener('click', e => { if (!e.target.closest('.acct')) el('#menu').hidden = true; });

  const q = new URLSearchParams(location.search);
  if (q.get('error')) toast('Spotify login was cancelled.');
  if (q.get('code')) {
    try { await token({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT, code_verifier: store.get('verifier') }); }
    catch { toast('Login failed. Check your Client ID and Redirect URI.'); }
  }
  if (q.has('code') || q.has('error')) history.replaceState({}, '', REDIRECT);

  if (store.get('access') && store.get('scopes') !== SCOPES) {
    logout(true);
    toast('New features need new permissions. Please log in again.');
  }
  if (!(await access())) return show(null);
  try { show(await api('/me')); }
  catch (e) {
    logout(true);
    toast(e.message === '403'
      ? 'This account is not allowed yet. Add it under User management in your Spotify app.'
      : 'Could not load your profile. Try logging in again.');
  }
}
init();
