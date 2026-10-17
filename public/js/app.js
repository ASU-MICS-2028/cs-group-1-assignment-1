// Entry point: session bootstrap, hash router and the signed-in app shell.
// Routing here is cosmetic. The server re-checks the session and the
// authorisation policy on every API request.
import 'webauthn-polyfills';
import { esc, initials, request, toast } from './core.js';
import { icon } from './icons.js';
import { monitorIllustration } from './illustrations.js';
import { registerPasskey, friendlyError } from './passkeys.js';
import { renderEnroll, renderLogin } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderLab } from './views/lab.js';
import { renderRecord } from './views/record.js';
import { renderRoster } from './views/roster.js';
import { brandMark } from './views/shared.js';

const app = document.getElementById('app');
const state = { user: null, rpId: 'localhost' };
let cleanup = null;

const navigate = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

async function refreshSession() {
  const res = await request('GET', '/auth/session', undefined, { label: 'Session' });
  state.user = res.body?.authenticated ? res.body.user : null;
  state.rpId = res.body?.rpId || state.rpId;
}

function navItems(user) {
  const items = [{ href: '#/dashboard', label: 'Dashboard', icon: 'grid' }];
  if (user.role === 'student') items.push({ href: `#/students/${encodeURIComponent(user.id)}`, label: 'My Record', icon: 'record' });
  else items.push({ href: '#/courses/C101', label: 'Course Roster', icon: 'book' });
  items.push({ href: '#/lab', label: 'Security Lab', icon: 'flask' });
  return items;
}

function sidebar(user, current) {
  return `
  <div class="sidebar-inner">
    <a href="#/dashboard">${brandMark()}</a>
    <button type="button" class="cta" data-action="add-passkey">
      <span class="cta-text">Add a<br/>Passkey</span>
      <span class="cta-plus">${icon('plus', 'icon', 2.4)}</span>
    </button>
    <nav class="nav" aria-label="Main">
      ${navItems(user).map((n) => `
        <a href="${n.href}" ${current.startsWith(n.href) ? 'aria-current="page"' : ''}>${icon(n.icon)}${esc(n.label)}</a>`).join('')}
    </nav>
    <div class="side-card">
      ${monitorIllustration()}
      <p>Signed in with a passkey. Sessions end after 30&nbsp;minutes or on sign-out.</p>
      <button type="button" class="btn btn-primary btn-sm btn-block" data-action="logout" id="logout-btn">${icon('logout', 'icon-sm')} Sign Out</button>
    </div>
  </div>`;
}

const TITLES = [
  [/^#\/dashboard/, 'Dashboard'],
  [/^#\/students\//, 'Student Record'],
  [/^#\/courses\//, 'Course Roster'],
  [/^#\/lab/, 'Security Lab'],
];

function shell(user, hash) {
  const now = new Date();
  const title = TITLES.find(([re]) => re.test(hash))?.[1] ?? 'Portal';
  const displayName = user.name;
  app.innerHTML = `
  <div class="shell">
    <div class="shell-frame">
      <aside class="sidebar">${sidebar(user, hash)}</aside>
      <div class="main-col">
        <header class="topbar">
          <button type="button" class="icon-btn menu-btn" data-action="drawer" aria-label="Open menu">${icon('menu', 'icon-lg')}</button>
          <div class="topbar-title">
            <h1>${esc(title)}</h1>
            <p><span class="day">${now.toLocaleDateString('en-GB', { weekday: 'long' })}</span><span class="muted">, ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span></p>
          </div>
          <a class="icon-btn" href="#/lab" aria-label="Security Lab">${icon('history', 'icon-lg')}</a>
          <div class="user-chip">
            <button type="button" class="user-btn" data-action="menu" aria-expanded="false">
              <span class="avatar">${esc(initials(displayName))}</span>
              <span class="user-meta"><b>${esc(displayName)}</b><small>${esc(user.role)} · ${esc(user.id)}</small></span>
              ${icon('chevronDown', 'icon-sm')}
            </button>
            <div class="menu hidden" id="user-menu">
              <button type="button" data-action="add-passkey">${icon('key', 'icon-sm')} Add a passkey</button>
              <a href="#/lab">${icon('flask', 'icon-sm')} Security Lab</a>
              <button type="button" class="danger" data-action="logout">${icon('logout', 'icon-sm')} Sign Out</button>
            </div>
          </div>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>
  </div>`;
  return app.querySelector('#view');
}

function publicLabShell() {
  app.innerHTML = `
  <div class="public-bar">
    <a href="#/login">${brandMark()}</a>
    <a class="btn btn-primary btn-sm" href="#/login">${icon('key', 'icon-sm')} Sign in</a>
  </div>
  <main class="public-main" id="view"></main>`;
  return app.querySelector('#view');
}

async function logout() {
  const res = await request('POST', '/logout', undefined, { label: 'Logout' });
  state.user = null;
  toast(res.ok ? 'Signed out. The server destroyed your session.' : 'Sign-out failed.', res.ok ? 'info' : 'error');
  navigate('#/login');
}

async function addPasskey() {
  try {
    await registerPasskey({ userId: state.user.id, rpId: state.rpId });
    toast('Passkey added. Its public key is now linked to your account.', 'success');
  } catch (err) {
    toast(err.status ? err.message : friendlyError(err), 'error');
  }
}

// Delegated shell actions (sidebar, drawer, menu)
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) {
    const menu = app.querySelector('#user-menu');
    if (menu && !e.target.closest('.user-chip')) menu.classList.add('hidden');
    return;
  }
  const action = el.dataset.action;
  if (action === 'logout') logout();
  if (action === 'add-passkey') addPasskey();
  if (action === 'menu') app.querySelector('#user-menu').classList.toggle('hidden');
  if (action === 'drawer') {
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.innerHTML = `<div class="drawer-backdrop"></div><aside class="sidebar">${sidebar(state.user, location.hash)}</aside>`;
    drawer.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('drawer-backdrop') || ev.target.closest('a')) drawer.remove();
      const act = ev.target.closest('[data-action]');
      if (act) { drawer.remove(); if (act.dataset.action === 'logout') logout(); if (act.dataset.action === 'add-passkey') addPasskey(); }
    });
    document.body.appendChild(drawer);
  }
});

async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  document.querySelectorAll('.drawer').forEach((d) => d.remove());

  const hash = location.hash || (state.user ? '#/dashboard' : '#/login');
  const ctx = {
    user: state.user,
    rpId: state.rpId,
    navigate,
    onSignedIn: async () => { await refreshSession(); navigate('#/dashboard'); },
  };

  if (hash.startsWith('#/lab')) {
    const view = state.user ? shell(state.user, hash) : publicLabShell();
    cleanup = renderLab(view, ctx);
    return;
  }
  if (!state.user) {
    if (hash.startsWith('#/enroll')) renderEnroll(app, ctx);
    else cleanup = renderLogin(app, ctx);
    return;
  }
  if (hash === '#/login' || hash === '#/enroll' || hash === '#/' || hash === '') {
    navigate('#/dashboard');
    return;
  }

  const view = shell(state.user, hash);
  const student = hash.match(/^#\/students\/([^/?#]+)/);
  const course = hash.match(/^#\/courses\/([^/?#]+)/);
  if (student) await renderRecord(view, ctx, decodeURIComponent(student[1]));
  else if (course) await renderRoster(view, ctx, decodeURIComponent(course[1]));
  else await renderDashboard(view, ctx);
}

window.addEventListener('hashchange', async () => {
  // Re-read the session on each navigation so an expired or destroyed session is noticed.
  await refreshSession();
  route();
});

await refreshSession();
route();
