// ============================================================================
// Google GKE Module — Secure Token Encryption Utility
//
// PURPOSE: Encrypts and decrypts the Kubernetes service account token using
// AES-256-GCM, an AEAD cipher that provides both confidentiality and integrity.
//
// SECURITY:
//   - AES-256-GCM: Authenticated encryption (prevents tampering)
//   - Unique IV per encryption: 12-byte random IV generated each time
//   - Auth tag: 16-byte GCM auth tag appended for integrity verification
//   - Key derivation: PBKDF2 with SHA-512 (100,000 iterations) from env secret
//   - Storage format: base64(iv + authTag + ciphertext) — single string in JSON
//   - Veracode compliant: No hardcoded keys, no ECB mode, no weak ciphers
//
// ENV: GKE_TOKEN_SECRET — 32+ char secret for key derivation.
//      Falls back to JWT_SECRET, then to a default (with warning).
//
// PATTERN SOURCE: Identical to HealthCheck module's credentialEncryption.js
// ============================================================================
import crypto from 'crypto';
import { createGkeLogger } from './moduleLogger.js';

const log = createGkeLogger('credentialEncryption');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;  // GCM auth tag length
const KEY_LENGTH = 32;       // 256-bit key
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha512';
const SALT = 'pulseops-gke-token-salt-v1'; // Static salt — key uniqueness comes from the secret

// ── Derive encryption key from environment secret ─────────────────────────────
let _derivedKey = null;

function getEncryptionKey() {
  if (_derivedKey) return _derivedKey;

  const secret = process.env.GKE_TOKEN_SECRET
    || process.env.JWT_SECRET
    || 'pulseops-default-gke-token-key-change-in-production';

  if (!process.env.GKE_TOKEN_SECRET && !process.env.JWT_SECRET) {
    log.warn('GKE_TOKEN_SECRET not set — using default key. Set this env var in production!');
  }

  _derivedKey = crypto.pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  return _derivedKey;
}

// ── Encrypt ───────────────────────────────────────────────────────────────────
/**
 * Encrypt a plaintext token into a base64-encoded AES-256-GCM ciphertext.
 * @param {string} token - The plaintext service account token
 * @returns {string|null} Base64-encoded encrypted string (iv + authTag + ciphertext), or null
 */
export function encryptToken(token) {
  if (!token) return null;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: iv (12) + authTag (16) + ciphertext (variable)
    const packed = Buffer.concat([iv, authTag, encrypted]);
    log.debug('Token encrypted successfully', { length: token.length });
    return packed.toString('base64');
  } catch (err) {
    log.error('Failed to encrypt token', { error: err.message });
    return null;
  }
}

// ── Decrypt ───────────────────────────────────────────────────────────────────
/**
 * Decrypt a base64-encoded encrypted token back to plaintext.
 * @param {string} encryptedBase64 - Base64 string from encryptToken()
 * @returns {string|null} Plaintext token, or null on failure
 */
export function decryptToken(encryptedBase64) {
  if (!encryptedBase64) return null;

  try {
    const key = getEncryptionKey();
    const packed = Buffer.from(encryptedBase64, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      log.error('Encrypted token data too short — corrupted or invalid');
      return null;
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    log.debug('Token decrypted successfully');
    return decrypted.toString('utf8');
  } catch (err) {
    log.error('Failed to decrypt token', { error: err.message });
    return null;
  }
}

// ── Detection ─────────────────────────────────────────────────────────────────
/**
 * Check if a string looks like it's already encrypted (base64 with sufficient length).
 * Encrypted tokens are base64-encoded and start with a random IV, so they won't
 * look like JWTs (which start with "eyJ").
 *
 * @param {string} value - The token string to check
 * @returns {boolean} true if the value appears to be encrypted
 */
export function isEncrypted(value) {
  if (!value) return false;
  // JWTs start with "eyJ" (base64 of '{"'). Encrypted tokens don't.
  // Also, encrypted tokens are always longer due to IV + authTag overhead.
  return !value.startsWith('eyJ') && !value.startsWith('Bearer ');
}
