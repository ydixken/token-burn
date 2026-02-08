import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockPublish, mockSubscribe, mockUnsubscribe, mockDisconnect, mockOn, mockSubscriberInstance } =
  vi.hoisted(() => {
    const mockPublish = vi.fn().mockResolvedValue(1);
    const mockSubscribe = vi.fn().mockResolvedValue(undefined);
    const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const mockDisconnect = vi.fn();
    const mockOn = vi.fn();

    const mockSubscriberInstance = {
      on: mockOn,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      disconnect: mockDisconnect,
    };

    return {
      mockPublish,
      mockSubscribe,
      mockUnsubscribe,
      mockDisconnect,
      mockOn,
      mockSubscriberInstance,
    };
  });

vi.mock("@/lib/cache/redis", () => ({
  redis: {
    publish: mockPublish,
    duplicate: vi.fn().mockReturnValue(mockSubscriberInstance),
  },
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import {
  publishTokenRefreshed,
  subscribeTokenRefreshed,
  type TokenRefreshedEvent,
} from "@/lib/jobs/token-refresh/events";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Token Refresh Events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // publishTokenRefreshed
  // =========================================================================

  describe("publishTokenRefreshed", () => {
    it("should publish to the correct channel", async () => {
      await publishTokenRefreshed("target-1", "scheduled");

      expect(mockPublish).toHaveBeenCalledWith(
        "krawall:token-refreshed",
        expect.any(String)
      );
    });

    it("should publish JSON payload with targetId, timestamp, and triggeredBy", async () => {
      await publishTokenRefreshed("target-1", "manual");

      const publishedJson = mockPublish.mock.calls[0][1];
      const parsed = JSON.parse(publishedJson) as TokenRefreshedEvent;

      expect(parsed.targetId).toBe("target-1");
      expect(parsed.triggeredBy).toBe("manual");
      expect(parsed.timestamp).toBeDefined();
      // Verify timestamp is a valid ISO string
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });

    it("should handle auto-start triggeredBy", async () => {
      await publishTokenRefreshed("target-2", "auto-start");

      const publishedJson = mockPublish.mock.calls[0][1];
      const parsed = JSON.parse(publishedJson) as TokenRefreshedEvent;

      expect(parsed.targetId).toBe("target-2");
      expect(parsed.triggeredBy).toBe("auto-start");
    });
  });

  // =========================================================================
  // subscribeTokenRefreshed
  // =========================================================================

  describe("subscribeTokenRefreshed", () => {
    it("should create a duplicate Redis connection", async () => {
      const { redis } = await import("@/lib/cache/redis");

      await subscribeTokenRefreshed(vi.fn());

      expect(redis.duplicate).toHaveBeenCalled();
    });

    it("should subscribe to the correct channel", async () => {
      await subscribeTokenRefreshed(vi.fn());

      expect(mockSubscribe).toHaveBeenCalledWith("krawall:token-refreshed");
    });

    it("should register a message listener on the subscriber", async () => {
      await subscribeTokenRefreshed(vi.fn());

      expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("should invoke callback when message received on correct channel", async () => {
      const callback = vi.fn();
      await subscribeTokenRefreshed(callback);

      // Get the registered message handler
      const messageHandler = mockOn.mock.calls.find(
        (call: unknown[]) => call[0] === "message"
      )![1] as (channel: string, message: string) => void;

      const event: TokenRefreshedEvent = {
        targetId: "target-1",
        timestamp: new Date().toISOString(),
        triggeredBy: "scheduled",
      };

      messageHandler("krawall:token-refreshed", JSON.stringify(event));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "target-1",
          triggeredBy: "scheduled",
        })
      );
    });

    it("should NOT invoke callback for wrong channel", async () => {
      const callback = vi.fn();
      await subscribeTokenRefreshed(callback);

      const messageHandler = mockOn.mock.calls.find(
        (call: unknown[]) => call[0] === "message"
      )![1] as (channel: string, message: string) => void;

      messageHandler("other-channel", JSON.stringify({ targetId: "t1" }));

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not throw on invalid JSON message", async () => {
      const callback = vi.fn();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await subscribeTokenRefreshed(callback);

      const messageHandler = mockOn.mock.calls.find(
        (call: unknown[]) => call[0] === "message"
      )![1] as (channel: string, message: string) => void;

      // Should not throw
      messageHandler("krawall:token-refreshed", "invalid-json{{{");

      expect(callback).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should return subscription with unsubscribe method", async () => {
      const subscription = await subscribeTokenRefreshed(vi.fn());

      expect(subscription).toHaveProperty("unsubscribe");
      expect(typeof subscription.unsubscribe).toBe("function");
    });
  });

  // =========================================================================
  // unsubscribe
  // =========================================================================

  describe("unsubscribe", () => {
    it("should unsubscribe from channel and disconnect subscriber", async () => {
      const subscription = await subscribeTokenRefreshed(vi.fn());

      await subscription.unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalledWith("krawall:token-refreshed");
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("should handle errors during unsubscribe gracefully", async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error("already disconnected"));

      const subscription = await subscribeTokenRefreshed(vi.fn());

      // Should not throw
      await expect(subscription.unsubscribe()).resolves.toBeUndefined();
    });
  });
});
