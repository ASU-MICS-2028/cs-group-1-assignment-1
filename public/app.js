import 'webauthn-polyfills';

const ENROLLMENT_CODES = {
  S001: 'ENROLL-S001-8492',
  S002: 'ENROLL-S002-3174',
  L001: 'ENROLL-L001-6059',
};

let rpId = 'localhost';
let autofillAbortController = new AbortController();

const sessionStatusPill = document.getElementById('session-status-pill');
const logoutBtn = document.getElementById('logout-btn');
const accountsTbody = document.getElementById('accounts-tbody');
const regUserSelect = document.getElementById('reg-user-id');
const regEnrollmentInput = document.getElementById('reg-enrollment-code');
const loginUserInput = document.getElementById('login-user-id');
const registerForm = document.getElementById('register-form');
const signinForm = document.getElementById('signin-form');
const createPasskeyBtn = document.getElementById('create-passkey-btn');
const capabilityBanner = document.getElementById('passkey-capability-banner');
const recordViewer = document.getElementById('record-viewer');
const auditLogList = document.getElementById('audit-log-list');
const gradeUpdateForm = document.getElementById('grade-update-form');
const resetDbBtn = document.getElementById('reset-db-btn');
const clearLogBtn = document.getElementById('clear-log-btn');

function appendLog(method, route, status, payload, label = '') {
  const item = document.createElement('div');
  const isOk = status >= 200 && status < 300;
  item.className = `log-item ${isOk ? 'ok' : 'denied'}`;

  const meta = document.createElement('div');
  meta.className = 'log-meta';
  meta.innerHTML = `
    <span>${label ? `[${label}] ` : ''}${method} ${route}</span>
    <span>HTTP ${status}</span>
  `;

  const body = document.createElement('pre');
  body.className = 'log-body';
  body.textContent =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

  item.appendChild(meta);
  item.appendChild(body);
  auditLogList.prepend(item);
}

async function refreshOverviewAndSession() {
  const [overviewRes, sessionRes] = await Promise.all([
    fetch('/api/accounts-overview'),
    fetch('/auth/session'),
  ]);
  const overview = await overviewRes.json();
  const sessionData = await sessionRes.json();

  rpId = overview.rpId || 'localhost';

  // Render seeded accounts table
  accountsTbody.innerHTML = '';
  for (const acc of overview.accounts) {
    const tr = document.createElement('tr');
    const code = ENROLLMENT_CODES[acc.id] || 'N/A';
    tr.innerHTML = `
      <td><strong>${acc.id}</strong></td>
      <td>${acc.name} <span class="muted-text">(${acc.role})</span></td>
      <td><code>${code}</code> ${acc.enrollmentUsed ? '(Consumed)' : '(Active)'}</td>
      <td>${acc.credentialCount} registered</td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" data-fill-user="${acc.id}">
          Select ${acc.id}
        </button>
      </td>
    `;
    accountsTbody.appendChild(tr);
  }

  // Update session status banner
  if (sessionData.authenticated && sessionData.user) {
    const u = sessionData.user;
    sessionStatusPill.textContent = `Signed in: ${u.id} — ${u.name} (${u.role.toUpperCase()})`;
    sessionStatusPill.className = 'status-pill authenticated';
    logoutBtn.classList.remove('hidden');
  } else {
    sessionStatusPill.textContent = 'Unauthenticated Visitor (No Session)';
    sessionStatusPill.className = 'status-pill unauthenticated';
    logoutBtn.classList.add('hidden');
  }
}

// ============================================================================
// Passkey Capabilities & Conditional Mediation (modern-web-guidance)
// ============================================================================

async function checkPasskeyCapabilities() {
  if (!window.PublicKeyCredential) {
    capabilityBanner.textContent =
      'WebAuthn PublicKeyCredential API is not supported in this browser context.';
    createPasskeyBtn.disabled = true;
    return;
  }

  const capabilities = await PublicKeyCredential.getClientCapabilities();
  const hasPlatform =
    capabilities.passkeyPlatformAuthenticator ??
    capabilities.userVerifyingPlatformAuthenticator ??
    true;
  const hasConditional = Boolean(capabilities.conditionalGet);

  if (!hasPlatform && !hasConditional) {
    createPasskeyBtn.disabled = true;
    capabilityBanner.textContent =
      'Platform passkey authenticator not detected. Enable Chrome DevTools Virtual Authenticator or platform biometrics.';
    return;
  }

  capabilityBanner.textContent = `WebAuthn Ready (RP ID: ${rpId}, Secure Context: ${window.isSecureContext}, Conditional UI: ${hasConditional ? 'Supported' : 'Standard'})`;
}

async function initializeConditionalAutofill() {
  if (!window.PublicKeyCredential) return;
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    if (capabilities.conditionalGet === true) {
      const optRes = await fetch('/auth/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!optRes.ok) return;
      const loginOptionsJSON = await optRes.json();
      const publicKey =
        PublicKeyCredential.parseRequestOptionsFromJSON(loginOptionsJSON);

      const credential = await navigator.credentials.get({
        publicKey,
        signal: autofillAbortController.signal,
        mediation: 'conditional',
      });

      const encoded = credential.toJSON();
      const verifyRes = await fetch('/auth/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encoded),
      });
      const verifyBody = await verifyRes.json();
      appendLog('POST', '/auth/login/verify', verifyRes.status, verifyBody, 'T2 Autofill');

      if (!verifyRes.ok && verifyRes.status === 404) {
        if (PublicKeyCredential.signalUnknownCredential) {
          await PublicKeyCredential.signalUnknownCredential({
            rpId,
            credentialId: encoded.id,
          });
        }
      } else if (verifyRes.ok) {
        await refreshOverviewAndSession();
      }
    }
  } catch (err) {
    if (['NotAllowedError', 'AbortError'].includes(err.name)) {
      return;
    }
    console.error('Unexpected conditional get error:', err);
  }
}

// ============================================================================
// T1: Passkey Registration Flow
// ============================================================================

async function registerPasskey(isPromotion = false) {
  // Abort any active conditional get prompt before starting registration
  autofillAbortController.abort();
  autofillAbortController = new AbortController();

  const userId = regUserSelect.value;
  const enrollmentCode = regEnrollmentInput.value.trim();

  const optRes = await fetch('/auth/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, enrollmentCode, promotion: isPromotion }),
  });
  const creationOptionsJSON = await optRes.json();
  appendLog('POST', '/auth/register/options', optRes.status, creationOptionsJSON, 'T1 Options');

  if (!optRes.ok) {
    return;
  }

  const publicKey =
    PublicKeyCredential.parseCreationOptionsFromJSON(creationOptionsJSON);

  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (err) {
    if (err.name === 'InvalidStateError') {
      appendLog('CLIENT', 'navigator.credentials.create', 409, {
        error: 'A passkey already exists for this account on this authenticator.',
      });
    } else if (err.name === 'SecurityError') {
      appendLog('CLIENT', 'navigator.credentials.create', 400, {
        error: 'Configuration RP ID or Secure Context error.',
      });
    } else if (err.name === 'NotAllowedError') {
      appendLog('CLIENT', 'navigator.credentials.create', 499, {
        error: 'User cancelled the passkey creation dialog.',
      });
    } else if (err.name === 'AbortError') {
      console.log('The creation operation has been aborted.');
    }
    return;
  }

  // Segregated server verification try/catch with Signal API fallback
  const encodedResponse = credential.toJSON();
  try {
    const verifyRes = await fetch('/auth/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodedResponse),
    });
    const verifyData = await verifyRes.json();
    appendLog('POST', '/auth/register/verify', verifyRes.status, verifyData, 'T1 Verify');

    if (!verifyRes.ok) {
      if (PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId,
          credentialId: encodedResponse.id,
        });
      }
      return;
    }

    await refreshOverviewAndSession();
  } catch (serverErr) {
    console.error('Server verification network failure:', serverErr);
    if (PublicKeyCredential.signalUnknownCredential) {
      await PublicKeyCredential.signalUnknownCredential({
        rpId,
        credentialId: encodedResponse.id,
      });
    }
  }
}

// ============================================================================
// T2: Explicit Button Passkey Authentication Flow
// ============================================================================

async function triggerButtonAuthentication() {
  // Abort any pending Conditional Get call to prevent passkey prompt collisions
  autofillAbortController.abort();
  autofillAbortController = new AbortController();

  const userId = loginUserInput.value.trim();

  const optRes = await fetch('/auth/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userId ? { userId } : {}),
  });
  const loginOptionsJSON = await optRes.json();
  appendLog('POST', '/auth/login/options', optRes.status, loginOptionsJSON, 'T2 Options');

  if (!optRes.ok) {
    return;
  }

  const publicKey =
    PublicKeyCredential.parseRequestOptionsFromJSON(loginOptionsJSON);

  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey,
      signal: autofillAbortController.signal,
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      appendLog('CLIENT', 'navigator.credentials.get', 499, {
        error: 'User cancelled passkey login prompt.',
      });
    } else if (err.name === 'AbortError') {
      console.log('The authentication operation was aborted.');
    }
    initializeConditionalAutofill();
    return;
  }

  // Segregated verification try/catch (HTTP 404 trigger for Signal API)
  const encoded = credential.toJSON();
  try {
    const verifyRes = await fetch('/auth/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encoded),
    });
    const verifyData = await verifyRes.json();
    appendLog('POST', '/auth/login/verify', verifyRes.status, verifyData, 'T2 Verify');

    if (!verifyRes.ok && verifyRes.status === 404) {
      if (PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId,
          credentialId: encoded.id,
        });
      }
      return;
    }

    if (verifyRes.ok) {
      await refreshOverviewAndSession();
    }
  } catch (serverErr) {
    console.error('Verification request error:', serverErr);
  }
}

// ============================================================================
// Event Listeners & Direct Endpoint Probes (T3–T8)
// ============================================================================

regUserSelect.addEventListener('change', () => {
  const uid = regUserSelect.value;
  regEnrollmentInput.value = ENROLLMENT_CODES[uid] || '';
  loginUserInput.value = uid;
});

accountsTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fill-user]');
  if (!btn) return;
  const uid = btn.getAttribute('data-fill-user');
  regUserSelect.value = uid;
  regEnrollmentInput.value = ENROLLMENT_CODES[uid] || '';
  loginUserInput.value = uid;
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await registerPasskey(false);
});

signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await triggerButtonAuthentication();
});

logoutBtn.addEventListener('click', async () => {
  const res = await fetch('/logout', { method: 'POST' });
  const data = await res.json();
  appendLog('POST', '/logout', res.status, data, 'Logout');
  recordViewer.textContent = 'Session terminated. Subsequent protected requests will return HTTP 401.';
  await refreshOverviewAndSession();
});

resetDbBtn.addEventListener('click', async () => {
  const res = await fetch('/api/dev/reset', { method: 'POST' });
  const data = await res.json();
  appendLog('POST', '/api/dev/reset', res.status, data, 'Reset Seed');
  recordViewer.textContent = 'Database reset to initial seed state (data/seed.json).';
  await refreshOverviewAndSession();
});

clearLogBtn.addEventListener('click', () => {
  auditLogList.innerHTML = '';
});

document.querySelectorAll('[data-probe]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const action = btn.getAttribute('data-probe');

    if (action === 'read-s001') {
      const res = await fetch('/students/S001');
      const data = await res.json();
      appendLog('GET', '/students/S001', res.status, data, 'T4/T5 Probe');
      recordViewer.textContent = JSON.stringify(data, null, 2);
    } else if (action === 'read-s002') {
      const res = await fetch('/students/S002');
      const data = await res.json();
      appendLog('GET', '/students/S002', res.status, data, 'T6 Probe');
      recordViewer.textContent = JSON.stringify(data, null, 2);
    } else if (action === 'read-c101') {
      const res = await fetch('/courses/C101');
      const data = await res.json();
      appendLog('GET', '/courses/C101', res.status, data, 'Roster Probe');
      recordViewer.textContent = JSON.stringify(data, null, 2);
    } else if (action === 'tamper-login') {
      // Issue a valid challenge for S001, then submit a forged/tampered signature payload (T3)
      await fetch('/auth/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'S001' }),
      });
      const forgedPayload = {
        id: 'tampered-or-forged-credential-id',
        rawId: 'tampered-or-forged-credential-id',
        type: 'public-key',
        response: {
          clientDataJSON: btoa(
            JSON.stringify({
              type: 'webauthn.get',
              challenge: 'forged-challenge-value',
              origin: window.location.origin,
            })
          ),
          authenticatorData: 'AAAA',
          signature: 'deadbeef',
        },
      };
      const res = await fetch('/auth/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgedPayload),
      });
      const data = await res.json();
      appendLog('POST', '/auth/login/verify', res.status, data, 'T3 Tampered Auth');
      recordViewer.textContent = JSON.stringify(data, null, 2);
    }
  });
});

gradeUpdateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const courseId = document.getElementById('grade-course-id').value.trim();
  const studentId = document.getElementById('grade-student-id').value;
  const grade = document.getElementById('grade-letter').value;
  const score = Number(document.getElementById('grade-score').value);

  const route = `/courses/${encodeURIComponent(courseId)}/grades/${encodeURIComponent(studentId)}`;
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade, score }),
  });
  const data = await res.json();
  appendLog('POST', route, res.status, data, res.ok ? 'T8 Allowed' : 'T7 Denied');
  recordViewer.textContent = JSON.stringify(data, null, 2);
});

window.addEventListener('DOMContentLoaded', async () => {
  await refreshOverviewAndSession();
  await checkPasskeyCapabilities();
  await initializeConditionalAutofill();
});
