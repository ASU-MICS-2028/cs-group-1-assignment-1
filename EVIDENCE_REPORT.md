# ICS570 Lab 2: Secure Student Records Portal — Evidence & Security Analysis Report

**Course:** ICS570: Cybersecurity Essentials (Module 3: Identity and Access Control)  
**Application Origin / RP ID:** `http://localhost:3000` (`rpId: "localhost"`)  
**Stack:** Node.js, Express, `express-session`, `@simplewebauthn/server`, Native Browser WebAuthn API  

---

## 1. Security Test Matrix Results (T1–T8)

All tests were executed against the local portal (`npm test` -> `evidence/test-run-log.json` and interactive browser/CLI verification).

| Test | Identity / Condition | Request / Action | Expected Outcome | Observed Outcome & HTTP Status | Result |
|---|---|---|---|---|---|
| **T1** | `S001` (Student, Ama Mensah) | `POST /auth/register/options` (with one-time code `ENROLL-S001-8492`) + `POST /auth/register/verify` | Credential registered to `S001`; COSE public key stored server-side | `HTTP 200 OK` — `{ "verified": true, "userId": "S001", "credentialId": "tTSL95-GD9pr-Z6pyf0AmzJI36NcgcqFqCQ7pmT27Os" }`. Public key persisted in `data/db.json` and enrollment code marked consumed. | **PASS** |
| **T2** | `S001` (Student) | `POST /auth/login/options` + `POST /auth/login/verify` with valid P-256 assertion | Fresh signed challenge verified; authenticated session created | `HTTP 200 OK` — `{ "verified": true, "user": { "id": "S001", "role": "student" } }`. Session ID regenerated and `portal.sid` `HttpOnly` cookie issued. | **PASS** |
| **T3** | Unauthenticated attacker targeting `S001` | **(a)** Replay `T2` assertion to `POST /auth/login/verify`<br>**(b)** Submit altered signature bytes | Server rejects invalid proof or replayed challenge; no session created | **(a) Replay:** `HTTP 400 Bad Request` (`"Authentication rejected: Missing or already-used challenge."`)<br>**(b) Tampered Signature:** `HTTP 401 Unauthorized` (`"Passkey signature verification failed."`)<br>`GET /auth/session` confirms `{ "authenticated": false }`. | **PASS** |
| **T4** | Unauthenticated visitor (no session cookie) | `GET /students/S001` | Denied (`HTTP 401`) | `HTTP 401 Unauthorized` — `{ "error": "Authentication required: No valid session." }` | **PASS** |
| **T5** | `S001` (Authenticated Student) | `GET /students/S001` | Allowed (`HTTP 200`); returns `S001` record | `HTTP 200 OK` — Returns `S001` record (`courseId: "C101"`, `grade: "B+"`, `score: 84`). | **PASS** |
| **T6** | `S001` (Authenticated Student) editing URL/ID | Direct `curl` request: `GET /students/S002` with `S001` session cookie | Denied by server (`HTTP 403 Forbidden`) | `HTTP 403 Forbidden` — `{ "error": "Forbidden: Students may only view their own academic record." }` | **PASS** |
| **T7** | `S001` (Authenticated Student) calling lecturer endpoint directly | Direct `curl` request: `POST /courses/C101/grades/S001` with body `{"grade":"A","score":100}` | Denied by server (`HTTP 403 Forbidden`); grade remains unchanged | `HTTP 403 Forbidden` — `{ "error": "Forbidden: Only lecturers assigned to the course may update grades." }`. `S001` grade verified unchanged at `B+` (`84`). | **PASS** |
| **T8** | `L001` (Authenticated Lecturer assigned to `C101`) | `POST /courses/C101/grades/S001` with body `{"grade":"A","score":94}` | Allowed (`HTTP 200`); server verifies lecturer/course assignment and updates grade | `HTTP 200 OK` — `{ "updated": true }`. `S001` grade in `C101` updated to `A` (`94`) with `updatedBy: "L001"`. | **PASS** |

---

## 2. Direct Non-UI Request Evidence (`curl` Probes & Server Audit Logs)

### 2.1 Direct `curl` Probe for T6 (Horizontal Privilege Escalation Attempt)
While authenticated as `S001`, the student bypasses the UI and requests `S002`'s record directly by editing the URL path:

```http
$ curl -i -s -X GET http://localhost:3000/students/S002 -H "Cookie: portal.sid=<S001-session>"

HTTP/1.1 403 Forbidden
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 72
Date: Fri, 16 Oct 2026 18:48:15 GMT

{"error":"Forbidden: Students may only view their own academic record."}
```

### 2.2 Direct `curl` Probe for T7 (Vertical Privilege Escalation Attempt)
While authenticated as `S001`, the student directly invokes the lecturer grade-modification endpoint (which is not offered to students in a normal student workflow) to self-assign an `A` (`100`):

```http
$ curl -i -s -X POST http://localhost:3000/courses/C101/grades/S001 \
  -H "Content-Type: application/json" \
  -H "Cookie: portal.sid=<S001-session>" \
  -d '{"grade":"A","score":100}'

HTTP/1.1 403 Forbidden
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 79
Date: Fri, 16 Oct 2026 18:48:15 GMT

{"error":"Forbidden: Only lecturers assigned to the course may update grades."}
```

### 2.3 Server-Side Audit Trail (`stdout` from `npm test`)
Note that session cookies, challenges, and cryptographic keys are never written to the logs:
```json
[AUDIT] {"timestamp":"2026-10-16T18:48:15.823Z","event":"REGISTER_VERIFY_SUCCESS","userId":"S001","credentialId":"tTSL95-GD9pr-Z6pyf0AmzJI36NcgcqFqCQ7pmT27Os","deviceType":"multiDevice"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.830Z","event":"LOGIN_SUCCESS","userId":"S001","role":"student","credentialId":"tTSL95-GD9pr-Z6pyf0AmzJI36NcgcqFqCQ7pmT27Os"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.831Z","event":"LOGIN_VERIFY_DENIED","reason":"Missing or already-consumed authentication challenge (possible replay)"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.834Z","event":"LOGIN_VERIFY_FAILED","userId":"S001"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.836Z","event":"AUTHN_DENIED","method":"GET","path":"/students/S001","reason":"Missing or invalidated session"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.837Z","event":"AUTHZ_ALLOWED","actorId":"S001","actorRole":"student","action":"READ_STUDENT_RECORD","targetStudentId":"S001"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.851Z","event":"AUTHZ_DENIED","actorId":"S001","actorRole":"student","action":"READ_STUDENT_RECORD","targetStudentId":"S002","reason":"Student attempted to access another student record (ownership violation)"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.861Z","event":"AUTHZ_DENIED","actorId":"S001","actorRole":"student","action":"UPDATE_COURSE_GRADE","courseId":"C101","targetStudentId":"S001","reason":"Non-lecturer attempted to invoke grade-update endpoint"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.868Z","event":"AUTHZ_ALLOWED","actorId":"L001","actorRole":"lecturer","action":"UPDATE_COURSE_GRADE","courseId":"C101","targetStudentId":"S001"}
[AUDIT] {"timestamp":"2026-10-16T18:48:15.868Z","event":"GRADE_UPDATED","actorId":"L001","courseId":"C101","studentId":"S001","newGrade":"A","newScore":94}
```

### 2.4 Server Policy Code Responsible for Denying T6 and T7 (`src/middleware/authz.js`)
```javascript
// Enforces record ownership & course assignment on GET /students/:studentId (T5, T6)
function authorizeStudentRecordRead(req, res, next) {
  const actor = req.session.user;
  const targetStudentId = req.params.studentId;

  if (actor.role === 'student') {
    if (actor.id !== targetStudentId) {
      return res.status(403).json({
        error: 'Forbidden: Students may only view their own academic record.',
      });
    }
    return next();
  }
  if (actor.role === 'lecturer') {
    if (!isLecturerAssignedToStudent(actor.id, targetStudentId)) {
      return res.status(403).json({
        error: 'Forbidden: You may only view records for students in your assigned courses.',
      });
    }
    return next();
  }
  return res.status(403).json({ error: 'Forbidden: Unrecognized role.' });
}

// Enforces lecturer role & course assignment on POST /courses/:courseId/grades/:studentId (T7, T8)
function authorizeGradeUpdate(req, res, next) {
  const actor = req.session.user;
  const { courseId, studentId } = req.params;

  if (actor.role !== 'lecturer') {
    return res.status(403).json({
      error: 'Forbidden: Only lecturers assigned to the course may update grades.',
    });
  }
  const course = getCourseById(courseId);
  if (!course || course.lecturerId !== actor.id) {
    return res.status(403).json({
      error: `Forbidden: Lecturer ${actor.id} is not assigned to course ${courseId}.`,
    });
  }
  return next();
}
```

---

## 3. Security Interpretation (336 Words Total)

**A. Authentication vs. Authorization (124 words)**  
Passing T2 proves authentication: the server verified a fresh challenge signed by `S001`'s registered private key and bound `req.session.user` to `{ id: "S001", role: "student" }`. However, authentication only answers *who* the caller is, not *what* resources or actions they are permitted to access. Allowing T6 or T7 merely because T2 succeeded would collapse authorization into authentication, enabling any authenticated student to read peers' transcripts (horizontal privilege escalation) or overwrite course grades (vertical privilege escalation). Our server enforces this boundary on every request in `src/middleware/authz.js`: `authorizeStudentRecordRead` checks `actor.id === req.params.studentId` for students (returning HTTP 403 in T6), while `authorizeGradeUpdate` checks `actor.role === "lecturer"` and `course.lecturerId === actor.id` before any database write occurs (returning HTTP 403 in T7 and leaving `S001`'s grade unchanged at `B+`).

**B. Residual Weakness and Proportionate Mitigation (88 words)**  
A realistic residual weakness in our implementation is initial passkey enrollment and account recovery via static enrollment codes (`enrollmentCode` in `data/seed.json`). If an attacker intercepts an unused enrollment code or compromises a help-desk re-enrollment workflow, they can bind their own authenticator to the victim's account before the legitimate user enrolls. A proportionate fix is replacing static codes with short-lived (e.g., 10-minute TTL), cryptographically random one-time enrollment tokens tied to out-of-band identity verification, coupled with immediate notification and mandatory re-verification of existing sessions whenever a new passkey is added.

**C. Transfer to SLS ProSit 2 (124 words)**  
This directly mirrors the core flaw in SLS ProSit 2 (Stage 1), where Management proposes placing all company systems behind one Single Sign-On login with MFA and assuming the access problem is solved. As Amy Windahl rightly objects, strong login only proves *who* signed in—just as T2 authenticated `S001`—without governing what that identity may do afterward. In SLS, an employee who transferred from Finance to Procurement six weeks ago still retains permission to modify supplier-payment records, and the order-processing service account holds unexplained access to a Finance folder. Even if SLS upgrades every user to phishing-resistant passkeys, those excessive privileges remain exploitable unless SLS enforces least-privilege, role- and resource-scoped authorization checks (like our T6/T7 middleware) and revokes stale role assignments immediately upon job transfer.

---

## 4. Part B Addendum: Short Cryptography Follow-On (`npm run demo:crypto`)

Executed via `scripts/part-b-crypto-demo.js` (logged to `evidence/part-b-crypto-log.json`):

```text
[1] Fresh 96-bit Nonce Verification (Two encryptions of identical record):
    Encryption #1 Nonce (96-bit): 395d0368af7b839ff4b830e5
    Encryption #2 Nonce (96-bit): 950058cc97cf51143cbc8e65
    Nonces Unique?                true
    Ciphertexts Distinct?         true

[2] Authorized AES-256-GCM Decryption:
    Auth Tag (128-bit):           4630ff0797243536d3ddc99857f1399f
    Restored Matches Original?    true
    Restored Student ID & Grade:  S001 -> A

[3] Integrity & Tamper Detection Tests:
    Tampered Ciphertext Byte Rejected? true (Unsupported state or unable to authenticate data)
    Tampered Auth Tag Byte Rejected?   true (Unsupported state or unable to authenticate data)
```

### Why Nonce Uniqueness and Key Protection Matter
In AES-GCM, the 96-bit nonce initializes the counter mode keystream (`CTR`) and the Galois field polynomial authenticator (`GHASH`). Reusing a `(key, nonce)` pair across two plaintexts leaks the XOR of both plaintexts (`C1 ⊕ C2 = P1 ⊕ P2`) and allows an attacker to solve for the internal `GHASH` authentication key `H`, enabling arbitrary ciphertext forgery.

### Why AES-GCM Does Not Replace Passkey Authentication or Authorization
AES-GCM provides confidentiality and integrity for data in transit or at rest (such as an exported student transcript file), ensuring that unauthorized parties without the secret key cannot read or silently alter the exported ciphertext. However, encryption does not identify who is sitting at the browser or making an HTTP request; WebAuthn passkey authentication is required to cryptographically prove the live identity of the user (e.g., `S001` versus `L001`). Furthermore, even if the application server holds the AES-GCM key to decrypt records in storage, server-side authorization is still required on every request to decide whether the authenticated user has permission to view a specific student record or modify a course grade. Without authentication and per-request authorization, an application that automatically decrypts records for any logged-in session would still allow `S001` to read `S002`'s decrypted record (T6) or overwrite grades (T7).
