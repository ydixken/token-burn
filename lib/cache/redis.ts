import Redis from "ioredis";

const getRedisUrl = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  return url;
};

// Singleton Redis client
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Helper to ensure connection
export async function ensureRedisConnection() {
  if (redis.status === "ready") {
    return redis;
  }

  try {
    await redis.connect();
    console.log("✅ Redis connected successfully");
    return redis;
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    throw error;
  }
}

// Helper to check health
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (error) {
    console.error("Redis health check failed:", error);
    return false;
  }
}

export default redis;
