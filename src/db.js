const fs = require('node:fs');
const path = require('node:path');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

/**
 * Resets the runtime database (data/db.json) from the canonical synthetic seed (data/seed.json).
 */
function resetDatabase() {
  const seedRaw = fs.readFileSync(SEED_PATH, 'utf8');
  // Validate JSON before writing
  const parsed = JSON.parse(seedRaw);
  fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
  return parsed;
}

/**
 * Loads the runtime database, initializing from seed.json if db.json does not exist yet.
 */
function readDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return resetDatabase();
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Persists the updated database state to data/db.json.
 */
function writeDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function getUserById(userId) {
  const db = readDatabase();
  return db.users.find((u) => u.id === userId) || null;
}

function findUserByCredentialId(credentialId) {
  const db = readDatabase();
  for (const user of db.users) {
    const cred = (user.credentials || []).find((c) => c.id === credentialId);
    if (cred) {
      return { user, credential: cred };
    }
  }
  return null;
}

function saveCredentialForUser(userId, credentialRecord) {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  user.credentials = user.credentials || [];
  const existingIdx = user.credentials.findIndex((c) => c.id === credentialRecord.id);
  if (existingIdx >= 0) {
    user.credentials[existingIdx] = credentialRecord;
  } else {
    user.credentials.push(credentialRecord);
  }
  user.enrollmentUsed = true;
  writeDatabase(db);
  return credentialRecord;
}

function updateCredentialCounter(userId, credentialId, newCounter) {
  const db = readDatabase();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  const cred = (user.credentials || []).find((c) => c.id === credentialId);
  if (cred) {
    cred.counter = newCounter;
    cred.lastUsedAt = Date.now();
    writeDatabase(db);
  }
}

function getCourseById(courseId) {
  const db = readDatabase();
  return db.courses.find((c) => c.id === courseId) || null;
}

function getCoursesForLecturer(lecturerId) {
  const db = readDatabase();
  return db.courses.filter((c) => c.lecturerId === lecturerId);
}

function isLecturerAssignedToStudent(lecturerId, studentId) {
  const db = readDatabase();
  return db.courses.some(
    (c) => c.lecturerId === lecturerId && c.enrolledStudentIds.includes(studentId)
  );
}

function getStudentRecord(studentId) {
  const db = readDatabase();
  return db.studentRecords[studentId] || null;
}

function updateStudentGrade(courseId, studentId, grade, score, updatedBy) {
  const db = readDatabase();
  const record = db.studentRecords[studentId];
  if (!record) return null;
  const course = db.courses.find((c) => c.id === courseId);
  if (!course) return null;

  const existingGrade = record.grades.find((g) => g.courseId === courseId);
  const updatedAt = new Date().toISOString();
  if (existingGrade) {
    existingGrade.grade = grade;
    existingGrade.score = Number(score);
    existingGrade.updatedBy = updatedBy;
    existingGrade.updatedAt = updatedAt;
  } else {
    record.grades.push({
      courseId,
      courseTitle: course.title,
      grade,
      score: Number(score),
      updatedBy,
      updatedAt,
    });
  }
  writeDatabase(db);
  return record;
}

module.exports = {
  SEED_PATH,
  DB_PATH,
  resetDatabase,
  readDatabase,
  writeDatabase,
  getUserById,
  findUserByCredentialId,
  saveCredentialForUser,
  updateCredentialCounter,
  getCourseById,
  getCoursesForLecturer,
  isLecturerAssignedToStudent,
  getStudentRecord,
  updateStudentGrade,
};
