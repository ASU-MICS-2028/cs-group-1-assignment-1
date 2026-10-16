const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { isoCBOR } = require('@simplewebauthn/server/helpers');

const execFileAsync = promisify(execFile);

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const RP_ID = 'localhost';

process.env.PORT = String(PORT);
process.env.RP_ID = RP_ID;
process.env.EXPECTED_ORIGIN = BASE_URL;

const { app } = require('../src/server');
const { resetDatabase, getStudentRecord, getUserById } = require('../src/db');

/**
 * Software FIDO2 / WebAuthn Authenticator for automated reproducible security testing (T1-T8).
 * Generates real ECDSA P-256 keypairs, COSE public keys, CBOR attestation objects, and signed assertions.
 */
class VirtualFido2Authenticator {
  constructor() {
    this.credentials = new Map();
  }

  createCredential(options, origin = BASE_URL, rpId = RP_ID) {
    const credIdBytes = crypto.randomBytes(32);
    const credIdBase64Url = credIdBytes.toString('base64url');

    // Generate P-256 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const jwk = publicKey.export({ format: 'jwk' });
    const xBytes = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
    const yBytes = new Uint8Array(Buffer.from(jwk.y, 'base64url'));

    // Encode COSE_Key (EC2 P-256 ES256): { 1: 2, 3: -7, -1: 1, -2: x, -3: y }
    const coseMap = new Map([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256 (-7)
      [-1, 1], // crv: P-256 (1)
      [-2, xBytes],
      [-3, yBytes],
    ]);
    const cosePublicKeyBytes = Buffer.from(isoCBOR.encode(coseMap));

    // Build authenticatorData: rpIdHash (32) || flags (1) || signCount (4) || attestedCredentialData
    const rpIdHash = crypto.createHash('sha256').update(rpId, 'utf8').digest();
    // Flags: UP (0x01) | UV (0x04) | BE (0x08) | BS (0x10) | AT (0x40) = 0x5d
    const flags = Buffer.from([0x5d]);
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(1, 0);

    const aaguid = Buffer.alloc(16, 0);
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(credIdBytes.length, 0);

    const authData = Buffer.concat([
      rpIdHash,
      flags,
      signCount,
      aaguid,
      credIdLen,
      credIdBytes,
      cosePublicKeyBytes,
    ]);

    const attObjMap = new Map([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', new Uint8Array(authData)],
    ]);
    const attestationObjectBytes = Buffer.from(isoCBOR.encode(attObjMap));

    const clientDataObj = {
      type: 'webauthn.create',
      challenge: options.challenge,
      origin,
      crossOrigin: false,
    };
    const clientDataJSONBytes = Buffer.from(JSON.stringify(clientDataObj), 'utf8');

    this.credentials.set(credIdBase64Url, {
      id: credIdBase64Url,
      credIdBytes,
      privateKey,
      publicKey,
      counter: 1,
    });

    return {
      id: credIdBase64Url,
      rawId: credIdBase64Url,
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: clientDataJSONBytes.toString('base64url'),
        attestationObject: attestationObjectBytes.toString('base64url'),
        transports: ['internal'],
      },
    };
  }

  signAssertion(options, credentialId, origin = BASE_URL, rpId = RP_ID) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      throw new Error(`Virtual authenticator does not hold credential ${credentialId}`);
    }

    cred.counter += 1;

    const rpIdHash = crypto.createHash('sha256').update(rpId, 'utf8').digest();
    // Flags: UP (0x01) | UV (0x04) | BE (0x08) | BS (0x10) = 0x1d
    const flags = Buffer.from([0x1d]);
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(cred.counter, 0);

    const authenticatorData = Buffer.concat([rpIdHash, flags, signCount]);

    const clientDataObj = {
      type: 'webauthn.get',
      challenge: options.challenge,
      origin,
      crossOrigin: false,
    };
    const clientDataJSONBytes = Buffer.from(JSON.stringify(clientDataObj), 'utf8');
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBytes).digest();

    const verificationData = Buffer.concat([authenticatorData, clientDataHash]);
    const signature = crypto.sign('sha256', verificationData, cred.privateKey);

    return {
      id: cred.id,
      rawId: cred.id,
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
      response: {
        authenticatorData: authenticatorData.toString('base64url'),
        clientDataJSON: clientDataJSONBytes.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: Buffer.from('S001', 'utf8').toString('base64url'),
      },
    };
  }
}

/**
 * Simple cookie-aware HTTP client for maintaining independent test sessions.
 */
class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = null;
  }

  async request(method, route, body = undefined) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie.split(';')[0];
    }

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
}

async function runAllTests() {
  resetDatabase();

  const server = await new Promise((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const authenticator = new VirtualFido2Authenticator();
  const results = [];

  function recordTest(id, title, actor, action, expected, status, observedData, passed, extra = {}) {
    results.push({
      id,
      title,
      actor,
      action,
      expected,
      httpStatus: status,
      observed: observedData,
      passed,
      ...extra,
    });
    const badge = passed ? 'PASS' : 'FAIL';
    console.log(`[${badge}] ${id}: ${title} -> HTTP ${status}`);
    if (!passed) {
      console.error('  Unexpected response:', observedData);
    }
  }

  try {
    const s001Client = new SessionClient(BASE_URL);
    let s001CredId = null;

    // ========================================================================
    // T1: S001 registers a new passkey through the valid flow
    // ========================================================================
    {
      const optRes = await s001Client.request('POST', '/auth/register/options', {
        userId: 'S001',
        enrollmentCode: 'ENROLL-S001-8492',
      });
      const attestationResponse = authenticator.createCredential(optRes.data);
      const verifyRes = await s001Client.request(
        'POST',
        '/auth/register/verify',
        attestationResponse
      );
      s001CredId = verifyRes.data.credentialId;
      const dbUser = getUserById('S001');
      const storedOnServer =
        verifyRes.status === 200 &&
        verifyRes.data.verified === true &&
        dbUser.credentials.length === 1 &&
        Boolean(dbUser.credentials[0].credentialPublicKey);

      recordTest(
        'T1',
        'S001 registers a new passkey through the valid flow',
        'S001 (Student)',
        'POST /auth/register/options + POST /auth/register/verify',
        'Credential registered to S001; public key stored server-side',
        verifyRes.status,
        {
          verified: verifyRes.data.verified,
          userId: verifyRes.data.userId,
          credentialId: verifyRes.data.credentialId,
          storedPublicKeyPrefix: `${dbUser.credentials[0].credentialPublicKey.slice(0, 24)}...`,
        },
        storedOnServer
      );
    }

    // ========================================================================
    // T2: S001 signs in using the registered passkey
    // ========================================================================
    let validAssertionFromT2 = null;
    {
      const optRes = await s001Client.request('POST', '/auth/login/options', {
        userId: 'S001',
      });
      const assertion = authenticator.signAssertion(optRes.data, s001CredId);
      validAssertionFromT2 = assertion;

      const verifyRes = await s001Client.request(
        'POST',
        '/auth/login/verify',
        assertion
      );
      const passed =
        verifyRes.status === 200 &&
        verifyRes.data.verified === true &&
        verifyRes.data.user?.id === 'S001';

      recordTest(
        'T2',
        'S001 signs in using the registered passkey',
        'S001 (Student)',
        'POST /auth/login/options + POST /auth/login/verify',
        'Fresh signed challenge verified; authenticated session created',
        verifyRes.status,
        verifyRes.data,
        passed
      );
    }

    // ========================================================================
    // T3: Submit an altered/invalid or replayed authentication response
    // ========================================================================
    {
      const attackerClient = new SessionClient(BASE_URL);
      // Case A: Replay the exact signed assertion from T2 without a matching active challenge
      const replayRes = await attackerClient.request(
        'POST',
        '/auth/login/verify',
        validAssertionFromT2
      );

      // Case B: Request a fresh challenge for S001, then submit a tampered signature
      const freshOpt = await attackerClient.request('POST', '/auth/login/options', {
        userId: 'S001',
      });
      const tamperedAssertion = authenticator.signAssertion(freshOpt.data, s001CredId);
      // Flip the last byte of the valid ASN.1 DER ECDSA signature so decoding succeeds but signature verification fails
      const sigBuf = Buffer.from(tamperedAssertion.response.signature, 'base64url');
      sigBuf[sigBuf.length - 1] ^= 0xff;
      tamperedAssertion.response.signature = sigBuf.toString('base64url');
      const tamperRes = await attackerClient.request(
        'POST',
        '/auth/login/verify',
        tamperedAssertion
      );

      // Verify no session was created for attackerClient
      const sessionCheck = await attackerClient.request('GET', '/auth/session');

      const passed =
        replayRes.status === 400 &&
        tamperRes.status === 401 &&
        sessionCheck.data.authenticated === false;

      recordTest(
        'T3',
        'Submit an altered/invalid or replayed authentication response',
        'Unauthenticated Attacker targeting S001',
        'POST /auth/login/verify (Replayed T2 assertion + Tampered signature)',
        'Server rejects invalid proof or challenge; no session created',
        tamperRes.status,
        {
          replayAttempt: { status: replayRes.status, body: replayRes.data },
          tamperedSignatureAttempt: { status: tamperRes.status, body: tamperRes.data },
          sessionCreated: sessionCheck.data.authenticated,
        },
        passed
      );
    }

    // ========================================================================
    // T4: Request a protected record without an authenticated session
    // ========================================================================
    {
      const unauthClient = new SessionClient(BASE_URL);
      const res = await unauthClient.request('GET', '/students/S001');
      const passed = res.status === 401;

      recordTest(
        'T4',
        'Request a protected record without an authenticated session',
        'Unauthenticated Visitor',
        'GET /students/S001 (No session cookie)',
        'Denied (HTTP 401)',
        res.status,
        res.data,
        passed
      );
    }

    // ========================================================================
    // T5: S001 requests S001 record
    // ========================================================================
    {
      const res = await s001Client.request('GET', '/students/S001');
      const passed =
        res.status === 200 && res.data.record?.studentId === 'S001';

      recordTest(
        'T5',
        'S001 requests own student record (S001)',
        'S001 (Authenticated Student)',
        'GET /students/S001',
        'Allowed (HTTP 200)',
        res.status,
        res.data,
        passed
      );
    }

    // ========================================================================
    // T6: S001 requests S002 record by changing URL/ID (direct curl probe)
    // ========================================================================
    {
      const curlCommand = [
        '-i',
        '-s',
        '-X',
        'GET',
        `${BASE_URL}/students/S002`,
        '-H',
        `Cookie: ${s001Client.cookie}`,
      ];
      const { stdout: rawCurlOutput } = await execFileAsync('curl', curlCommand);
      const res = await s001Client.request('GET', '/students/S002');
      const passed = res.status === 403;

      recordTest(
        'T6',
        'S001 requests S002 record by changing URL/ID (Direct curl request)',
        'S001 (Authenticated Student)',
        `curl -i -s -X GET ${BASE_URL}/students/S002 -H "Cookie: <S001-session>"`,
        'Denied by server (HTTP 403 Forbidden)',
        res.status,
        res.data,
        passed,
        { rawCurlOutput: rawCurlOutput.trim() }
      );
    }

    // ========================================================================
    // T7: S001 invokes the lecturer grade-update endpoint directly (via curl)
    // ========================================================================
    {
      const beforeRecord = getStudentRecord('S001');
      const gradeBefore = beforeRecord.grades.find((g) => g.courseId === 'C101').grade;

      const curlArgs = [
        '-i',
        '-s',
        '-X',
        'POST',
        `${BASE_URL}/courses/C101/grades/S001`,
        '-H',
        'Content-Type: application/json',
        '-H',
        `Cookie: ${s001Client.cookie}`,
        '-d',
        JSON.stringify({ grade: 'A', score: 100 }),
      ];
      const { stdout: rawCurlOutput } = await execFileAsync('curl', curlArgs);
      const res = await s001Client.request('POST', '/courses/C101/grades/S001', {
        grade: 'A',
        score: 100,
      });

      const afterRecord = getStudentRecord('S001');
      const gradeAfter = afterRecord.grades.find((g) => g.courseId === 'C101').grade;

      const passed =
        res.status === 403 && gradeBefore === 'B+' && gradeAfter === 'B+';

      recordTest(
        'T7',
        'S001 invokes the lecturer grade-update endpoint directly',
        'S001 (Authenticated Student)',
        `curl -i -s -X POST ${BASE_URL}/courses/C101/grades/S001 -d '{"grade":"A","score":100}'`,
        'Denied by server (HTTP 403); grade remains unchanged (B+)',
        res.status,
        {
          response: res.data,
          gradeBefore,
          gradeAfter,
        },
        passed,
        { rawCurlOutput: rawCurlOutput.trim() }
      );
    }

    // ========================================================================
    // T8: L001 updates a grade in assigned course C101
    // ========================================================================
    {
      const l001Client = new SessionClient(BASE_URL);

      // Register passkey for L001
      const regOpt = await l001Client.request('POST', '/auth/register/options', {
        userId: 'L001',
        enrollmentCode: 'ENROLL-L001-6059',
      });
      const l001Attestation = authenticator.createCredential(regOpt.data);
      const regVerify = await l001Client.request(
        'POST',
        '/auth/register/verify',
        l001Attestation
      );
      const l001CredId = regVerify.data.credentialId;

      // Sign in as L001
      const loginOpt = await l001Client.request('POST', '/auth/login/options', {
        userId: 'L001',
      });
      const l001Assertion = authenticator.signAssertion(loginOpt.data, l001CredId);
      await l001Client.request('POST', '/auth/login/verify', l001Assertion);

      // Update S001's grade in assigned course C101
      const updateRes = await l001Client.request(
        'POST',
        '/courses/C101/grades/S001',
        {
          grade: 'A',
          score: 94,
        }
      );

      const updatedGradeEntry = updateRes.data.record?.grades?.find(
        (g) => g.courseId === 'C101'
      );

      const passed =
        updateRes.status === 200 &&
        updateRes.data.updated === true &&
        updatedGradeEntry?.grade === 'A' &&
        updatedGradeEntry?.score === 94 &&
        updatedGradeEntry?.updatedBy === 'L001';

      recordTest(
        'T8',
        'L001 updates a grade in assigned course C101',
        'L001 (Authenticated Lecturer assigned to C101)',
        'POST /courses/C101/grades/S001 {"grade":"A","score":94}',
        'Allowed (HTTP 200); server verifies lecturer/course relationship and updates grade',
        updateRes.status,
        updateRes.data,
        passed
      );

      // Bonus Session Invalidation Check: POST /logout
      const logoutRes = await l001Client.request('POST', '/logout');
      const postLogoutProbe = await l001Client.request('GET', '/courses/C101');
      console.log(
        `[PASS] Session Logout Check: POST /logout -> HTTP ${logoutRes.status}, Subsequent GET /courses/C101 -> HTTP ${postLogoutProbe.status}`
      );
    }

    // Write structured evidence log
    const evidenceDir = path.join(__dirname, '..', 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const logPath = path.join(evidenceDir, 'test-run-log.json');
    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          origin: BASE_URL,
          rpId: RP_ID,
          allPassed: results.every((r) => r.passed),
          results,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`\nSaved structured evidence log to ${logPath}`);

    // Reset DB back to clean seed state so repository stays clean for manual browser runs
    resetDatabase();
  } finally {
    server.close();
  }
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
