import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the selectors module
vi.mock("@/lib/connectors/browser/selectors", () => ({
  buildSelectorsFromHints: vi.fn().mockReturnValue([".hint-selector-1", ".hint-selector-2"]),
  ALL_HEURISTIC_SELECTORS: [".generic-1", ".generic-2"],
  buildPositionalFilter: vi.fn().mockReturnValue({
    selector: "button",
    filterFn: () => false,
  }),
}));

import { WidgetDetector } from "@/lib/connectors/browser/widget-detector";
import type { BrowserWebSocketProtocolConfig } from "@/lib/connectors/browser/types";

// Create mock Playwright Page
function createMockPage(options?: { title?: string; url?: string; frameCount?: number }) {
  const mockLocator = {
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnThis(),
    nth: vi.fn().mockReturnThis(),
    isVisible: vi.fn().mockResolvedValue(false),
    click: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue(null),
  };

  const mainFrame = { id: "main" };
  const frames = Array.from({ length: (options?.frameCount ?? 0) + 1 }, (_, i) =>
    i === 0 ? mainFrame : {
      id: `frame-${i}`,
      locator: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        first: vi.fn().mockReturnThis(),
      }),
    }
  );

  return {
    locator: vi.fn().mockReturnValue(mockLocator),
    title: vi.fn().mockResolvedValue(options?.title ?? "Test Page"),
    url: vi.fn().mockReturnValue(options?.url ?? "https://example.com"),
    frames: vi.fn().mockReturnValue(frames),
    mainFrame: vi.fn().mockReturnValue(mainFrame),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    on: vi.fn(),
  } as any;
}

const baseConfig: BrowserWebSocketProtocolConfig = {
  pageUrl: "https://example.com",
  widgetDetection: {
    strategy: "heuristic",
    hints: {
      position: "bottom-right",
      elementType: "button",
    },
  },
} as any;

describe("WidgetDetector debug reporting", () => {
  it("should accept a progress callback via setOnProgress", () => {
    const page = createMockPage();
    const detector = new WidgetDetector(page, baseConfig);
    const callback = vi.fn();
    detector.setOnProgress(callback);
    // No error = success
    expect(callback).not.toHaveBeenCalled();
  });

  it("should emit progress events for each selector tried during heuristic detection", async () => {
    const page = createMockPage();
    const detector = new WidgetDetector(page, baseConfig);
    const progressEvents: Array<{ message: string; data?: Record<string, unknown> }> = [];

    detector.setOnProgress((message, data) => {
      progressEvents.push({ message, data });
    });

    // Detection will fail since no elements are found
    await expect(detector.detect()).rejects.toThrow();

    // Should have emitted events for hint selectors and generic selectors
    const selectorEvents = progressEvents.filter(e => e.message.includes("selector"));
    expect(selectorEvents.length).toBeGreaterThan(0);
  });

  it("should emit debug info on heuristic detection failure", async () => {
    const page = createMockPage({ title: "My Chat App", url: "https://chat.example.com", frameCount: 2 });
    const detector = new WidgetDetector(page, baseConfig);
    const progressEvents: Array<{ message: string; data?: Record<string, unknown> }> = [];

    detector.setOnProgress((message, data) => {
      progressEvents.push({ message, data });
    });

    await expect(detector.detect()).rejects.toThrow(/no widget found/);

    // Find the failure event
    const failureEvent = progressEvents.find(e => e.message === "Widget detection failed");
    expect(failureEvent).toBeDefined();
    expect(failureEvent!.data).toMatchObject({
      pageTitle: "My Chat App",
      pageUrl: "https://chat.example.com",
      iframeCount: 2,
    });
    expect(failureEvent!.data!.selectorsTried).toBeGreaterThan(0);
  });

  it("should include selector count in error message", async () => {
    const page = createMockPage({ title: "Test", frameCount: 3 });
    const detector = new WidgetDetector(page, baseConfig);

    await expect(detector.detect()).rejects.toThrow(/Tried \d+ selectors/);
  });

  it("should include iframe count in error message", async () => {
    const page = createMockPage({ frameCount: 5 });
    const detector = new WidgetDetector(page, baseConfig);

    await expect(detector.detect()).rejects.toThrow(/\d+ iframes/);
  });

  it("should not emit progress if no callback is set", async () => {
    const page = createMockPage();
    const detector = new WidgetDetector(page, baseConfig);
    // No callback set — should still throw without errors
    await expect(detector.detect()).rejects.toThrow();
  });

  it("should emit a progress event when found via hint selector", async () => {
    const page = createMockPage();
    // Make first hint selector visible and clickable, and simulate WS detection
    const mockLocator = {
      count: vi.fn().mockResolvedValue(1),
      first: vi.fn().mockReturnThis(),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
    };
    page.locator.mockReturnValue(mockLocator);

    const detector = new WidgetDetector(page, baseConfig);
    // Simulate WS being detected immediately
    detector.notifyWsDetected();

    const progressEvents: Array<{ message: string; data?: Record<string, unknown> }> = [];
    detector.setOnProgress((message, data) => {
      progressEvents.push({ message, data });
    });

    await detector.detect();

    const foundEvent = progressEvents.find(e => e.message.includes("Widget found"));
    expect(foundEvent).toBeDefined();
  });
});
