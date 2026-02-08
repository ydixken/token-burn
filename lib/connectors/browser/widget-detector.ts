/**
 * Widget Detector
 *
 * Detects and clicks chat widget trigger elements on web pages using three strategies:
 * - Heuristic: tries hint-derived selectors, then generic selectors, then positional matching
 * - Selector: directly clicks a user-provided CSS selector
 * - Steps: executes an ordered list of interaction steps
 *
 * Works across main page and iframes (including Shadow DOM via Playwright's >> piercing locator).
 */

import type { Page, Locator, Frame } from 'playwright';
import type { BrowserWebSocketProtocolConfig, WidgetHints, InteractionStep } from './types';
import { buildSelectorsFromHints, ALL_HEURISTIC_SELECTORS, buildPositionalFilter } from './selectors';

const DEFAULT_CLICK_TIMEOUT = 5000;

export class WidgetDetector {
  private page: Page;
  private config: BrowserWebSocketProtocolConfig;
  private wsDetected: boolean = false;
  private onWsDetected: (() => void) | null = null;
  private progressCallback?: (message: string, data?: Record<string, unknown>) => void;

  constructor(page: Page, config: BrowserWebSocketProtocolConfig) {
    this.page = page;
    this.config = config;
  }

  /**
   * Set a progress callback for reporting detection steps.
   */
  setOnProgress(callback: (message: string, data?: Record<string, unknown>) => void): void {
    this.progressCallback = callback;
  }

  private emitProgress(message: string, data?: Record<string, unknown>): void {
    this.progressCallback?.(message, data);
  }

  /**
   * Set a callback that's invoked when a WS connection is detected.
   * Called by the discovery service when WebSocketCapture detects a connection.
   */
  setWsDetectedCallback(callback: () => void): void {
    this.onWsDetected = callback;
  }

  /**
   * Notify that a WS connection was detected (external signal).
   */
  notifyWsDetected(): void {
    this.wsDetected = true;
    if (this.onWsDetected) {
      this.onWsDetected();
    }
  }

  /**
   * Main entry point: detect and click the chat widget using the configured strategy.
   */
  async detect(): Promise<void> {
    const { strategy, selector, steps } = this.config.widgetDetection;

    switch (strategy) {
      case 'selector':
        if (!selector) {
          throw new Error('Widget detection strategy "selector" requires a selector');
        }
        await this.detectBySelector(selector);
        break;

      case 'steps':
        if (!steps || steps.length === 0) {
          throw new Error('Widget detection strategy "steps" requires at least one step');
        }
        await this.executeSteps(steps);
        break;

      case 'heuristic':
      default:
        await this.detectHeuristic();
        break;
    }
  }

  /**
   * Heuristic strategy: try hint-derived selectors first, then generic selectors,
   * then positional matching.
   */
  private async detectHeuristic(): Promise<void> {
    const hints = this.config.widgetDetection.hints;
    const selectorsTried: Array<{ selector: string; found: boolean }> = [];

    // 1. Try hint-derived selectors first
    if (hints) {
      const hintSelectors = buildSelectorsFromHints(hints);
      for (const selector of hintSelectors) {
        this.emitProgress(`Trying hint selector: ${selector}`, { selector, source: 'hints' });
        const found = await this.tryClick(selector);
        selectorsTried.push({ selector, found });
        if (found) {
          this.emitProgress(`Widget found with hint selector: ${selector}`, { selector });
          return;
        }
      }
    }

    // 2. Fall back to generic heuristic selectors
    for (const selector of ALL_HEURISTIC_SELECTORS) {
      this.emitProgress(`Trying generic selector: ${selector}`, { selector, source: 'generic' });
      const found = await this.tryClick(selector);
      selectorsTried.push({ selector, found });
      if (found) {
        this.emitProgress(`Widget found with generic selector: ${selector}`, { selector });
        return;
      }
    }

    // 3. Try positional filter if position and elementType hints are provided
    if (hints?.position && hints?.elementType) {
      this.emitProgress('Trying positional matching', { position: hints.position, elementType: hints.elementType });
      const { selector, filterFn } = buildPositionalFilter(hints.position, hints.elementType);
      const viewport = this.page.viewportSize() || { width: 1280, height: 720 };

      const locator = this.page.locator(selector);
      const count = await locator.count();

      for (let i = 0; i < count; i++) {
        const element = locator.nth(i);
        const box = await element.boundingBox();
        if (box && filterFn(box, viewport)) {
          try {
            await element.click({ timeout: 2000 });
            const detected = await this.waitForWs(DEFAULT_CLICK_TIMEOUT);
            if (detected) return;
          } catch {
            // Element not clickable or timed out, try next
          }
        }
      }
    }

    // Collect debug info before throwing
    let pageTitle = 'unknown';
    let pageUrl = 'unknown';
    let iframeCount = 0;
    try {
      pageTitle = await this.page.title();
      pageUrl = this.page.url();
      iframeCount = this.page.frames().length - 1; // subtract main frame
    } catch {
      // Best-effort debug info collection
    }

    const debugInfo = {
      pageTitle,
      pageUrl,
      iframeCount,
      selectorsTried: selectorsTried.length,
      selectorsDetail: selectorsTried,
    };

    this.emitProgress('Widget detection failed', debugInfo);

    throw new Error(
      `Heuristic widget detection failed: no widget found. ` +
      `Tried ${selectorsTried.length} selectors. ` +
      `Page: "${pageTitle}" (${iframeCount} iframes)`
    );
  }

  /**
   * Selector strategy: click a specific CSS selector.
   */
  private async detectBySelector(selector: string): Promise<void> {
    const locator = await this.findInFrames(selector);
    if (!locator) {
      throw new Error(`Widget selector "${selector}" not found on page or in any iframe`);
    }

    await locator.click({ timeout: this.config.widgetDetection.timeout || 15000 });
  }

  /**
   * Steps strategy: execute an ordered list of interaction steps.
   */
  private async executeSteps(steps: InteractionStep[]): Promise<void> {
    for (const step of steps) {
      await this.executeStep(step);
    }
  }

  /**
   * Try clicking a selector and wait for WS connection.
   * Returns true if a WS connection was detected after clicking.
   */
  private async tryClick(selector: string, timeout?: number): Promise<boolean> {
    const effectiveTimeout = timeout ?? DEFAULT_CLICK_TIMEOUT;

    try {
      // Try to find the element across all frames
      const locator = await this.findInFrames(selector);
      if (!locator) return false;

      // Check visibility
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible) return false;

      // Click the element
      await locator.click({ timeout: 2000 });

      // Wait for WS detection
      return await this.waitForWs(effectiveTimeout);
    } catch {
      return false;
    }
  }

  /**
   * Wait for wsDetected to become true within the given timeout.
   */
  private waitForWs(timeout: number): Promise<boolean> {
    if (this.wsDetected) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(this.wsDetected);
      }, timeout);

      // Store original callback so we can resolve early on WS detection
      const prevCallback = this.onWsDetected;
      this.onWsDetected = () => {
        clearTimeout(timer);
        prevCallback?.();
        resolve(true);
      };
    });
  }

  /**
   * Execute a single interaction step.
   */
  private async executeStep(step: InteractionStep): Promise<void> {
    const stepTimeout = step.timeout || 10000;

    switch (step.action) {
      case 'click':
        if (!step.selector) throw new Error('Click step requires a selector');
        await this.page.locator(step.selector).click({ timeout: stepTimeout });
        break;

      case 'type':
        if (!step.selector) throw new Error('Type step requires a selector');
        if (!step.value) throw new Error('Type step requires a value');
        await this.page.locator(step.selector).fill(step.value, { timeout: stepTimeout });
        break;

      case 'wait':
        if (!step.value) throw new Error('Wait step requires a value (duration in ms)');
        await this.page.waitForTimeout(parseInt(step.value, 10));
        break;

      case 'waitForSelector':
        if (!step.selector) throw new Error('WaitForSelector step requires a selector');
        await this.page.waitForSelector(step.selector, { timeout: stepTimeout });
        break;

      case 'evaluate':
        if (!step.script) throw new Error('Evaluate step requires a script');
        await this.page.evaluate(step.script);
        break;

      default:
        throw new Error(`Unknown step action: ${(step as InteractionStep).action}`);
    }
  }

  /**
   * Find an element across all frames (main page + iframes).
   * Supports Playwright's >> piercing locator for Shadow DOM.
   */
  private async findInFrames(selector: string): Promise<Locator | null> {
    // First check the main page
    const mainLocator = this.page.locator(selector);
    const mainCount = await mainLocator.count().catch(() => 0);
    if (mainCount > 0) {
      return mainLocator.first();
    }

    // Then check all iframes
    const frames: Frame[] = this.page.frames();
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue;

      try {
        const frameLocator = frame.locator(selector);
        const frameCount = await frameLocator.count();
        if (frameCount > 0) {
          return frameLocator.first();
        }
      } catch {
        // Frame may be detached or inaccessible
      }
    }

    return null;
  }
}
