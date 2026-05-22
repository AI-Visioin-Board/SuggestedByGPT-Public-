/**
 * Credential Encryption Module
 *
 * AES-256-GCM encryption for client credentials stored in the database.
 * Uses CREDENTIAL_ENCRYPTION_KEY env var (32-byte hex string).
 *
 * Throws if key is not set — never stores credentials without real encryption.
 * decrypt() still handles legacy b64: and plaintext records for backward compat.
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a string in format: enc:iv:authTag:ciphertext (all hex-encoded)
 *
 * Throws if CREDENTIAL_ENCRYPTION_KEY is not configured — never store
 * credentials without real encryption.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      '[Encryption] CREDENTIAL_ENCRYPTION_KEY not set. Cannot store credentials without encryption. ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string.
 * Handles both encrypted (enc:...) and base64-fallback (b64:...) formats.
 * Also handles legacy plaintext (no prefix) for backward compatibility.
 */
export function decrypt(encryptedText: string): string {
  // Handle base64 fallback
  if (encryptedText.startsWith('b64:')) {
    return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8');
  }

  // Handle encrypted format
  if (encryptedText.startsWith('enc:')) {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY required to decrypt credentials');
    }

    const parts = encryptedText.slice(4).split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format');
    }

    const [ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Legacy plaintext — return as-is (backward compatibility)
  return encryptedText;
}
