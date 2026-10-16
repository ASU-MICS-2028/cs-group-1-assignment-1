// Security Lab: direct API requests the normal UI never offers (T3–T8).
// Every result shown here is the server's decision, not the interface's.
import { GRADE_LETTERS, clearLog, esc, formatDate, getLog, onLogChange, request, statusPill, toast } from '../core.js';
import { icon } from '../icons.js';
import { getLastAssertion } from '../passkeys.js';

function expectFor(probe, user) {
  const role = user?.role ?? 'anonymous';
  return probe.expect[role] ?? probe.expect.default;
}

function probesFor(user) {
  return [
    {
      key: 'read-s001', test: 'T4 / T5', title: 'Request S001 Record (T4 / T5)',
      method: 'GET', path: '/students/S001',
      expect: { anonymous: 401, student: user?.id === 'S001' ? 200 : 403, lecturer: 200 },
    },
    {
      key: 'read-s001-nocookie', test: 'T4', title: 'Request S001 Record without the session cookie',
      method: 'GET', path: '/students/S001', withSession: false,
      note: 'Same request, but the browser omits the cookie. Works even while signed in.',
      expect: { default: 401 },
    },
    {
      key: 'read-s002', test: 'T6', title: 'Request S002 Record (T6 ID Tamper)',
      method: 'GET', path: '/students/S002',
      expect: { anonymous: 401, student: user?.id === 'S002' ? 200 : 403, lecturer: 200 },
    },
    {
      key: 'read-c101', test: 'Roster', title: 'Load C101 Roster',
      method: 'GET', path: '/courses/C101',
      expect: { anonymous: 401, student: 403, lecturer: 200 },
    },
    {
      key: 'tamper-login', test: 'T3', title: 'Submit Tampered/Replayed Login (T3)',
      method: 'POST', path: '/auth/login/verify', special: 'tamper',
      note: 'Replays your last real sign-in assertion against a fresh challenge, then sends it again with one signature byte flipped. Sign in in this tab first to capture one.',
      expect: { default: 401 },
    },
  ];
}

/** T3: replay the captured genuine assertion, then a tampered copy. Neither may create a session. */
async function runTamper() {
  const captured = getLastAssertion();
  if (!captured) {
    // No genuine assertion in memory: fall back to a forged credential.
    await request('POST', '/auth/login/options', { userId: 'S001' }, { label: 'T3 Options' });
    const forged = {
      id: 'tampered-or-forged-credential-id', rawId: 'tampered-or-forged-credential-id', type: 'public-key',
      response: {
        clientDataJSON: btoa(JSON.stringify({ type: 'webauthn.get', challenge: 'forged-challenge-value', origin: location.origin })),
        authenticatorData: 'AAAA', signature: 'deadbeef',
      },
    };
    return request('POST', '/auth/login/verify', forged, { label: 'T3 Forged credential' });
  }

  await request('POST', '/auth/login/options', {}, { label: 'T3 Options' });
  const replay = await request('POST', '/auth/login/verify', captured, { label: 'T3 Replayed assertion' });

  const tampered = JSON.parse(JSON.stringify(captured));
  const sig = tampered.response.signature;
  const last = sig.slice(-1);
  tampered.response.signature = sig.slice(0, -1) + (last === 'A' ? 'B' : 'A');
  await request('POST', '/auth/login/options', {}, { label: 'T3 Options' });
  const forged = await request('POST', '/auth/login/verify', tampered, { label: 'T3 Tampered signature' });
  return forged.status >= 400 && replay.status >= 400 ? forged : replay;
}

function probeCard(p, user, result) {
  const expected = expectFor(p, user);
  const matched = result && result.status === expected;
  return `
  <article class="card probe" data-key="${p.key}">
    <div class="probe-top"><span class="chip chip-solid">${esc(p.test)}</span><span>expect ${esc(expected)}</span></div>
    <h3>${esc(p.title)}</h3>
    <code class="req">${esc(p.method)} ${esc(p.path)}${p.withSession === false ? '  (no cookie)' : ''}</code>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
    <div class="probe-foot">
      <span class="probe-result">${result
        ? `${statusPill(result.status)} ${icon(matched ? 'checkCircle' : 'alert', `icon ${matched ? 'match' : 'mismatch'}`)}`
        : 'not run'}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-probe="${p.key}">${icon('send', 'icon-sm')} Send</button>
    </div>
  </article>`;
}

function logHtml() {
  const items = getLog();
  if (!items.length) return '<p class="empty">Send a request (or sign in) to see the raw server responses here.</p>';
  return items.slice(0, 12).map((h) => `
    <div class="card log-item">
      <div class="log-meta">
        ${statusPill(h.status)}
        <code>${esc(h.method)} ${esc(h.path)}</code>
        ${h.label ? `<span class="chip chip-maroon">${esc(h.label)}</span>` : ''}
        ${h.withSession === false ? '<span class="chip chip-gold">no session cookie</span>' : ''}
        <span class="time">${esc(h.ms)} ms · ${esc(formatDate(h.at, { timeStyle: 'medium' }))}</span>
      </div>
      <pre class="log-body">${esc(JSON.stringify(h.body, null, 2))}</pre>
    </div>`).join('');
}

export function renderLab(root, ctx) {
  const { user } = ctx;
  const probes = probesFor(user);
  const results = {};

  root.innerHTML = `
  <div class="wrap">
    <section class="lab-hero">
      <p class="eyebrow">${user ? `Signed in as ${esc(user.id)} (${esc(user.role)})` : 'Not signed in: unauthenticated visitor'}</p>
      <h2>Call the API directly</h2>
      <p>These requests bypass the normal interface, the way an attacker would with curl or DevTools.
        Every decision comes from <code>requireAuth</code>, <code>authorizeStudentRecordRead</code> and
        <code>authorizeGradeUpdate</code> in <code>src/middleware/authz.js</code>.</p>
    </section>
    <section class="probes" id="probes"></section>

    <section class="section">
      <div class="section-head"><h2>Update Course Grade: <code>POST /courses/:courseId/grades/:studentId</code> (T7 / T8)</h2></div>
      <form class="card grade-probe" id="grade-update-form">
        <div><label class="label" for="grade-course-id">Course ID</label><input class="input" id="grade-course-id" value="C101" required maxlength="16" /></div>
        <div><label class="label" for="grade-student-id">Student ID</label>
          <select class="select" id="grade-student-id"><option>S001</option><option>S002</option></select></div>
        <div><label class="label" for="grade-letter">Letter grade</label>
          <select class="select" id="grade-letter">${GRADE_LETTERS.map((l) => `<option>${l}</option>`).join('')}</select></div>
        <div><label class="label" for="grade-score">Score (0–100)</label><input class="input" id="grade-score" type="number" min="0" max="100" value="95" required /></div>
        <button type="submit" class="btn btn-primary">${icon('send', 'icon-sm')} Submit Grade Update Request</button>
        <p class="note muted" style="grid-column:1/-1;font-size:.75rem">
          Expected: ${user?.role === 'lecturer' ? '200 for C101 (your course); 403 for any other course.' : user ? '403. Students can never update grades, and the grade stays unchanged.' : '401 without a session.'}
        </p>
      </form>
    </section>

    <section class="section">
      <div class="section-head"><h2>Request log (latest 12, this tab only)</h2><button type="button" class="link" id="clear-log-btn" style="font-size:.875rem">Clear</button></div>
      <div class="log" id="audit-log-list"></div>
    </section>
  </div>`;

  const probesHost = root.querySelector('#probes');
  const logHost = root.querySelector('#audit-log-list');
  const drawProbes = () => { probesHost.innerHTML = probes.map((p) => probeCard(p, user, results[p.key])).join(''); };
  const drawLog = () => { logHost.innerHTML = logHtml(); };
  drawProbes();
  drawLog();

  probesHost.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-probe]');
    if (!btn) return;
    const probe = probes.find((p) => p.key === btn.dataset.probe);
    btn.disabled = true;
    results[probe.key] = probe.special === 'tamper'
      ? await runTamper()
      : await request(probe.method, probe.path, undefined, { label: `${probe.test} Probe`, withSession: probe.withSession !== false });
    drawProbes();
    if (probe.special === 'tamper') {
      const session = await request('GET', '/auth/session', undefined, { label: 'T3 Session check' });
      const stillSameUser = (session.body?.user?.id ?? null) === (user?.id ?? null);
      toast(stillSameUser ? 'Tampered/replayed login rejected. No new session was created.' : 'Unexpected: session changed!', stillSameUser ? 'success' : 'error');
    }
  });

  root.querySelector('#grade-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const courseId = root.querySelector('#grade-course-id').value.trim();
    const studentId = root.querySelector('#grade-student-id').value;
    const grade = root.querySelector('#grade-letter').value;
    const score = Number(root.querySelector('#grade-score').value);
    const res = await request('POST', `/courses/${encodeURIComponent(courseId)}/grades/${encodeURIComponent(studentId)}`,
      { grade, score }, { label: user?.role === 'lecturer' ? 'T8 Grade update' : 'T7 Grade update' });
    toast(`HTTP ${res.status}: ${res.ok ? 'grade updated' : res.body?.error ?? 'request refused'}`, res.ok ? 'success' : 'error');
  });

  root.querySelector('#clear-log-btn').addEventListener('click', clearLog);
  return onLogChange(drawLog);
}
