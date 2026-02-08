import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WidgetDetector } from '@/lib/connectors/browser/widget-detector';
import type { BrowserWebSocketProtocolConfig, InteractionStep } from '@/lib/connectors/browser/types';
import type { Page, Locator, Frame } from 'playwright';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockLocator(overrides: Partial<Record<string, any>> = {}): Locator {
  const locator = {
    count: vi.fn().mockResolvedValue(0),
    first: vi.fn().mockReturnThis(),
    nth: vi.fn().mockReturnThis(),
    isVisible: vi.fn().mockResolvedValue(false),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as Locator;
  return locator;
}

function createMockFrame(locatorOverrides: Partial<Record<string, any>> = {}): Frame {
  const frameLocator = createMockLocator(locatorOverrides);
  return {
    locator: vi.fn().mockReturnValue(frameLocator),
  } as unknown as Frame;
}

function createMockPage(overrides: Partial<Record<string, any>> = {}): Page {
  const mainLocator = createMockLocator();
  const mainFrame = { id: 'main' } as unknown as Frame;

  return {
    locator: vi.fn().mockReturnValue(mainLocator),
    frames: vi.fn().mockReturnValue([mainFrame]),
    mainFrame: vi.fn().mockReturnValue(mainFrame),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Page;
}

function createConfig(
  overrides: Partial<BrowserWebSocketProtocolConfig['widgetDetection']> = {}
): BrowserWebSocketProtocolConfig {
  return {
    pageUrl: 'https://example.com',
    widgetDetection: {
      strategy: 'heuristic',
      timeout: 15000,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WidgetDetector', () => {
  let page: Page;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createMockPage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // WS Detection Callback Mechanism
  // =========================================================================

  describe('WS detection callback', () => {
    it('should invoke the callback when notifyWsDetected is called', () => {
      const config = createConfig();
      const detector = new WidgetDetector(page, config);
      const callback = vi.fn();

      detector.setWsDetectedCallback(callback);
      detector.notifyWsDetected();

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should not throw if notifyWsDetected is called without a callback', () => {
      const config = createConfig();
      const detector = new WidgetDetector(page, config);

      expect(() => detector.notifyWsDetected()).not.toThrow();
    });

    it('should allow replacing the callback', () => {
      const config = createConfig();
      const detector = new WidgetDetector(page, config);
      const first = vi.fn();
      const second = vi.fn();

      detector.setWsDetectedCallback(first);
      detector.setWsDetectedCallback(second);
      detector.notifyWsDetected();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // Strategy Routing
  // =========================================================================

  describe('detect() strategy routing', () => {
    it('should call heuristic strategy for "heuristic" config', async () => {
      const config = createConfig({ strategy: 'heuristic' });
      const detector = new WidgetDetector(page, config);

      // Heuristic will fail with no matching selectors
      const promise = detector.detect().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('Heuristic widget detection failed');
    });

    it('should call selector strategy for "selector" config', async () => {
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });
      page = createMockPage({
        locator: vi.fn().mockReturnValue(visibleLocator),
      });

      const config = createConfig({ strategy: 'selector', selector: '#my-chat' });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(visibleLocator.click).toHaveBeenCalled();
    });

    it('should throw if selector strategy has no selector', async () => {
      const config = createConfig({ strategy: 'selector' });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('requires a selector');
    });

    it('should call steps strategy for "steps" config', async () => {
      const steps: InteractionStep[] = [
        { action: 'click', selector: '#open-chat' },
      ];
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });
      page = createMockPage({
        locator: vi.fn().mockReturnValue(visibleLocator),
      });

      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(visibleLocator.click).toHaveBeenCalled();
    });

    it('should throw if steps strategy has no steps', async () => {
      const config = createConfig({ strategy: 'steps', steps: [] });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('requires at least one step');
    });
  });

  // =========================================================================
  // Heuristic Strategy
  // =========================================================================

  describe('heuristic strategy', () => {
    it('should try hint-derived selectors first and stop on WS detection', async () => {
      const selectorCalls: string[] = [];
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });

      page = createMockPage({
        locator: vi.fn().mockImplementation((sel: string) => {
          selectorCalls.push(sel);
          if (sel === '[class*="my-custom-widget"]') {
            return visibleLocator;
          }
          return createMockLocator();
        }),
      });

      const config = createConfig({
        strategy: 'heuristic',
        hints: { containsClass: ['my-custom-widget'] },
      });

      const detector = new WidgetDetector(page, config);
      // Simulate WS being detected when click happens
      visibleLocator.click = vi.fn().mockImplementation(async () => {
        detector.notifyWsDetected();
      });

      await detector.detect();

      expect(selectorCalls).toContain('[class*="my-custom-widget"]');
      expect(visibleLocator.click).toHaveBeenCalled();
    });

    it('should fall back to generic selectors when hints do not match', async () => {
      const selectorCalls: string[] = [];
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });

      page = createMockPage({
        locator: vi.fn().mockImplementation((sel: string) => {
          selectorCalls.push(sel);
          if (sel === '[aria-label*="chat" i]') {
            return visibleLocator;
          }
          return createMockLocator();
        }),
      });

      const config = createConfig({
        strategy: 'heuristic',
        hints: { containsClass: ['nonexistent-widget'] },
      });

      const detector = new WidgetDetector(page, config);
      visibleLocator.click = vi.fn().mockImplementation(async () => {
        detector.notifyWsDetected();
      });

      await detector.detect();

      // Hint-derived selector was tried first but failed
      expect(selectorCalls).toContain('[class*="nonexistent-widget"]');
      // Then generic selectors were tried
      expect(selectorCalls).toContain('[aria-label*="chat" i]');
      expect(visibleLocator.click).toHaveBeenCalled();
    });

    it('should throw when no widget is found by any selector', async () => {
      const config = createConfig({ strategy: 'heuristic' });
      const detector = new WidgetDetector(page, config);

      const promise = detector.detect().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('Heuristic widget detection failed');
    });

    it('should try positional filter when position and elementType hints are given', async () => {
      const positionalLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        boundingBox: vi.fn().mockResolvedValue({ x: 1100, y: 650, width: 60, height: 60 }),
      });

      page = createMockPage({
        locator: vi.fn().mockImplementation((sel: string) => {
          if (sel === 'button') {
            return positionalLocator;
          }
          return createMockLocator();
        }),
        viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
      });

      const config = createConfig({
        strategy: 'heuristic',
        hints: { position: 'bottom-right', elementType: 'button' },
      });

      const detector = new WidgetDetector(page, config);
      positionalLocator.click = vi.fn().mockImplementation(async () => {
        detector.notifyWsDetected();
      });

      const promise = detector.detect();
      await vi.runAllTimersAsync();
      await promise;

      expect(positionalLocator.click).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Selector Strategy
  // =========================================================================

  describe('selector strategy', () => {
    it('should click the provided selector directly', async () => {
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });
      page = createMockPage({
        locator: vi.fn().mockReturnValue(visibleLocator),
      });

      const config = createConfig({ strategy: 'selector', selector: '#chat-trigger' });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(page.locator).toHaveBeenCalledWith('#chat-trigger');
      expect(visibleLocator.click).toHaveBeenCalled();
    });

    it('should throw when selector is not found in any frame', async () => {
      const config = createConfig({ strategy: 'selector', selector: '#nonexistent' });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('not found on page or in any iframe');
    });
  });

  // =========================================================================
  // Steps Strategy
  // =========================================================================

  describe('steps strategy', () => {
    it('should execute all steps in order', async () => {
      const executionOrder: string[] = [];
      const clickLocator = createMockLocator({
        click: vi.fn().mockImplementation(async () => {
          executionOrder.push('click');
        }),
      });
      const typeLocator = createMockLocator({
        fill: vi.fn().mockImplementation(async () => {
          executionOrder.push('type');
        }),
      });

      page = createMockPage({
        locator: vi.fn().mockImplementation((sel: string) => {
          if (sel === '#btn') return clickLocator;
          if (sel === '#input') return typeLocator;
          return createMockLocator();
        }),
        waitForTimeout: vi.fn().mockImplementation(async () => {
          executionOrder.push('wait');
        }),
        evaluate: vi.fn().mockImplementation(async () => {
          executionOrder.push('evaluate');
        }),
        waitForSelector: vi.fn().mockImplementation(async () => {
          executionOrder.push('waitForSelector');
        }),
      });

      const steps: InteractionStep[] = [
        { action: 'click', selector: '#btn' },
        { action: 'wait', value: '500' },
        { action: 'type', selector: '#input', value: 'hello' },
        { action: 'waitForSelector', selector: '#panel' },
        { action: 'evaluate', script: 'window.foo = true' },
      ];

      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(executionOrder).toEqual(['click', 'wait', 'type', 'waitForSelector', 'evaluate']);
    });

    it('should throw for click step without selector', async () => {
      const steps: InteractionStep[] = [{ action: 'click' }];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('Click step requires a selector');
    });

    it('should throw for type step without value', async () => {
      const locator = createMockLocator();
      page = createMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps: InteractionStep[] = [{ action: 'type', selector: '#input' }];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('Type step requires a value');
    });

    it('should throw for wait step without value', async () => {
      const steps: InteractionStep[] = [{ action: 'wait' }];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('Wait step requires a value');
    });

    it('should throw for evaluate step without script', async () => {
      const steps: InteractionStep[] = [{ action: 'evaluate' }];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('Evaluate step requires a script');
    });

    it('should throw for waitForSelector step without selector', async () => {
      const steps: InteractionStep[] = [{ action: 'waitForSelector' }];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await expect(detector.detect()).rejects.toThrow('WaitForSelector step requires a selector');
    });

    it('should use step timeout when provided', async () => {
      const clickLocator = createMockLocator();
      page = createMockPage({
        locator: vi.fn().mockReturnValue(clickLocator),
      });

      const steps: InteractionStep[] = [
        { action: 'click', selector: '#btn', timeout: 3000 },
      ];
      const config = createConfig({ strategy: 'steps', steps });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(clickLocator.click).toHaveBeenCalledWith({ timeout: 3000 });
    });
  });

  // =========================================================================
  // tryClick Behavior
  // =========================================================================

  describe('tryClick behavior', () => {
    it('should return false for selectors with no matching elements', async () => {
      const config = createConfig({ strategy: 'heuristic' });
      const detector = new WidgetDetector(page, config);

      const promise = detector.detect().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
    });

    it('should skip non-visible elements', async () => {
      const invisibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(false),
      });
      page = createMockPage({
        locator: vi.fn().mockReturnValue(invisibleLocator),
      });

      const config = createConfig({ strategy: 'heuristic' });
      const detector = new WidgetDetector(page, config);

      const promise = detector.detect().catch((e: Error) => e);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect(invisibleLocator.click).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // iframe Support
  // =========================================================================

  describe('iframe support', () => {
    it('should find elements in iframes when not in main page', async () => {
      const mainLocator = createMockLocator({ count: vi.fn().mockResolvedValue(0) });
      const iframeLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });

      const mainFrame = { id: 'main' } as unknown as Frame;
      const childFrame = {
        locator: vi.fn().mockReturnValue(iframeLocator),
      } as unknown as Frame;

      page = createMockPage({
        locator: vi.fn().mockReturnValue(mainLocator),
        frames: vi.fn().mockReturnValue([mainFrame, childFrame]),
        mainFrame: vi.fn().mockReturnValue(mainFrame),
      });

      const config = createConfig({ strategy: 'selector', selector: '#chat-in-iframe' });
      const detector = new WidgetDetector(page, config);

      await detector.detect();

      expect(iframeLocator.click).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Timeout Behavior
  // =========================================================================

  describe('timeout behavior', () => {
    it('should resolve false from waitForWs when WS is not detected within timeout', async () => {
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });

      page = createMockPage({
        locator: vi.fn().mockReturnValue(visibleLocator),
      });

      const config = createConfig({
        strategy: 'heuristic',
        hints: { containsClass: ['chat-widget'] },
      });
      const detector = new WidgetDetector(page, config);

      // WS is never detected, so heuristic should exhaust selectors and throw
      const promise = detector.detect().catch((e: Error) => e);
      // Advance timers to resolve all waitForWs timeouts
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
    });

    it('should resolve immediately when wsDetected is already true', async () => {
      const visibleLocator = createMockLocator({
        count: vi.fn().mockResolvedValue(1),
        isVisible: vi.fn().mockResolvedValue(true),
      });

      page = createMockPage({
        locator: vi.fn().mockReturnValue(visibleLocator),
      });

      const config = createConfig({
        strategy: 'heuristic',
        hints: { containsClass: ['chat-widget'] },
      });
      const detector = new WidgetDetector(page, config);

      // Pre-notify WS detection
      detector.notifyWsDetected();

      await detector.detect();

      expect(visibleLocator.click).toHaveBeenCalled();
    });
  });
});
