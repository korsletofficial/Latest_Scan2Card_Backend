import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment variable
const getEncryptionKey = (): Buffer => {
  const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY environment variable is not set");
  }
  // Ensure key is exactly 32 bytes for AES-256
  return crypto.scryptSync(key, "salt", 32);
};

/**
 * Encrypt a string using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all base64)
 */
export const encrypt = (text: string): string => {
  if (!text) return "";

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and encrypted data
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
};

/**
 * Decrypt a string encrypted with AES-256-GCM
 * @param encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plain text
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText) return "";

  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Check if encryption key is configured
 */
export const isEncryptionConfigured = (): boolean => {
  return !!process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
};
