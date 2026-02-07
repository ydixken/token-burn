import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { Express } from "express";
import axios from "axios";
import {
  verifySignature,
  buildSignedHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/signer";

/**
 * Tests for webhook delivery logic.
 *
 * Tests the signer integration with a mock receiver server that
 * validates incoming webhook signatures. The BullMQ queue/worker
 * is not tested here (requires Redis) - those are integration tests.
 *
 * This suite verifies:
 * - End-to-end signing + verification via HTTP
 * - Tampered payload detection
 * - Wrong secret rejection
 * - Mock receiver correctly validates signatures
 */

describe("Webhook Delivery", () => {
  let receiverApp: Express;
  let receiverServer: any;
  const receiverPort = 3003;
  const testSecret = "test-webhook-secret-12345";

  // Track received webhooks
  const receivedWebhooks: Array<{
    body: string;
    verified: boolean;
  }> = [];

  beforeAll(async () => {
    receiverApp = express();

    // Raw body parsing for signature verification
    receiverApp.use(express.raw({ type: "application/json" }));

    // Success endpoint - validates signature
    receiverApp.post("/webhook", (req, res) => {
      const body = req.body.toString();
      const signature = req.headers[
        SIGNATURE_HEADER.toLowerCase()
      ] as string;
      const timestamp = parseInt(
        req.headers[TIMESTAMP_HEADER.toLowerCase()] as string,
        10
      );

      const verified = verifySignature(body, testSecret, signature, timestamp);

      receivedWebhooks.push({ body, verified });

      if (verified) {
        res.status(200).json({ received: true });
      } else {
        res.status(401).json({ error: "Invalid signature" });
      }
    });

    // Error endpoint - always returns 500
    receiverApp.post("/webhook/error", (_req, res) => {
      res.status(500).json({ error: "Internal server error" });
    });

    await new Promise<void>((resolve) => {
      receiverServer = receiverApp.listen(receiverPort, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (receiverServer) {
        receiverServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  describe("End-to-end signed delivery", () => {
    it("should deliver a payload that passes signature verification", async () => {
      const payload = JSON.stringify({
        event: "session.completed",
        payload: { sessionId: "test-123" },
        deliveryId: "delivery-1",
        timestamp: new Date().toISOString(),
      });

      const headers = buildSignedHeaders(payload, testSecret);

      const response = await axios.post(
        `http://localhost:${receiverPort}/webhook`,
        payload,
        { headers }
      );

      expect(response.status).toBe(200);
      expect(response.data.received).toBe(true);

      const lastReceived = receivedWebhooks[receivedWebhooks.length - 1];
      expect(lastReceived.verified).toBe(true);
    });

    it("should reject a payload with wrong secret", async () => {
      const payload = JSON.stringify({
        event: "session.failed",
        payload: { sessionId: "test-456" },
        deliveryId: "delivery-2",
        timestamp: new Date().toISOString(),
      });

      const headers = buildSignedHeaders(payload, "wrong-secret");

      const response = await axios.post(
        `http://localhost:${receiverPort}/webhook`,
        payload,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);

      const lastReceived = receivedWebhooks[receivedWebhooks.length - 1];
      expect(lastReceived.verified).toBe(false);
    });

    it("should reject a tampered payload", async () => {
      const originalPayload = JSON.stringify({
        event: "session.completed",
        payload: { sessionId: "test-789" },
      });

      // Sign the original payload
      const headers = buildSignedHeaders(originalPayload, testSecret);

      // Send a different (tampered) payload
      const tamperedPayload = JSON.stringify({
        event: "session.completed",
        payload: { sessionId: "TAMPERED" },
      });

      const response = await axios.post(
        `http://localhost:${receiverPort}/webhook`,
        tamperedPayload,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);

      const lastReceived = receivedWebhooks[receivedWebhooks.length - 1];
      expect(lastReceived.verified).toBe(false);
    });

    it("should handle server error responses", async () => {
      const payload = JSON.stringify({
        event: "session.completed",
        payload: { sessionId: "test-error" },
      });

      const headers = buildSignedHeaders(payload, testSecret);

      const response = await axios.post(
        `http://localhost:${receiverPort}/webhook/error`,
        payload,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(500);
      expect(response.data.error).toBe("Internal server error");
    });

    it("should handle connection refused", async () => {
      const payload = JSON.stringify({ event: "test" });
      const headers = buildSignedHeaders(payload, testSecret);

      await expect(
        axios.post("http://localhost:19999/webhook", payload, {
          headers,
          timeout: 2000,
        })
      ).rejects.toThrow();
    });
  });

  describe("Payload format", () => {
    it("should deliver JSON with correct content-type", async () => {
      const payload = JSON.stringify({
        event: "session.completed",
        payload: {
          sessionId: "sess-001",
          targetName: "My Chatbot",
          metrics: {
            totalTokens: 5000,
            avgResponseTimeMs: 250,
            errorRate: 0,
          },
        },
        deliveryId: "del-format-test",
        timestamp: new Date().toISOString(),
      });

      const headers = buildSignedHeaders(payload, testSecret);

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers[SIGNATURE_HEADER]).toBeDefined();
      expect(headers[TIMESTAMP_HEADER]).toBeDefined();

      const response = await axios.post(
        `http://localhost:${receiverPort}/webhook`,
        payload,
        { headers }
      );

      expect(response.status).toBe(200);

      // Verify the receiver got the exact payload
      const lastReceived = receivedWebhooks[receivedWebhooks.length - 1];
      const parsed = JSON.parse(lastReceived.body);
      expect(parsed.event).toBe("session.completed");
      expect(parsed.payload.sessionId).toBe("sess-001");
      expect(parsed.payload.metrics.totalTokens).toBe(5000);
    });
  });
});
