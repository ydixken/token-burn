import crypto from "crypto";

/**
 * Webhook payload signer using HMAC-SHA256.
 *
 * Generates and verifies signatures for webhook payloads
 * using a shared secret between Krawall and the receiver.
 */

const SIGNATURE_HEADER = "X-Krawall-Signature";
const TIMESTAMP_HEADER = "X-Krawall-Timestamp";
const ALGORITHM = "sha256";

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * The signature covers both the timestamp and the payload body
 * to prevent replay attacks and payload tampering.
 *
 * @param payload - JSON-serialized payload string
 * @param secret - HMAC secret key
 * @param timestamp - Unix timestamp (seconds). If omitted, uses current time.
 * @returns Object with signature string and timestamp used
 */
export function signPayload(
  payload: string,
  secret: string,
  timestamp?: number
): { signature: string; timestamp: number } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedContent = `${ts}.${payload}`;

  const hmac = crypto.createHmac(ALGORITHM, secret);
  hmac.update(signedContent);
  const digest = hmac.digest("hex");

  return {
    signature: `${ALGORITHM}=${digest}`,
    timestamp: ts,
  };
}

/**
 * Verify a webhook payload signature.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - JSON-serialized payload string
 * @param secret - HMAC secret key
 * @param signature - Signature to verify (format: "sha256=<hex>")
 * @param timestamp - Timestamp that was used during signing
 * @param toleranceSec - Maximum age of the signature in seconds (default: 300 = 5 min)
 * @returns true if signature is valid and within tolerance window
 */
export function verifySignature(
  payload: string,
  secret: string,
  signature: string,
  timestamp: number,
  toleranceSec: number = 300
): boolean {
  // Check timestamp freshness to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) {
    return false;
  }

  const expected = signPayload(payload, secret, timestamp);

  // Timing-safe comparison
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected.signature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Generate a random webhook secret.
 *
 * @returns 32-byte hex string (64 characters)
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Build the headers object for a signed webhook delivery.
 *
 * @param payload - JSON-serialized payload string
 * @param secret - HMAC secret key
 * @returns Headers object with signature and timestamp
 */
export function buildSignedHeaders(
  payload: string,
  secret: string
): Record<string, string> {
  const { signature, timestamp } = signPayload(payload, secret);

  return {
    "Content-Type": "application/json",
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: String(timestamp),
  };
}

export { SIGNATURE_HEADER, TIMESTAMP_HEADER };
