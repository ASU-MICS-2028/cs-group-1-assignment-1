const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ICS570 Lab 2 — Part B: Short Cryptography Follow-On
 * Protects a synthetic student-data export using AES-256-GCM (Authenticated Encryption with Associated Data)
 * from Node.js built-in `node:crypto` (OpenSSL), using a fresh 96-bit (12-byte) nonce for every encryption.
 */

// 1. Ephemeral 256-bit symmetric key generated at runtime (never hardcode production keys)
const dataEncryptionKey = crypto.randomBytes(32);

// Synthetic student record export (S001)
const syntheticStudentExport = {
  exportType: 'STUDENT_TRANSCRIPT_RECORD',
  studentId: 'S001',
  fullName: 'Ama Mensah',
  program: 'MSc Intelligent Computing Systems',
  courseId: 'C101',
  courseTitle: 'ICS570: Cybersecurity Essentials',
  grade: 'A',
  score: 94,
  exportedAt: '2026-10-16T18:45:00Z',
};

/**
 * Encrypts a UTF-8 JSON string using AES-256-GCM with a fresh 96-bit (12-byte) random nonce.
 */
function encryptRecordAesGcm(plaintextJson, key, associatedData = 'ICS570-PORTAL-EXPORT-V1') {
  // Requirement 2: Fresh 96-bit (12-byte) cryptographically random nonce per encryption
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: 16,
  });

  cipher.setAAD(Buffer.from(associatedData, 'utf8'));

  const ciphertext = Buffer.concat([
    cipher.update(plaintextJson, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    nonceHex: nonce.toString('hex'),
    associatedData,
    ciphertextHex: ciphertext.toString('hex'),
    authTagHex: authTag.toString('hex'),
  };
}

/**
 * Verifies the authentication tag and decrypts an AES-256-GCM envelope.
 */
function decryptRecordAesGcm(envelope, key) {
  const nonce = Buffer.from(envelope.nonceHex, 'hex');
  const ciphertext = Buffer.from(envelope.ciphertextHex, 'hex');
  const authTag = Buffer.from(envelope.authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(envelope.associatedData, 'utf8'));
  decipher.setAuthTag(authTag);

  const decryptedBuffer = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // Throws immediately if ciphertext, AAD, or authTag was modified
  ]);
  return decryptedBuffer.toString('utf8');
}

function runCryptoDemo() {
  const originalJson = JSON.stringify(syntheticStudentExport, null, 2);

  console.log('======================================================================');
  console.log('ICS570 Lab 2 — Part B: AES-256-GCM Authenticated Encryption Demo');
  console.log('======================================================================\n');

  // Step 1 & 2: Encrypt twice with the same key to demonstrate fresh 96-bit nonces
  const envelope1 = encryptRecordAesGcm(originalJson, dataEncryptionKey);
  const envelope2 = encryptRecordAesGcm(originalJson, dataEncryptionKey);

  console.log('[1] Fresh 96-bit Nonce Verification (Two encryptions of identical record):');
  console.log(`    Encryption #1 Nonce (96-bit): ${envelope1.nonceHex}`);
  console.log(`    Encryption #2 Nonce (96-bit): ${envelope2.nonceHex}`);
  console.log(
    `    Nonces Unique?                ${envelope1.nonceHex !== envelope2.nonceHex}`
  );
  console.log(
    `    Ciphertexts Distinct?         ${envelope1.ciphertextHex !== envelope2.ciphertextHex}\n`
  );

  // Authorized decryption restores original record exactly
  const restoredJson = decryptRecordAesGcm(envelope1, dataEncryptionKey);
  const exactMatch = restoredJson === originalJson;
  console.log('[2] Authorized AES-256-GCM Decryption:');
  console.log(`    Auth Tag (128-bit):           ${envelope1.authTagHex}`);
  console.log(`    Restored Matches Original?    ${exactMatch}`);
  console.log(`    Restored Student ID & Grade:  ${JSON.parse(restoredJson).studentId} -> ${JSON.parse(restoredJson).grade}\n`);

  // Step 3: Integrity Test — Flip 1 byte in ciphertext and verify decryption fails loudly
  const tamperedCiphertextInstance = { ...envelope1 };
  const ctBytes = Buffer.from(envelope1.ciphertextHex, 'hex');
  ctBytes[0] ^= 0xff; // Flip bits of first ciphertext byte
  tamperedCiphertextInstance.ciphertextHex = ctBytes.toString('hex');

  let ciphertextTamperRejected = false;
  let ciphertextTamperError = '';
  try {
    decryptRecordAesGcm(tamperedCiphertextInstance, dataEncryptionKey);
  } catch (err) {
    ciphertextTamperRejected = true;
    ciphertextTamperError = err.message;
  }

  // Also test flipping 1 byte in the 128-bit GCM authentication tag
  const tamperedTagInstance = { ...envelope1 };
  const tagBytes = Buffer.from(envelope1.authTagHex, 'hex');
  tagBytes[0] ^= 0xff;
  tamperedTagInstance.authTagHex = tagBytes.toString('hex');

  let tagTamperRejected = false;
  let tagTamperError = '';
  try {
    decryptRecordAesGcm(tamperedTagInstance, dataEncryptionKey);
  } catch (err) {
    tagTamperRejected = true;
    tagTamperError = err.message;
  }

  console.log('[3] Integrity & Tamper Detection Tests:');
  console.log(`    Tampered Ciphertext Byte Rejected? ${ciphertextTamperRejected} (${ciphertextTamperError})`);
  console.log(`    Tampered Auth Tag Byte Rejected?   ${tagTamperRejected} (${tagTamperError})\n`);

  // Step 4: Boundary explanation (3-5 sentences)
  const boundaryExplanation = [
    'AES-GCM provides confidentiality and integrity for data in transit or at rest (such as an exported student transcript file), ensuring that unauthorized parties without the secret key cannot read or silently alter the exported ciphertext.',
    'However, encryption does not identify who is sitting at the browser or making an HTTP request; WebAuthn passkey authentication is required to cryptographically prove the live identity of the user (e.g., S001 versus L001).',
    'Furthermore, even if the application server holds the AES-GCM key to decrypt records in storage, server-side authorization is still required on every request to decide whether the authenticated user has permission to view a specific student record or modify a course grade.',
    'Without authentication and per-request authorization, an application that automatically decrypts records for any logged-in session would still allow S001 to read S002\'s decrypted record (T6) or overwrite grades (T7).',
  ].join(' ');

  console.log('[4] Why AES-GCM Does Not Replace Passkey Authentication or Authorization:');
  console.log(`    ${boundaryExplanation}\n`);

  const evidenceDir = path.join(__dirname, '..', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const cryptoEvidencePath = path.join(evidenceDir, 'part-b-crypto-log.json');
  fs.writeFileSync(
    cryptoEvidencePath,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        algorithm: 'aes-256-gcm',
        nonceBitLength: 96,
        encryption1NonceHex: envelope1.nonceHex,
        encryption2NonceHex: envelope2.nonceHex,
        noncesUnique: envelope1.nonceHex !== envelope2.nonceHex,
        authorizedDecryptionExactMatch: exactMatch,
        ciphertextTamperTest: {
          rejected: ciphertextTamperRejected,
          error: ciphertextTamperError,
        },
        authTagTamperTest: {
          rejected: tagTamperRejected,
          error: tagTamperError,
        },
        boundaryExplanation,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`Saved Part B evidence log to ${cryptoEvidencePath}`);
}

runCryptoDemo();
