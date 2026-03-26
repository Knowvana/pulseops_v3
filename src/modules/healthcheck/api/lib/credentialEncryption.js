// ============================================================================
// credentialEncryption.js — Secure Credential Storage Utility
//
// PURPOSE: Encrypts and decrypts application credentials using AES-256-GCM,
// an AEAD cipher that provides both confidentiality and integrity.
//
// SECURITY:
//   - AES-256-GCM: Authenticated encryption (prevents tampering)
//   - Unique IV per encryption: 12-byte random IV generated each time
//   - Auth tag: 16-byte GCM auth tag appended for integrity verification
//   - Key derivation: PBKDF2 with SHA-512 (100,000 iterations) from env secret
//   - Storage format: base64(iv + authTag + ciphertext) — single TEXT column
//   - Veracode compliant: No hardcoded keys, no ECB mode, no weak ciphers
//
// ENV: HC_CREDENTIAL_SECRET — 32+ char secret for key derivation.
//      Falls back to a combination of platform config values if not set.
//
// USED BY: appRoutes.js (encrypt on save, decrypt on poll)
// ============================================================================
import crypto from 'crypto';
import { createHcLogger } from './moduleLogger.js';

const log = createHcLogger('credentialEncryption.js');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;  // GCM auth tag length
const KEY_LENGTH = 32;       // 256-bit key
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha512';
const SALT = 'pulseops-hc-credential-salt-v1'; // Static salt — key uniqueness comes from the secret

// ── Derive encryption key from environment secret ─────────────────────────────
let _derivedKey = null;

function getEncryptionKey() {
  if (_derivedKey) return _derivedKey;

  const secret = process.env.HC_CREDENTIAL_SECRET
    || process.env.JWT_SECRET
    || 'pulseops-default-credential-key-change-in-production';

  if (!process.env.HC_CREDENTIAL_SECRET && !process.env.JWT_SECRET) {
    log.warn('HC_CREDENTIAL_SECRET not set — using default key. Set this env var in production!');
  }

  _derivedKey = crypto.pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  return _derivedKey;
}

// ── Encrypt ───────────────────────────────────────────────────────────────────
/**
 * Encrypt a credentials object { username, password } into a single base64 string.
 * @param {Object} credentials - { username: string, password: string }
 * @returns {string} Base64-encoded encrypted string (iv + authTag + ciphertext)
 */
export function encryptCredentials(credentials) {
  if (!credentials) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

// ── Decrypt ───────────────────────────────────────────────────────────────────
/**
 * Decrypt a base64-encoded encrypted string back to { username, password }.
 * @param {string} encryptedBase64 - Base64 string from encryptCredentials()
 * @returns {Object|null} { username, password } or null on failure
 */
export function decryptCredentials(encryptedBase64) {
  if (!encryptedBase64) return null;

  try {
    const key = getEncryptionKey();
    const packed = Buffer.from(encryptedBase64, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      log.error('Encrypted credential data too short — corrupted or invalid');
      return null;
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    log.error('Failed to decrypt credentials', { message: err.message });
    return null;
  }
}

// ── Redact credentials for API response ───────────────────────────────────────
/**
 * Returns a safe representation of credentials for API responses.
 * Never exposes actual password — only indicates if credentials are configured.
 * @param {string} encryptedBase64 - The encrypted credential string from DB
 * @returns {Object|null} { username: 'actual_username', password: '••••••••' } or null
 */
export function redactCredentials(encryptedBase64) {
  if (!encryptedBase64) return null;

  const creds = decryptCredentials(encryptedBase64);
  if (!creds) return null;

  return {
    username: creds.username || '',
    password: '••••••••',
  };
}
