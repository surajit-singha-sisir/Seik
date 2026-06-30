/**
 * crypto.ts
 *
 * Encrypts/decrypts user-supplied secrets (ImgBB API keys, Neon connection
 * strings) before they are stored in the control-plane `accounts` table.
 *
 * Key derivation: scrypt(SESSION_SECRET) → 32-byte AES-256 key.
 * No new env var required — reuses SESSION_SECRET that already exists.
 *
 * Format of an encrypted value: "v1:<ivHex>:<authTagHex>:<cipherHex>"
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set — required to encrypt user secrets.');
  }
  // Static salt is fine here: the secret itself is high-entropy (64 hex chars)
  // and per-value uniqueness comes from the random IV below.
  cachedKey = scryptSync(secret, 'seik-account-secrets', 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret.');
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
