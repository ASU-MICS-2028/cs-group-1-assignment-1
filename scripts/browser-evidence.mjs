// Real-browser evidence run for T1–T8 (optional; not part of `npm test`).
//
// Drives Chromium through the portal UI with a CDP *virtual authenticator*
// (the same mechanism as Chrome DevTools > WebAuthn), so the real browser
// WebAuthn ceremony (navigator.credentials.create/get) is exercised.
//
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/browser-evidence.mjs
//
// It resets data/db.json, starts the server itself and captures its [AUDIT]
// output, then writes:
//   evidence/screenshots/*.png        one labelled screenshot per test
//   evidence/browser-run-log.json     every HTTP request the page made, per test step
//   evidence/browser-run-audit.log    the server's stdout during the run
// The virtual authenticator's private keys are never written out.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'evidence', 'screenshots');
const PORT = Number(process.env.PORT || 3000);
const BASE = `http://localhost:${PORT}`;
mkdirSync(SHOTS, { recursive: true });

// ---- server -----------------------------------------------------------------
await new Promise((resolve, reject) => {
  const reset = spawn(process.execPath, ['src/reset-db.js'], { cwd: ROOT, stdio: 'ignore' });
  reset.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('reset failed'))));
});
const serverOut = [];
const server = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } });
server.stdout.on('data', (d) => serverOut.push(...String(d).split('\n').filter(Boolean)));
server.stderr.on('data', (d) => serverOut.push(...String(d).split('\n').filter(Boolean)));
for (let i = 0; i < 50 && !serverOut.some((l) => l.includes('running at')); i++) await new Promise((r) => setTimeout(r, 100));
if (!serverOut.some((l) => l.includes('running at'))) {
  server.kill();
  throw new Error(`Server did not start (is port ${PORT} already in use?):\n${serverOut.join('\n')}`);
}

// ---- browser ----------------------------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const requests = [];
const results = [];
let step = 'setup';

async function newUser(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Use the explicit "Sign In with Passkey" button rather than autofill, so T2 is the button flow.
  await context.addInitScript(() => {
    const orig = PublicKeyCredential.getClientCapabilities?.bind(PublicKeyCredential);
    PublicKeyCredential.getClientCapabilities = async () => ({ ...(orig ? await orig() : {}), conditionalGet: false });
  });
  const page = await context.newPage();
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin !== BASE || /\.(js|css|svg|png)$/.test(url.pathname) || url.pathname.startsWith('/vendor')) return;
    requests.push({ step, actor: label, method: res.request().method(), path: url.pathname, status: res.status() });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { page, cdp, authenticatorId };
}

// Full-page screenshots, capped in height so long request logs stay readable in the report.
async function shot(page, name, maxHeight = 1700) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true, clip: { x: 0, y: 0, width: 1440, height: Math.min(height, maxHeight) } });
}

/** Visible caption so a screenshot of a raw API response says which URL and user it came from. */
async function annotate(page, text) {
  await page.evaluate((t) => {
    const bar = document.createElement('div');
    bar.textContent = t;
    bar.setAttribute('style', 'font:600 14px system-ui;background:#7a1f2e;color:#fff;padding:10px 16px;margin:28px 0 12px');
    document.body.prepend(bar);
  }, text);
}
const record = (id, actor, expected, observed, passed) => {
  results.push({ id, actor, expected, observed, passed });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id} ${actor}: ${observed}`);
};
const lastStatus = (path, method = 'GET') => [...requests].reverse().find((r) => r.path === path && r.method === method)?.status;

async function enrollAndSignIn(u, id, code, t1Shot) {
  step = `T1 ${id}`;
  await u.page.goto(`${BASE}/#/enroll`);
  await u.page.selectOption('#reg-user-id', id);
  await u.page.fill('#reg-enrollment-code', code);
  await u.page.click('#create-passkey-btn');
  await u.page.getByText('Passkey registered').waitFor();
  if (t1Shot) await shot(u.page, t1Shot);
  const { credentials } = await u.cdp.send('WebAuthn.getCredentials', { authenticatorId: u.authenticatorId });
  const creds = credentials.map((c) => ({ credentialId: c.credentialId, rpId: c.rpId, isResidentCredential: c.isResidentCredential, signCount: c.signCount }));

  step = `T2 ${id}`;
  await u.page.getByRole('button', { name: /Sign in now/ }).click();
  await u.page.fill('#login-user-id', id);
  await u.page.click('#signin-passkey-btn');
  await u.page.getByText('Overview').waitFor();
  await u.page.waitForTimeout(300);
  return creds;
}

try {
  // ---- S001 -----------------------------------------------------------------
  const s = await newUser('S001');
  const creds = await enrollAndSignIn(s, 'S001', 'ENROLL-S001-8492', 'T1-register');
  record('T1', 'S001', 'Credential registered; public key stored server-side',
    `POST /auth/register/verify -> ${lastStatus('/auth/register/verify', 'POST')}; authenticator holds ${creds.length} resident credential(s) for rpId "${creds[0]?.rpId}"`,
    lastStatus('/auth/register/verify', 'POST') === 200 && creds.length === 1);
  await shot(s.page, 'T2-login');
  record('T2', 'S001', 'Fresh challenge verified; session created',
    `POST /auth/login/verify -> ${lastStatus('/auth/login/verify', 'POST')}; dashboard shown for S001`,
    lastStatus('/auth/login/verify', 'POST') === 200);

  step = 'T5';
  await s.page.goto(`${BASE}/#/students/S001`);
  await s.page.getByText('Academic record').waitFor();
  await shot(s.page, 'T5-own-record');
  record('T5', 'S001', 'Allowed', `GET /students/S001 -> ${lastStatus('/students/S001')}`, lastStatus('/students/S001') === 200);

  step = 'T6';
  await s.page.goto(`${BASE}/#/students/S002`);
  await s.page.getByText('Access denied by the server').waitFor();
  await shot(s.page, 'T6-other-record-denied');
  const t6Ui = lastStatus('/students/S002');

  step = 'T3';
  await s.page.goto(`${BASE}/#/lab`);
  await s.page.waitForSelector('#probes');
  await s.page.click('[data-probe="tamper-login"]');
  await s.page.getByText(/Tampered\/replayed login rejected/).waitFor();
  await shot(s.page, 'T3-tampered-replayed');
  const t3 = requests.filter((r) => r.step === 'T3' && r.path === '/auth/login/verify').map((r) => r.status);
  const t3Session = await s.page.evaluate(async () => (await (await fetch('/auth/session')).json()).user?.id);
  // Same tab as the T2 sign-in, so the probe replays the genuine captured assertion, then a tampered copy.
  record('T3', 'S001 tab replaying/tampering', 'Rejected; no new session',
    `POST /auth/login/verify -> ${t3.join(', ')}; session still ${t3Session}`, t3.length > 0 && t3.every((x) => x >= 400) && t3Session === 'S001');

  step = 'T7';
  const before = await s.page.evaluate(async () => (await (await fetch('/students/S001')).json()).record.grades[0]);
  await s.page.selectOption('#grade-student-id', 'S001');
  await s.page.selectOption('#grade-letter', 'A');
  await s.page.fill('#grade-score', '100');
  await s.page.click('#grade-update-form button[type=submit]');
  await s.page.waitForTimeout(500);
  const after = await s.page.evaluate(async () => (await (await fetch('/students/S001')).json()).record.grades[0]);
  await shot(s.page, 'T7-grade-update-denied');
  const t7 = lastStatus('/courses/C101/grades/S001', 'POST');
  record('T7', 'S001', 'Denied; grade unchanged', `POST /courses/C101/grades/S001 -> ${t7}; grade ${before.grade}/${before.score} -> ${after.grade}/${after.score}`,
    t7 === 403 && before.grade === after.grade && before.score === after.score);

  step = 'T6';
  const direct = await s.page.goto(`${BASE}/students/S002`); // raw API URL typed into the address bar
  await annotate(s.page, `Annotation added by the evidence script: address bar = ${BASE}/students/S002, signed in as S001, response HTTP ${direct.status()}`);
  await shot(s.page, 'T6-direct-url', 300);
  const t6Direct = lastStatus('/students/S002');
  record('T6', 'S001', 'Denied (403)', `GET /students/S002 -> ${t6Ui} via UI route, ${t6Direct} via direct URL`, t6Ui === 403 && t6Direct === 403);

  step = 'Logout';
  await s.page.goto(`${BASE}/#/dashboard`);
  await s.page.getByText('Overview').waitFor();
  await s.page.click('#logout-btn');
  await s.page.waitForSelector('#signin-form');
  step = 'T4';
  await s.page.goto(`${BASE}/#/lab`);
  await s.page.waitForSelector('#probes');
  await s.page.click('[data-probe="read-s001"]');
  await s.page.waitForTimeout(400);
  await shot(s.page, 'T4-no-session');
  record('T4', 'Signed-out visitor', 'Denied (401)', `GET /students/S001 -> ${lastStatus('/students/S001')} after POST /logout -> ${lastStatus('/logout', 'POST')}`,
    lastStatus('/students/S001') === 401 && lastStatus('/logout', 'POST') === 200);

  // ---- L001 -----------------------------------------------------------------
  const l = await newUser('L001');
  await enrollAndSignIn(l, 'L001', 'ENROLL-L001-6059');

  step = 'T8';
  await l.page.goto(`${BASE}/#/courses/C101`);
  await l.page.getByText('Last change').waitFor();
  await l.page.selectOption('#letter-S001', 'A');
  await l.page.fill('#score-S001', '94');
  await l.page.click('form[data-student="S001"] button');
  await l.page.getByText(/Saved S001/).waitFor();
  await l.page.waitForTimeout(400);
  await shot(l.page, 'T8-lecturer-grade-update');
  const t8After = await l.page.evaluate(async () => (await (await fetch('/students/S001')).json()).record.grades[0]);
  record('T8', 'L001', 'Allowed; lecturer/course relationship verified',
    `POST /courses/C101/grades/S001 -> ${lastStatus('/courses/C101/grades/S001', 'POST')}; grade now ${t8After.grade}/${t8After.score} by ${t8After.updatedBy}`,
    lastStatus('/courses/C101/grades/S001', 'POST') === 200 && t8After.grade === 'A' && t8After.score === 94);

  // ---- render the captured server log as an image --------------------------
  const audit = serverOut.filter((x) => x.startsWith('[AUDIT]') || x.startsWith('[Portal]'));
  const p = l.page;
  await p.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1e1a1b;color:#f5e3e6;font:12px/1.6 ui-monospace,Menlo,monospace;padding:24px">
    <div style="color:#eac56a;font:600 14px system-ui;margin-bottom:12px">Server stdout captured during scripts/browser-evidence.mjs (node src/server.js), ${new Date().toISOString()}</div>
    ${audit.map((x) => `<div style="white-space:pre-wrap;word-break:break-all;${/DENIED|REJECTED|FAILED/.test(x) ? 'color:#ff9fae' : ''}">${x.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`).join('')}
  </body>`);
  await p.screenshot({ path: join(SHOTS, 'server-audit-log.png'), fullPage: true });

  writeFileSync(join(ROOT, 'evidence', 'browser-run-audit.log'), serverOut.join('\n') + '\n');
  writeFileSync(join(ROOT, 'evidence', 'browser-run-log.json'), JSON.stringify({
    executedAt: new Date().toISOString(),
    browser: `Chromium ${browser.version()} (Playwright) + CDP virtual authenticator (ctap2, internal, resident key, UV)`,
    origin: BASE,
    allPassed: results.every((r) => r.passed),
    results,
    virtualAuthenticatorCredentials: { S001: creds },
    requests,
  }, null, 2) + '\n');
  console.log(results.every((r) => r.passed) ? 'All browser checks passed.' : 'Some browser checks FAILED.');
} finally {
  await browser.close();
  server.kill();
}
