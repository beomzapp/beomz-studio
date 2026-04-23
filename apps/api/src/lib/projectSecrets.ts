import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { apiConfig } from "../config.js";

const ENCRYPTION_VERSION = "v1";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getProjectSecretBase(): string {
  return apiConfig.PROJECT_JWT_SECRET?.trim()
    || apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY;
}

function getEncryptionKey(): Buffer {
  return createHash("sha256")
    .update(getProjectSecretBase())
    .digest();
}

export function encryptProjectSecret(value: string): string {
  const plaintext = value.trim();
  if (!plaintext) {
    throw new Error("Secret value must not be empty");
  }

  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptProjectSecret(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = value.split(":");
  if (
    version !== ENCRYPTION_VERSION
    || !ivEncoded
    || !authTagEncoded
    || !ciphertextEncoded
  ) {
    return null;
  }

  try {
    const iv = Buffer.from(ivEncoded, "base64url");
    const authTag = Buffer.from(authTagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
      return null;
    }

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
