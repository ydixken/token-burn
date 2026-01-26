import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Get encryption key from environment
 * Key must be 64 hex characters (32 bytes)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  // Key should be 64 hex characters (32 bytes for AES-256)
  if (key.length < 64) {
    // For development, pad the key (NOT for production!)
    console.warn("⚠️  ENCRYPTION_KEY is too short, padding for development");
    return Buffer.from(key.padEnd(64, "0"), "utf8").subarray(0, 32);
  }

  try {
    return Buffer.from(key.slice(0, 64), "hex");
  } catch {
    // Fallback: treat as UTF-8 string
    return Buffer.from(key, "utf8").subarray(0, 32);
  }
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all in hex)
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 * Expects format: iv:authTag:encryptedData (all in hex)
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();

  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(":");

    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${(error as Error).message}`);
  }
}

/**
 * Generate a random encryption key (for setup)
 * Returns 64 hex characters (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
