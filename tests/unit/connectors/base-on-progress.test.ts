import { describe, it, expect, vi } from "vitest";
import { BaseConnector, type ConnectorConfig, type ConnectorResponse, type HealthStatus, type MessageMetadata, type ProgressEvent } from "@/lib/connectors/base";

// Concrete test subclass
class TestConnector extends BaseConnector {
  async connect(): Promise<void> {
    this.emitProgress("connect", "Connecting...");
  }
  async disconnect(): Promise<void> {}
  isConnected(): boolean { return true; }
  async sendMessage(message: string, metadata?: MessageMetadata): Promise<ConnectorResponse> {
    this.emitProgress("message", "Sending...");
    return { content: "ok", metadata: { responseTimeMs: 10 } };
  }
  supportsStreaming(): boolean { return false; }
  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, timestamp: new Date() };
  }
}

const mockConfig: ConnectorConfig = {
  endpoint: "http://test.com",
  authType: "NONE",
  authConfig: {},
  requestTemplate: { messagePath: "message" },
  responseTemplate: { responsePath: "response" },
};

describe("BaseConnector onProgress", () => {
  it("should accept and store a progress callback via setOnProgress", () => {
    const connector = new TestConnector("test-1", mockConfig);
    const callback = vi.fn();
    connector.setOnProgress(callback);
    // No error = success
    expect(callback).not.toHaveBeenCalled();
  });

  it("should emit progress events during connect", async () => {
    const connector = new TestConnector("test-1", mockConfig);
    const callback = vi.fn();
    connector.setOnProgress(callback);

    await connector.connect();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "connect",
        message: "Connecting...",
        timestamp: expect.any(Date),
      })
    );
  });

  it("should emit progress events during sendMessage", async () => {
    const connector = new TestConnector("test-1", mockConfig);
    const callback = vi.fn();
    connector.setOnProgress(callback);

    await connector.sendMessage("hello", {
      sessionId: "s1",
      messageIndex: 0,
      timestamp: new Date(),
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message",
        message: "Sending...",
      })
    );
  });

  it("should not throw if no progress callback is set", async () => {
    const connector = new TestConnector("test-1", mockConfig);
    // No callback set — should not throw
    await expect(connector.connect()).resolves.toBeUndefined();
  });

  it("should include optional data in progress events", async () => {
    // Create a subclass that passes data
    class DataConnector extends TestConnector {
      async connect(): Promise<void> {
        this.emitProgress("connect", "With data", { key: "value" });
      }
    }

    const connector = new DataConnector("test-1", mockConfig);
    const callback = vi.fn();
    connector.setOnProgress(callback);

    await connector.connect();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "connect",
        message: "With data",
        data: { key: "value" },
      })
    );
  });

  it("ProgressEvent should have the correct shape", async () => {
    const connector = new TestConnector("test-1", mockConfig);
    let capturedEvent: ProgressEvent | null = null;
    connector.setOnProgress((event) => {
      capturedEvent = event;
    });

    await connector.connect();

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!).toHaveProperty("type");
    expect(capturedEvent!).toHaveProperty("message");
    expect(capturedEvent!).toHaveProperty("timestamp");
    expect(capturedEvent!.timestamp).toBeInstanceOf(Date);
  });
});
