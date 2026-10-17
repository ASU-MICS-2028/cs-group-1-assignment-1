// Shared helpers: HTML escaping, HTTP requests + in-page request log, toasts, formatting.
import { icon } from './icons.js';

/** Escape any server- or user-supplied text before it is placed in HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (HTTP ${status})`);
    this.status = status;
    this.body = body;
  }
}

// ---- Request log (memory only; cleared on reload) ---------------------------
const log = [];
const logListeners = new Set();
export const getLog = () => log;
export function onLogChange(fn) { logListeners.add(fn); return () => logListeners.delete(fn); }
export function clearLog() { log.length = 0; logListeners.forEach((fn) => fn()); }

/** WebAuthn options carry a fresh challenge; show that one was issued rather than its value. */
function summarise(path, body) {
  if (body && typeof body === 'object' && body.challenge && /\/options$/.test(path)) {
    return { challenge: '<fresh one-time challenge issued>', rpId: body.rp?.id ?? body.rpId, timeout: body.timeout };
  }
  return body;
}

/**
 * Low-level request: never throws on HTTP status.
 * withSession=false omits the session cookie (used to demonstrate T4).
 */
export async function request(method, path, body, { label = '', withSession = true } = {}) {
  const started = performance.now();
  let status = 0;
  let data = null;
  try {
    const res = await fetch(path, {
      method,
      credentials: withSession ? 'same-origin' : 'omit',
      headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  } catch (err) {
    data = { error: `Network error: ${err.message}` };
  }
  const entry = {
    label, method, path, status, withSession,
    body: summarise(path, data),
    ms: Math.round(performance.now() - started),
    at: new Date(),
  };
  log.unshift(entry);
  if (log.length > 40) log.pop();
  logListeners.forEach((fn) => fn());
  return { status, ok: status >= 200 && status < 300, body: data };
}

/** Throwing variant for normal UI calls. */
export async function api(method, path, body, opts) {
  const res = await request(method, path, body, opts);
  if (!res.ok) throw new ApiError(res.status, res.body);
  return res.body;
}

// ---- Toasts -------------------------------------------------------------------
export function toast(message, tone = 'info') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(tone === 'success' ? 'checkCircle' : tone === 'error' ? 'alert' : 'shield', 'icon-sm')}
    <span style="flex:1">${esc(message)}</span>
    <button type="button" aria-label="Dismiss">${icon('x', 'icon-sm')}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---- Formatting -----------------------------------------------------------------
export const initials = (name = '') =>
  name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export function formatDate(value, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', opts).format(d);
}

export function statusPill(status) {
  const tone = status >= 200 && status < 300 ? 'status-2xx' : status === 401 ? 'status-401' : status >= 400 ? 'status-4xx' : 'status-0';
  return `<span class="chip status ${tone}">HTTP ${esc(status || 'ERR')}</span>`;
}

export const spinner = (cls = 'spinner') =>
  `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="3" fill="none"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

export const GRADE_LETTERS = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E', 'F'];

// Synthetic lab accounts from data/seed.json (IDs only; no codes or emails in the UI).
export const LAB_ACCOUNTS = [
  { id: 'S001', label: 'S001 — Ama Mensah (Student)' },
  { id: 'S002', label: 'S002 — Kofi Owusu (Student)' },
  { id: 'L001', label: 'L001 — Dr. Esi Boateng (Lecturer)' },
];
