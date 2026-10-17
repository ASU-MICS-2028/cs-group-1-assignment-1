// Sign-in and first-passkey enrollment (split layout with illustration).
import { LAB_ACCOUNTS, esc, spinner, toast } from '../core.js';
import { icon } from '../icons.js';
import { studyScene } from '../illustrations.js';
import {
  PROMPT_TIMEOUT_SECONDS, cancelPasskeyPrompt, capabilities, friendlyError, passkeysSupported,
  registerPasskey, signIn, startConditionalSignIn, stopConditionalSignIn,
} from '../passkeys.js';
import { brandMark } from './shared.js';

const METHODS = [
  ['fingerprint', 'Fingerprint'],
  ['face', 'Face unlock'],
  ['usb', 'Security key'],
];

// Passkeys are bound to the RP ID, so 127.0.0.1 or a LAN IP fails even when localhost works.
function hostBanner(rpId) {
  if (!rpId || location.hostname === rpId) return '';
  const url = new URL(location.href);
  url.hostname = rpId;
  return `<p role="alert" class="alert">${icon('alert', 'icon-sm')} <span>Passkeys for this portal only work at
    <a class="link" href="${esc(url.href)}">${esc(url.origin)}</a>. You opened it at ${esc(location.host)}.</span></p>`;
}

/** Shows what to do while the browser prompt is open, with a way out if none appeared. */
function showWaitingHint(btn) {
  const hint = document.createElement('p');
  hint.className = 'fine waiting-hint';
  hint.setAttribute('role', 'status');
  hint.innerHTML = `Your browser should now show a passkey prompt. Nothing appeared?
    <button type="button" class="link" data-cancel-prompt>Cancel</button>
    (it gives up on its own after ${PROMPT_TIMEOUT_SECONDS} s).`;
  hint.querySelector('[data-cancel-prompt]').addEventListener('click', cancelPasskeyPrompt);
  btn.after(hint);
  return () => hint.remove();
}

function shell(inner, rpId) {
  return `
  <div class="auth-page">
    <div class="auth-frame">
      <div class="auth-art">
        ${studyScene()}
        <div class="auth-art-note">
          <b>Phishing-resistant sign-in</b>
          <p>Your passkey is bound to this site's origin and relying-party ID. There is no password to steal and nothing to type into a fake page.</p>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          ${brandMark()}
          ${hostBanner(rpId)}
          <div class="auth-body">${inner}</div>
          <p class="auth-foot">
            Testing access control? <a class="link" href="#/lab">Open the Security Lab</a>
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

function tabs(active) {
  return `
  <div class="auth-tabs" role="tablist">
    <button type="button" role="tab" aria-selected="${active === 'login'}" data-go="#/login">Sign in</button>
    <button type="button" role="tab" aria-selected="${active === 'enroll'}" data-go="#/enroll">Set up passkey</button>
  </div>`;
}

function errorBox(message) {
  return message
    ? `<p role="alert" class="alert">${icon('alert', 'icon-sm')} <span>${esc(message)}</span></p>`
    : '';
}

function bindTabs(root, navigate) {
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.go)));
}

export function renderLogin(root, ctx) {
  const prefill = sessionStorage.getItem('portal.lastId') || '';
  root.innerHTML = shell(`
    <h1 class="auth-title">Welcome<br/>back</h1>
    <p class="auth-sub">Sign in to the Student Records Portal with your passkey.</p>
    ${tabs('login')}
    <form class="auth-form" id="signin-form" novalidate>
      <label class="sr-only" for="login-user-id">Account ID</label>
      <input class="input" id="login-user-id" name="username" maxlength="16"
        placeholder="Account ID (optional, e.g. S001)" autocomplete="username webauthn"
        value="${esc(prefill)}" data-testid="username-field" />
      <div id="signin-error"></div>
      <button type="submit" class="btn btn-primary btn-lg" id="signin-passkey-btn" ${passkeysSupported() ? '' : 'disabled'}>
        ${icon('key')} <span>Sign In with Passkey</span>
      </button>
      ${passkeysSupported() ? '' : '<p class="fine" style="margin:0">Passkeys need a secure context. Open this page at http://localhost:3000 in a current browser.</p>'}
    </form>
    <p class="works-with">works with</p>
    <ul class="methods">${METHODS.map(([i, l]) => `<li title="${l}">${icon(i, 'icon', 2)}<span class="sr-only">${l}</span></li>`).join('')}</ul>
    <p class="fine" id="rp-line">Synthetic lab data only. Relying party: <b>${esc(ctx.rpId)}</b>.</p>
  `, ctx.rpId);
  bindTabs(root, ctx.navigate);

  const form = root.querySelector('#signin-form');
  const input = root.querySelector('#login-user-id');
  const btn = root.querySelector('#signin-passkey-btn');
  const errorHost = root.querySelector('#signin-error');
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

  const signedIn = (user) => {
    toast(`Welcome back, ${user.name}. Passkey verified by the server.`, 'success');
    ctx.onSignedIn(user);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorHost.innerHTML = '';
    btn.disabled = true;
    btn.innerHTML = `${spinner()} <span>Waiting for your passkey…</span>`;
    const hideHint = showWaitingHint(btn);
    try {
      const user = await signIn(input.value.trim(), ctx.rpId);
      hideHint();
      signedIn(user);
    } catch (err) {
      hideHint();
      errorHost.innerHTML = errorBox(err.status ? err.message : friendlyError(err));
      btn.disabled = false;
      btn.innerHTML = `${icon('key')} <span>Sign In with Passkey</span>`;
      startConditionalSignIn(ctx.rpId, signedIn);
    }
  });

  capabilities().then((caps) => {
    if (caps && caps.conditionalGet) {
      root.querySelector('#rp-line').insertAdjacentHTML('beforeend', ' Passkey autofill is available in the ID field.');
    }
  });
  startConditionalSignIn(ctx.rpId, signedIn);
  return () => stopConditionalSignIn();
}

export function renderEnroll(root, ctx) {
  const form = () => `
    <h1 class="auth-title">Set up<br/>passkey</h1>
    <p class="auth-sub">Use the one-time enrollment code issued by the Registry to link a passkey to your account.</p>
    ${tabs('enroll')}
    <form class="auth-form" id="register-form">
      <label class="sr-only" for="reg-user-id">Account ID</label>
      <select class="select" id="reg-user-id" name="userId" required>
        ${LAB_ACCOUNTS.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}
      </select>
      <label class="sr-only" for="reg-enrollment-code">One-time enrollment code</label>
      <input class="input mono" id="reg-enrollment-code" name="enrollmentCode" required maxlength="40"
        placeholder="One-time enrollment code (ENROLL-…)" autocomplete="one-time-code" spellcheck="false" />
      <div id="register-error"></div>
      <button type="submit" class="btn btn-primary btn-lg" id="create-passkey-btn" ${passkeysSupported() ? '' : 'disabled'}>
        ${icon('fingerprint')} <span>Register Passkey</span>
      </button>
    </form>
    <p class="fine">Each code works once and only for its own account. After it is used, add further passkeys from inside the portal while signed in.</p>`;

  root.innerHTML = shell(form(), ctx.rpId);
  bindTabs(root, ctx.navigate);

  root.querySelector('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = root.querySelector('#create-passkey-btn');
    const errorHost = root.querySelector('#register-error');
    const userId = root.querySelector('#reg-user-id').value;
    const enrollmentCode = root.querySelector('#reg-enrollment-code').value.trim();
    errorHost.innerHTML = '';
    btn.disabled = true;
    btn.innerHTML = `${spinner()} <span>Follow your browser prompt…</span>`;
    const hideHint = showWaitingHint(btn);
    try {
      const result = await registerPasskey({ userId, enrollmentCode, rpId: ctx.rpId });
      hideHint();
      sessionStorage.setItem('portal.lastId', result.userId);
      root.querySelector('.auth-body').innerHTML = `
        <div style="text-align:center">
          <div class="success-mark">${icon('check', 'icon-lg', 2.6)}</div>
          <h1 class="auth-title" style="font-size:2.25rem;margin-top:2rem">Passkey registered</h1>
          <p class="auth-sub">The server verified your authenticator and stored its public key for
            <b style="color:var(--ink)">${esc(result.userId)}</b>. The enrollment code is now used up.</p>
          <p class="fine">Credential ID <code>${esc(String(result.credentialId).slice(0, 18))}…</code></p>
          <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:2rem" data-go="#/login">
            ${icon('key')} <span>Sign in now</span>
          </button>
        </div>`;
      bindTabs(root, ctx.navigate);
    } catch (err) {
      hideHint();
      errorHost.innerHTML = errorBox(err.status ? err.message : friendlyError(err));
      btn.disabled = false;
      btn.innerHTML = `${icon('fingerprint')} <span>Register Passkey</span>`;
    }
  });
}
