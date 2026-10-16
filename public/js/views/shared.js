// Small pieces shared by several views.
import { esc, spinner, statusPill } from '../core.js';
import { icon } from '../icons.js';

export function brandMark() {
  return `
  <div class="brand">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#7a1f2e"/>
      <path d="M24 9l12 5v9c0 9-5 15-12 17-7-2-12-8-12-17v-9z" fill="#fff"/>
      <circle cx="24" cy="22" r="3.6" fill="#d9a441"/>
      <path d="M22.4 24.5h3.2l.8 7h-4.8z" fill="#d9a441"/>
    </svg>
    <div><b>Records Portal</b><small>Ashesi · ICS570 Secure Lab</small></div>
  </div>`;
}

export const loader = () => `<div class="loader">${spinner('spinner icon-lg')}</div>`;

/** Shown when the *server* refuses a request; the UI never makes this decision itself. */
export function deniedPanel(error, path) {
  return `
  <div class="card denied">
    <div class="denied-icon">${icon('lock', 'icon-lg')}</div>
    <h2>${error.status === 401 ? 'Sign-in required' : 'Access denied by the server'}</h2>
    <p>${esc(error.message)}</p>
    ${statusPill(error.status)}
    <p style="font-size:.75rem">Requested <code>${esc(path)}</code>. The authorisation middleware in
      <code>src/middleware/authz.js</code> made this decision and wrote an <code>[AUDIT]</code> line on the server.</p>
  </div>`;
}

export function statCard(tone, iconName, value, label) {
  return `
  <div class="stat tone-${tone}">
    <div class="stat-icon">${icon(iconName, 'icon-lg', 2)}</div>
    <div style="min-width:0">
      <p class="stat-value">${esc(value)}</p>
      <p class="stat-label">${esc(label)}</p>
    </div>
  </div>`;
}

export function switchEl(on, label) {
  return `
  <div class="switch ${on ? 'on' : ''}">
    <span>${esc(label)}</span>
    <span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>
  </div>`;
}
