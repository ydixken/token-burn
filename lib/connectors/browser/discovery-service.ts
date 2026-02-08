/**
 * Browser Discovery Service
 *
 * Orchestrates the full browser-based WebSocket discovery flow:
 * 1. Launch a headless Chromium browser via Playwright
 * 2. Navigate to the target page
 * 3. Detect and click the chat widget
 * 4. Capture the resulting WebSocket connection (URL, headers, frames)
 * 5. Detect the protocol (raw WS vs Socket.IO)
 * 6. Extract credentials (cookies, localStorage, sessionStorage)
 * 7. Cache the result in Redis for reuse
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import type {
  BrowserWebSocketProtocolConfig,
  DiscoveryResult,
  BrowserDiscoveryOptions,
} from "./types";
import { WebSocketCapture } from "./ws-capture";
import { WidgetDetector } from "./widget-detector";
import { CredentialExtractor } from "./credential-extractor";
import { ProtocolDetector } from "./protocol-detector";
import { redis } from "@/lib/cache/redis";

const CACHE_PREFIX = "krawall:discovery:";
const DEFAULT_SESSION_MAX_AGE = 300_000; // 5 minutes

export class BrowserDiscoveryService {
  private static browserInstance: Browser | null = null;

  /**
   * Run the full discovery flow: navigate to a page, find the chat widget,
   * capture the WebSocket connection, detect protocol, extract credentials.
   */
  static async discover(options: BrowserDiscoveryOptions): Promise<DiscoveryResult> {
    const { config, targetId, onProgress, forceFresh } = options;

    // 1. Check Redis cache first (skip if forceFresh)
    if (!forceFresh) {
      const cached = await this.getCached(targetId);
      if (cached) {
        onProgress?.("Using cached discovery result");
        return cached;
      }
    }

    onProgress?.("Starting browser discovery");

    const browser = await this.getBrowser(config);
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let wsCapture: WebSocketCapture | null = null;

    try {
      // 2. Create a new browser context
      const contextOptions: Record<string, unknown> = {};
      if (config.browser?.viewport) {
        contextOptions.viewport = config.browser.viewport;
      }
      if (config.browser?.userAgent) {
        contextOptions.userAgent = config.browser.userAgent;
      }
      if (config.browser?.proxy) {
        contextOptions.proxy = config.browser.proxy;
      }

      context = await browser.newContext(contextOptions);

      // 3. Create a new page
      page = await context.newPage();

      // 4. Create WebSocketCapture and attach before navigation
      wsCapture = new WebSocketCapture(page);
      await wsCapture.attach();
      onProgress?.("WebSocket capture attached");

      // 5. Navigate to the target page
      onProgress?.(`Navigating to ${config.pageUrl}`);
      try {
        await page.goto(config.pageUrl, { waitUntil: "networkidle", timeout: 30_000 });
      } catch (error) {
        throw new Error(
          `Failed to navigate to ${config.pageUrl}: ${(error as Error).message}`
        );
      }
      onProgress?.("Page loaded");

      // 5b. Dismiss cookie consent banners (common on EU sites)
      await this.dismissCookieBanners(page, onProgress);

      // 6. Create WidgetDetector
      const widgetDetector = new WidgetDetector(page, config);
      widgetDetector.setOnProgress((message, data) => {
        onProgress?.(`[Widget] ${message}`);
      });

      // 7. Set up WS detection callback: notify WidgetDetector when WS is captured
      const originalWsListener = page.on.bind(page);
      // We use a simpler approach: poll captured connections in the widget detector callback
      widgetDetector.setWsDetectedCallback(() => {
        // This is called by the capture when a WS is detected
      });

      // Wire up: when WebSocketCapture captures a new connection, notify the detector
      // We do this by monitoring the capture's connections list via a page websocket event
      const notifyDetector = () => {
        if (wsCapture && wsCapture.getCapturedConnections().length > 0) {
          widgetDetector.notifyWsDetected();
        }
      };

      // Listen for new WS connections and notify the detector
      page.on("websocket", () => {
        // Give frames a moment to arrive before notifying
        setTimeout(notifyDetector, 500);
      });

      // 8. Detect and click the widget
      onProgress?.("Detecting chat widget");
      try {
        await widgetDetector.detect();
      } catch (error) {
        throw new Error(
          `Widget detection failed on ${config.pageUrl}: ${(error as Error).message}. ` +
          `Try using a different detection strategy or providing more specific hints.`
        );
      }
      onProgress?.("Widget activated");

      // 9. Wait for WebSocket connection
      onProgress?.("Waiting for WebSocket connection");
      const wsFilterOptions: {
        urlPattern?: string;
        index?: number;
        timeout?: number;
      } = {
        timeout: config.widgetDetection.timeout || 15_000,
      };
      if (config.wsFilter?.urlPattern) {
        wsFilterOptions.urlPattern = config.wsFilter.urlPattern;
      }
      if (config.wsFilter?.index !== undefined) {
        wsFilterOptions.index = config.wsFilter.index;
      }

      let capturedWs;
      try {
        capturedWs = await wsCapture.waitForWebSocket(wsFilterOptions);
      } catch (error) {
        throw new Error(
          `No WebSocket connection detected on ${config.pageUrl}: ${(error as Error).message}. ` +
          `Ensure the chat widget opens a WebSocket connection.`
        );
      }
      onProgress?.(`WebSocket captured: ${capturedWs.url}`);

      // 10. Wait for frames to accumulate (handshake completion)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 11. Detect protocol
      onProgress?.("Detecting protocol");
      const protocolResult = ProtocolDetector.detect(capturedWs.url, capturedWs.frames);

      // Override protocol if explicitly configured
      let detectedProtocol = protocolResult.protocol;
      let socketIoConfig = protocolResult.socketIoConfig;
      if (config.protocol?.type && config.protocol.type !== "auto") {
        detectedProtocol = config.protocol.type;
        if (config.protocol.type === "raw") {
          socketIoConfig = undefined;
        }
      }

      // 12. Extract credentials
      onProgress?.("Extracting credentials");
      const credentials = await CredentialExtractor.extract(page, context);

      // 13. Build DiscoveryResult
      const result: DiscoveryResult = {
        wssUrl: capturedWs.url,
        cookies: credentials.cookies,
        headers: capturedWs.headers,
        localStorage: credentials.localStorage,
        sessionStorage: credentials.sessionStorage,
        capturedFrames: capturedWs.frames,
        detectedProtocol,
        socketIoConfig,
        discoveredAt: new Date(),
      };

      // 13b. Log discovered credentials for debugging
      onProgress?.(`Credentials: ${result.cookies.length} cookies, ${Object.keys(result.headers).length} headers, ${Object.keys(result.localStorage).length} localStorage, ${Object.keys(result.sessionStorage).length} sessionStorage`);
      if (result.cookies.length > 0) {
        onProgress?.(`Cookies: ${result.cookies.map(c => `${c.name}=${c.value.substring(0, 20)}${c.value.length > 20 ? "..." : ""} (${c.domain})`).join(", ")}`);
      }
      if (Object.keys(result.headers).length > 0) {
        onProgress?.(`Headers: ${Object.entries(result.headers).map(([k, v]) => `${k}: ${String(v).substring(0, 40)}${String(v).length > 40 ? "..." : ""}`).join(", ")}`);
      }
      onProgress?.(`Protocol: ${detectedProtocol}${socketIoConfig ? ` (SID: ${socketIoConfig.sid})` : ""}`);
      onProgress?.(`Frames captured: ${capturedWs.frames.length} (${capturedWs.frames.filter(f => f.direction === "sent").length} sent, ${capturedWs.frames.filter(f => f.direction === "received").length} received)`);

      // 14. Cache result in Redis
      const ttlMs = config.session?.maxAge ?? DEFAULT_SESSION_MAX_AGE;
      await this.setCached(targetId, result, ttlMs);
      onProgress?.("Discovery complete and cached");

      return result;
    } finally {
      // 15. Clean up resources
      if (wsCapture) {
        await wsCapture.detach().catch(() => {});
      }
      if (page) {
        await page.close().catch(() => {});
      }
      if (context) {
        await context.close().catch(() => {});
      }
      if (!config.session?.keepBrowserAlive) {
        await this.closeBrowser();
      }
    }
  }

  /**
   * Dismiss common cookie consent banners that block page interaction.
   * Tries known selectors for popular consent managers (OneTrust, CookieBot, etc.).
   */
  private static async dismissCookieBanners(
    page: Page,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const COOKIE_ACCEPT_SELECTORS = [
      // OneTrust
      "#onetrust-accept-btn-handler",
      ".onetrust-close-btn-handler",
      // CookieBot
      "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
      "#CybotCookiebotDialogBodyButtonAccept",
      // Generic patterns
      '[data-testid="cookie-accept"]',
      'button[data-action="accept"]',
      'button[id*="cookie"][id*="accept"]',
      'button[class*="cookie"][class*="accept"]',
      'button:has-text("Accept all")',
      'button:has-text("Alle akzeptieren")',
      'button:has-text("Accept All Cookies")',
      'button:has-text("Alle Cookies akzeptieren")',
    ];

    for (const selector of COOKIE_ACCEPT_SELECTORS) {
      try {
        const locator = page.locator(selector).first();
        const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
        if (visible) {
          await locator.click({ timeout: 3000 });
          onProgress?.(`Dismissed cookie banner (${selector})`);
          // Wait briefly for the banner to animate away
          await page.waitForTimeout(1000);
          return;
        }
      } catch {
        // Selector not found or not clickable, try next
      }
    }
  }

  /**
   * Get a cached discovery result from Redis.
   */
  static async getCached(targetId: string): Promise<DiscoveryResult | null> {
    try {
      const raw = await redis.get(`${CACHE_PREFIX}${targetId}`);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      // Restore Date object
      parsed.discoveredAt = new Date(parsed.discoveredAt);
      return parsed as DiscoveryResult;
    } catch {
      return null;
    }
  }

  /**
   * Cache a discovery result in Redis.
   */
  static async setCached(
    targetId: string,
    result: DiscoveryResult,
    ttlMs: number
  ): Promise<void> {
    try {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await redis.set(
        `${CACHE_PREFIX}${targetId}`,
        JSON.stringify(result),
        "EX",
        ttlSeconds
      );
    } catch {
      // Cache write failure is non-fatal
    }
  }

  /**
   * Close the shared browser instance.
   */
  static async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
      } catch {
        // Browser may already be closed
      }
      this.browserInstance = null;
    }
  }

  /**
   * Launch or reuse the shared Chromium browser instance.
   */
  private static async getBrowser(config: BrowserWebSocketProtocolConfig): Promise<Browser> {
    if (this.browserInstance?.isConnected()) {
      return this.browserInstance;
    }

    const launchOptions: Record<string, unknown> = {
      headless: config.browser?.headless !== false,
    };

    if (config.browser?.proxy) {
      launchOptions.proxy = config.browser.proxy;
    }

    this.browserInstance = await chromium.launch(launchOptions);
    return this.browserInstance;
  }
}
