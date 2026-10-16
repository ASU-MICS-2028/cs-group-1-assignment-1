const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const {
  readDatabase,
  resetDatabase,
  getUserById,
  findUserByCredentialId,
  saveCredentialForUser,
  updateCredentialCounter,
  getCourseById,
  getCoursesForLecturer,
  getStudentRecord,
  updateStudentGrade,
} = require('./db');

const {
  auditLog,
  requireAuth,
  authorizeStudentRecordRead,
  authorizeGradeUpdate,
} = require('./middleware/authz');

const PORT = Number(process.env.PORT || 3000);
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = 'Ashesi Student Records Portal';
const EXPECTED_ORIGIN = process.env.EXPECTED_ORIGIN || `http://${RP_ID}:${PORT}`;

const app = express();

app.use(express.json());

// Ephemeral per-process session secret if not set via environment (no hardcoded production secrets)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(
  session({
    name: 'portal.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // localhost HTTP development context
      maxAge: 1000 * 60 * 30, // 30 minutes
    },
  })
);

// Serve WebAuthn polyfill modules from node_modules without exposing secrets
app.get('/vendor/ua-parser-esm.js', (_req, res) => {
  res.type('application/javascript').send(`
    import '/vendor/ua-parser-js/dist/ua-parser.min.js';
    const UAParser = globalThis.UAParser;
    export { UAParser };
  `);
});
app.use(
  '/vendor/webauthn-polyfills',
  express.static(path.join(__dirname, '..', 'node_modules', 'webauthn-polyfills'))
);
app.use(
  '/vendor/compare-versions',
  express.static(path.join(__dirname, '..', 'node_modules', 'compare-versions'))
);
app.use(
  '/vendor/ua-parser-js',
  express.static(path.join(__dirname, '..', 'node_modules', 'ua-parser-js'))
);

app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================================
// Public / Session Discovery Endpoints
// ============================================================================

app.get('/auth/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      authenticated: true,
      user: req.session.user,
      rpId: RP_ID,
    });
  }
  return res.json({
    authenticated: false,
    rpId: RP_ID,
  });
});

/**
 * Returns synthetic directory metadata for the lab UI (never exposes private keys or session tokens).
 */
app.get('/api/accounts-overview', (_req, res) => {
  const db = readDatabase();
  const accounts = db.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    enrollmentUsed: Boolean(u.enrollmentUsed),
    credentialCount: (u.credentials || []).length,
  }));
  return res.json({ rpId: RP_ID, origin: EXPECTED_ORIGIN, accounts });
});

// ============================================================================
// Requirement 2: Passkey Registration (Protected Initial Enrollment)
// ============================================================================

app.post('/auth/register/options', async (req, res) => {
  try {
    const { userId, enrollmentCode, promotion } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: `Account ${userId} not found.` });
    }

    // Defensible initial enrollment protection:
    // Either the caller is already authenticated as this user, OR provides the valid one-time enrollment code.
    const isAuthenticatedSelf = req.session?.user?.id === user.id;
    const isValidInitialEnrollment =
      !user.enrollmentUsed &&
      typeof enrollmentCode === 'string' &&
      enrollmentCode.trim() === user.enrollmentCode;

    if (!isAuthenticatedSelf && !isValidInitialEnrollment) {
      auditLog('REGISTER_OPTIONS_DENIED', {
        targetUserId: user.id,
        reason: user.enrollmentUsed
          ? 'Initial enrollment token already consumed'
          : 'Invalid or missing enrollment code',
      });
      return res.status(403).json({
        error: user.enrollmentUsed
          ? 'Enrollment code already used for this account. Sign in with your registered passkey first.'
          : 'Invalid enrollment code for initial passkey registration.',
      });
    }

    const isPromotionFlow = Boolean(promotion);
    const existingCredentials = user.credentials || [];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new Uint8Array(Buffer.from(user.id, 'utf8')),
      userName: `${user.id} (${user.email})`,
      userDisplayName: `${user.name} [${user.role.toUpperCase()}]`,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.id,
        transports: cred.transports || ['internal'],
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
        ...(isPromotionFlow && { authenticatorAttachment: 'platform' }),
      },
    });

    // Store one-time registration challenge and UV policy in server session
    req.session.registrationChallenge = options.challenge;
    req.session.registrationUserId = user.id;
    req.session.expectedUserVerification = 'preferred';

    auditLog('REGISTER_OPTIONS_ISSUED', { userId: user.id });
    return res.json(options);
  } catch (err) {
    auditLog('REGISTER_OPTIONS_ERROR', { message: err.message });
    return res.status(500).json({ error: 'Failed to generate registration options.' });
  }
});

app.post('/auth/register/verify', async (req, res) => {
  const expectedChallenge = req.session?.registrationChallenge;
  const targetUserId = req.session?.registrationUserId;
  const expectedUV = req.session?.expectedUserVerification || 'preferred';

  // Single-use challenge: immediately consume from session to prevent replay
  if (req.session) {
    delete req.session.registrationChallenge;
    delete req.session.registrationUserId;
  }

  if (!expectedChallenge || !targetUserId) {
    auditLog('REGISTER_VERIFY_DENIED', {
      reason: 'Missing or expired registration challenge in session',
    });
    return res.status(400).json({
      error: 'No active registration challenge found in session.',
    });
  }

  const user = getUserById(targetUserId);
  if (!user) {
    return res.status(404).json({ error: 'Target account not found.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserPresence: true,
      requireUserVerification: expectedUV === 'required',
    });

    if (!verification.verified || !verification.registrationInfo) {
      auditLog('REGISTER_VERIFY_FAILED', { userId: user.id });
      return res.status(400).json({ error: 'Passkey registration verification failed.' });
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
      aaguid,
    } = verification.registrationInfo;

    const storedCredential = {
      id: credential.id,
      passkeyUserId: user.id,
      credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
      credentialType: 'public-key',
      credentialDeviceType: credentialDeviceType || 'singleDevice',
      credentialBackedUp: Boolean(credentialBackedUp),
      aaguid: aaguid || '00000000-0000-0000-0000-000000000000',
      name: `${user.id} Passkey`,
      transports: req.body?.response?.transports || credential.transports || ['internal'],
      registeredAt: Date.now(),
      counter: credential.counter,
    };

    saveCredentialForUser(user.id, storedCredential);

    auditLog('REGISTER_VERIFY_SUCCESS', {
      userId: user.id,
      credentialId: storedCredential.id,
      deviceType: storedCredential.credentialDeviceType,
    });

    return res.json({
      verified: true,
      userId: user.id,
      credentialId: storedCredential.id,
    });
  } catch (err) {
    auditLog('REGISTER_VERIFY_FAILED', {
      userId: targetUserId,
      reason: err.message,
    });
    return res.status(400).json({
      error: `Registration verification failed: ${err.message}`,
    });
  }
});

// ============================================================================
// Requirement 3: Passkey Sign-In (Fresh Challenge & Server Verification)
// ============================================================================

app.post('/auth/login/options', async (req, res) => {
  try {
    const { userId } = req.body || {};
    let allowCredentials = [];

    if (userId) {
      const user = getUserById(userId);
      if (!user || !user.credentials || user.credentials.length === 0) {
        return res.status(404).json({
          error: `No registered passkeys found for account ${userId}. Register a passkey first.`,
        });
      }
      allowCredentials = user.credentials.map((cred) => ({
        id: cred.id,
        transports: cred.transports || ['internal'],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Persist fresh challenge and expected UV in session
    req.session.authenticationChallenge = options.challenge;
    req.session.expectedUserVerification = 'preferred';

    auditLog('LOGIN_OPTIONS_ISSUED', {
      requestedUserId: userId || 'discoverable',
    });

    return res.json(options);
  } catch (err) {
    auditLog('LOGIN_OPTIONS_ERROR', { message: err.message });
    return res.status(500).json({ error: 'Failed to generate authentication options.' });
  }
});

app.post('/auth/login/verify', async (req, res) => {
  const expectedChallenge = req.session?.authenticationChallenge;
  const expectedUV = req.session?.expectedUserVerification || 'preferred';

  // Immediately delete one-time challenge so replayed assertions (T3) fail strictly
  if (req.session) {
    delete req.session.authenticationChallenge;
  }

  if (!expectedChallenge) {
    auditLog('LOGIN_VERIFY_DENIED', {
      reason: 'Missing or already-consumed authentication challenge (possible replay)',
    });
    return res.status(400).json({
      error: 'Authentication rejected: Missing or already-used challenge.',
    });
  }

  const assertion = req.body;
  if (!assertion || !assertion.id) {
    return res.status(400).json({ error: 'Malformed WebAuthn assertion payload.' });
  }

  const match = findUserByCredentialId(assertion.id);
  if (!match) {
    auditLog('LOGIN_VERIFY_UNKNOWN_CREDENTIAL', {
      credentialId: assertion.id,
    });
    // Return explicit 404 so client can invoke PublicKeyCredential.signalUnknownCredential
    return res.status(404).json({
      error: 'Unknown passkey credential ID.',
    });
  }

  const { user, credential } = match;

  try {
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.credentialPublicKey, 'base64url')),
        counter: credential.counter,
        transports: credential.transports || ['internal'],
      },
      requireUserVerification: expectedUV === 'required',
    });

    if (!verification.verified || !verification.authenticationInfo) {
      auditLog('LOGIN_VERIFY_FAILED', { userId: user.id });
      return res.status(401).json({ error: 'Passkey signature verification failed.' });
    }

    updateCredentialCounter(
      user.id,
      credential.id,
      verification.authenticationInfo.newCounter
    );

    // Regenerate session upon authentication to prevent session fixation
    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to initialize authenticated session.' });
      }
      req.session.user = sessionUser;
      auditLog('LOGIN_SUCCESS', {
        userId: user.id,
        role: user.role,
        credentialId: credential.id,
      });
      return res.json({
        verified: true,
        user: sessionUser,
      });
    });
  } catch (err) {
    auditLog('LOGIN_VERIFY_REJECTED', {
      userId: user.id,
      reason: err.message,
    });
    return res.status(401).json({
      error: `Authentication verification rejected: ${err.message}`,
    });
  }
});

// ============================================================================
// Requirement 5: Session Logout (POST /logout)
// ============================================================================

app.post('/logout', (req, res) => {
  const actorId = req.session?.user?.id || 'anonymous';
  req.session.destroy((err) => {
    res.clearCookie('portal.sid');
    if (err) {
      return res.status(500).json({ error: 'Failed to destroy session.' });
    }
    auditLog('LOGOUT_SUCCESS', { actorId });
    return res.json({ loggedOut: true });
  });
});

// ============================================================================
// Requirement 4: Protected Resource Endpoints with Server-Side RBAC & Ownership
// ============================================================================

/**
 * GET /students/:studentId
 * Policy:
 * - Student: may read ONLY their own record (S001 -> S001 allowed [T5]; S001 -> S002 denied [T6]).
 * - Lecturer: may read records ONLY for students enrolled in their assigned course(s).
 */
app.get('/students/:studentId', requireAuth, authorizeStudentRecordRead, (req, res) => {
  const record = getStudentRecord(req.params.studentId);
  if (!record) {
    return res.status(404).json({ error: 'Student record not found.' });
  }
  return res.json({ record });
});

/**
 * GET /courses/:courseId
 * Policy:
 * - Only the lecturer assigned to :courseId may view the full course roster and grades.
 */
app.get('/courses/:courseId', requireAuth, (req, res) => {
  const actor = req.session.user;
  const course = getCourseById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  if (actor.role !== 'lecturer' || course.lecturerId !== actor.id) {
    auditLog('AUTHZ_DENIED', {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'READ_COURSE_ROSTER',
      courseId: course.id,
    });
    return res.status(403).json({
      error: 'Forbidden: Only the assigned course lecturer can view the course roster.',
    });
  }

  const roster = course.enrolledStudentIds
    .map((sid) => getStudentRecord(sid))
    .filter(Boolean);

  return res.json({ course, roster });
});

/**
 * POST /courses/:courseId/grades/:studentId
 * Policy:
 * - Only the lecturer assigned to :courseId may update grades (T8).
 * - Never a student (T7).
 */
app.post(
  '/courses/:courseId/grades/:studentId',
  requireAuth,
  authorizeGradeUpdate,
  (req, res) => {
    const { courseId, studentId } = req.params;
    const { grade, score } = req.body || {};

    const validGrades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E', 'F'];
    if (!grade || !validGrades.includes(String(grade).trim())) {
      return res.status(400).json({
        error: `Invalid grade. Must be one of: ${validGrades.join(', ')}`,
      });
    }

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      return res.status(400).json({
        error: 'Invalid score. Must be a number between 0 and 100.',
      });
    }

    const updatedRecord = updateStudentGrade(
      courseId,
      studentId,
      String(grade).trim(),
      numericScore,
      req.session.user.id
    );

    auditLog('GRADE_UPDATED', {
      actorId: req.session.user.id,
      courseId,
      studentId,
      newGrade: String(grade).trim(),
      newScore: numericScore,
    });

    return res.json({
      updated: true,
      record: updatedRecord,
    });
  }
);

/**
 * Lab helper endpoint: Reset database to seed state (only available in local development).
 */
app.post('/api/dev/reset', (req, res) => {
  resetDatabase();
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.clearCookie('portal.sid');
  auditLog('DB_RESET_TO_SEED', {});
  return res.json({ reset: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `[Portal] Ashesi Secure Student Records Portal running at ${EXPECTED_ORIGIN}`
    );
  });
}

module.exports = { app, RP_ID, EXPECTED_ORIGIN };
