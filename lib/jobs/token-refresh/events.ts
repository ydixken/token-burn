import { redis } from "@/lib/cache/redis";

/**
 * Token Refresh Events
 *
 * Redis Pub/Sub for broadcasting token refresh notifications.
 * Consumers (e.g. active WebSocket connectors) can subscribe to
 * be notified when a target's cached discovery result is refreshed,
 * allowing them to reconnect with fresh credentials.
 */

const CHANNEL = "krawall:token-refreshed";

// ---------- types ----------

export interface TokenRefreshedEvent {
  /** The target whose token was refreshed */
  targetId: string;
  /** ISO timestamp of the refresh */
  timestamp: string;
  /** What triggered the refresh */
  triggeredBy: "scheduled" | "manual" | "auto-start";
}

// ---------- publish ----------

/**
 * Publish a token-refreshed event via Redis PUBLISH.
 *
 * @param targetId - The target that was refreshed
 * @param triggeredBy - What triggered the refresh
 */
export async function publishTokenRefreshed(
  targetId: string,
  triggeredBy: "scheduled" | "manual" | "auto-start"
): Promise<void> {
  const event: TokenRefreshedEvent = {
    targetId,
    timestamp: new Date().toISOString(),
    triggeredBy,
  };

  await redis.publish(CHANNEL, JSON.stringify(event));
}

// ---------- subscribe ----------

export interface TokenRefreshSubscription {
  /** Unsubscribe and close the dedicated subscriber connection */
  unsubscribe: () => Promise<void>;
}

/**
 * Subscribe to token-refreshed events.
 *
 * Creates a DUPLICATE Redis connection (ioredis enters subscriber mode
 * on the connection, making it unable to run other commands).
 * The returned object's `unsubscribe()` method cleans up the subscriber
 * connection.
 *
 * @param callback - Invoked for each token-refreshed event
 * @returns Subscription handle with `unsubscribe()` method
 */
export async function subscribeTokenRefreshed(
  callback: (event: TokenRefreshedEvent) => void
): Promise<TokenRefreshSubscription> {
  const subscriber = redis.duplicate();

  subscriber.on("message", (channel: string, message: string) => {
    if (channel !== CHANNEL) return;

    try {
      const event = JSON.parse(message) as TokenRefreshedEvent;
      callback(event);
    } catch (error) {
      console.error("Failed to parse token-refreshed event:", error);
    }
  });

  await subscriber.subscribe(CHANNEL);

  return {
    unsubscribe: async () => {
      try {
        await subscriber.unsubscribe(CHANNEL);
        subscriber.disconnect();
      } catch {
        // Subscriber may already be disconnected
      }
    },
  };
}
