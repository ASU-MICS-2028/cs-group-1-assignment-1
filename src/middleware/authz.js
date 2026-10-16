const { getCourseById, isLecturerAssignedToStudent } = require('../db');

/**
 * Safe audit logger that records security decisions without ever logging secrets,
 * challenges, session cookies, private keys, or raw WebAuthn payloads.
 */
function auditLog(event, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  console.log(`[AUDIT] ${JSON.stringify(entry)}`);
}

/**
 * Authentication Middleware (T4):
 * Rejects any request to a protected endpoint that lacks a valid server-side session.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    auditLog('AUTHN_DENIED', {
      method: req.method,
      path: req.originalUrl,
      reason: 'Missing or invalidated session',
    });
    return res.status(401).json({
      error: 'Authentication required: No valid session.',
    });
  }
  return next();
}

/**
 * Authorization Middleware for GET /students/:studentId (T5, T6):
 * - Students can read ONLY their own record (req.session.user.id === req.params.studentId).
 * - Lecturers can read records ONLY for students enrolled in their assigned course(s).
 */
function authorizeStudentRecordRead(req, res, next) {
  const actor = req.session.user;
  const targetStudentId = req.params.studentId;

  if (actor.role === 'student') {
    if (actor.id !== targetStudentId) {
      auditLog('AUTHZ_DENIED', {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'READ_STUDENT_RECORD',
        targetStudentId,
        reason: 'Student attempted to access another student record (ownership violation)',
      });
      return res.status(403).json({
        error: 'Forbidden: Students may only view their own academic record.',
      });
    }
    auditLog('AUTHZ_ALLOWED', {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'READ_STUDENT_RECORD',
      targetStudentId,
    });
    return next();
  }

  if (actor.role === 'lecturer') {
    if (!isLecturerAssignedToStudent(actor.id, targetStudentId)) {
      auditLog('AUTHZ_DENIED', {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'READ_STUDENT_RECORD',
        targetStudentId,
        reason: 'Lecturer is not assigned to any course with this student',
      });
      return res.status(403).json({
        error: 'Forbidden: You may only view records for students in your assigned courses.',
      });
    }
    auditLog('AUTHZ_ALLOWED', {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'READ_STUDENT_RECORD',
      targetStudentId,
    });
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Unrecognized role.' });
}

/**
 * Authorization Middleware for POST /courses/:courseId/grades/:studentId (T7, T8):
 * - Strictly requires role === 'lecturer'. Students are never allowed (T7).
 * - Requires the lecturer to be assigned to :courseId (course.lecturerId === actor.id) (T8).
 * - Requires :studentId to be enrolled in :courseId.
 */
function authorizeGradeUpdate(req, res, next) {
  const actor = req.session.user;
  const { courseId, studentId } = req.params;

  if (actor.role !== 'lecturer') {
    auditLog('AUTHZ_DENIED', {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'UPDATE_COURSE_GRADE',
      courseId,
      targetStudentId: studentId,
      reason: 'Non-lecturer attempted to invoke grade-update endpoint',
    });
    return res.status(403).json({
      error: 'Forbidden: Only lecturers assigned to the course may update grades.',
    });
  }

  const course = getCourseById(courseId);
  if (!course) {
    return res.status(404).json({ error: `Course ${courseId} not found.` });
  }

  if (course.lecturerId !== actor.id) {
    auditLog('AUTHZ_DENIED', {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'UPDATE_COURSE_GRADE',
      courseId,
      targetStudentId: studentId,
      reason: `Lecturer ${actor.id} is not assigned to course ${courseId}`,
    });
    return res.status(403).json({
      error: `Forbidden: Lecturer ${actor.id} is not assigned to course ${courseId}.`,
    });
  }

  if (!course.enrolledStudentIds.includes(studentId)) {
    return res.status(404).json({
      error: `Student ${studentId} is not enrolled in course ${courseId}.`,
    });
  }

  auditLog('AUTHZ_ALLOWED', {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_COURSE_GRADE',
    courseId,
    targetStudentId: studentId,
  });
  return next();
}

module.exports = {
  auditLog,
  requireAuth,
  authorizeStudentRecordRead,
  authorizeGradeUpdate,
};
