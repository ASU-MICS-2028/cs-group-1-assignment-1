// Browser half of the WebAuthn ceremonies, using the native API
// (PublicKeyCredential.parse*OptionsFromJSON + credential.toJSON(), polyfilled
// by webauthn-polyfills). The server issues every challenge and verifies every
// response; nothing here decides whether a user is authenticated.
import { ApiError, request } from './core.js';

let lastAssertion = null; // the most recent genuine sign-in assertion, kept in memory for the T3 replay demo
export const getLastAssertion = () => lastAssertion;

let conditionalController = null;
function abortConditional() {
  if (conditionalController) conditionalController.abort();
  conditionalController = null;
}

export const passkeysSupported = () => Boolean(window.PublicKeyCredential) && window.isSecureContext;

export async function capabilities() {
  if (!window.PublicKeyCredential) return null;
  try {
    return await PublicKeyCredential.getClientCapabilities();
  } catch {
    return {};
  }
}

export function friendlyError(err) {
  switch (err?.name) {
    case 'NotAllowedError': return 'The passkey prompt was cancelled or timed out.';
    case 'InvalidStateError': return 'This authenticator already holds a passkey for this account.';
    case 'SecurityError': return 'Passkeys need a secure context. Open the portal at http://localhost:3000.';
    case 'NotSupportedError': return 'This browser or authenticator does not support passkeys.';
    default: return err?.message || 'Something went wrong with the passkey.';
  }
}

async function signalUnknown(rpId, credentialId) {
  if (rpId && credentialId && PublicKeyCredential.signalUnknownCredential) {
    try { await PublicKeyCredential.signalUnknownCredential({ rpId, credentialId }); } catch { /* best effort */ }
  }
}

/**
 * T1: register a passkey. Either a one-time enrollment code (first passkey) or
 * an existing session for the same account (additional passkey) is required by the server.
 */
export async function registerPasskey({ userId, enrollmentCode, rpId }) {
  abortConditional();
  const opt = await request('POST', '/auth/register/options', { userId, enrollmentCode }, { label: 'T1 Options' });
  if (!opt.ok) throw new ApiError(opt.status, opt.body);

  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(opt.body);
  const credential = await navigator.credentials.create({ publicKey });
  const encoded = credential.toJSON();

  const verify = await request('POST', '/auth/register/verify', encoded, { label: 'T1 Verify' });
  if (!verify.ok) {
    await signalUnknown(rpId, encoded.id);
    throw new ApiError(verify.status, verify.body);
  }
  return verify.body;
}

async function finishSignIn(credential, label, rpId) {
  const encoded = credential.toJSON();
  const verify = await request('POST', '/auth/login/verify', encoded, { label });
  if (!verify.ok) {
    if (verify.status === 404) await signalUnknown(rpId, encoded.id);
    throw new ApiError(verify.status, verify.body);
  }
  lastAssertion = encoded;
  return verify.body.user;
}

/** T2: explicit button sign-in with a fresh server challenge. */
export async function signIn(userId, rpId) {
  abortConditional();
  const opt = await request('POST', '/auth/login/options', userId ? { userId } : {}, { label: 'T2 Options' });
  if (!opt.ok) throw new ApiError(opt.status, opt.body);
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(opt.body);
  const credential = await navigator.credentials.get({ publicKey });
  return finishSignIn(credential, 'T2 Verify', rpId);
}

/** Passkey autofill on the ID field (conditional mediation), when the browser supports it. */
export async function startConditionalSignIn(rpId, onSignedIn) {
  const caps = await capabilities();
  if (!caps || caps.conditionalGet !== true) return;
  abortConditional();
  conditionalController = new AbortController();
  const { signal } = conditionalController;
  try {
    const opt = await request('POST', '/auth/login/options', {}, { label: 'T2 Autofill Options' });
    if (!opt.ok || signal.aborted) return;
    const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(opt.body);
    const credential = await navigator.credentials.get({ publicKey, signal, mediation: 'conditional' });
    const user = await finishSignIn(credential, 'T2 Autofill Verify', rpId);
    onSignedIn(user);
  } catch (err) {
    if (!['AbortError', 'NotAllowedError'].includes(err?.name) && !(err instanceof ApiError)) {
      console.error('Conditional sign-in failed:', err);
    }
  }
}

export function stopConditionalSignIn() {
  abortConditional();
}
