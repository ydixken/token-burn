/**
 * WebSocket Capture
 *
 * Intercepts WebSocket connections on a Playwright page using the native
 * `page.on('websocket')` event and Chrome DevTools Protocol (CDP) to capture
 * upgrade request headers that are not available through Playwright alone.
 *
 * Usage:
 *   const capture = new WebSocketCapture(page);
 *   await capture.attach();       // before navigating
 *   await page.goto(url);
 *   const ws = await capture.waitForWebSocket({ urlPattern: 'socket.io' });
 *   await capture.detach();
 */

import type { Page, CDPSession } from "playwright";
import type { CapturedWebSocket, CapturedFrame } from "./types";

/**
 * Options for filtering and waiting on a specific WebSocket connection.
 */
export interface WaitForWebSocketOptions {
  /** Regex pattern string to match against the WebSocket URL */
  urlPattern?: string;
  /** Which matching connection to return (0-based, default: 0) */
  index?: number;
  /** Maximum wait time in milliseconds (default: 15000) */
  timeout?: number;
  /** Wait until at least this many frames have been captured (default: 2) */
  minFrames?: number;
}

/**
 * Test whether a URL matches a regex pattern string.
 *
 * Exported so it can be unit-tested independently without mocking Playwright.
 */
export function matchesUrlPattern(url: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(url);
  } catch {
    // If the pattern is not a valid regex, fall back to simple includes check.
    return url.includes(pattern);
  }
}

export class WebSocketCapture {
  private page: Page;
  private cdpSession: CDPSession | null = null;
  private capturedConnections: CapturedWebSocket[] = [];
  private upgradeHeaders: Map<string, Record<string, string>> = new Map();
  private attached = false;

  /** Listener references for cleanup */
  private wsListener: ((ws: import("playwright").WebSocket) => void) | null =
    null;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Attach listeners to the page to start capturing WebSocket connections.
   *
   * Must be called BEFORE navigating to the target page so that connections
   * initiated during page load are captured.
   *
   * Internally:
   * 1. Creates a CDP session for the page to intercept network-level events.
   * 2. Listens for `Network.webSocketWillSendHandshakeRequest` to capture
   *    the HTTP upgrade request headers (Origin, Cookie, etc.).
   * 3. Listens for Playwright's `page.on('websocket')` to capture frames.
   */
  async attach(): Promise<void> {
    if (this.attached) {
      return;
    }

    // Create a CDP session to capture upgrade headers.
    this.cdpSession = await this.page.context().newCDPSession(this.page);
    await this.cdpSession.send("Network.enable");

    // Capture upgrade request headers via CDP.
    this.cdpSession.on(
      "Network.webSocketWillSendHandshakeRequest",
      (event: {
        requestId: string;
        request: { headers: Record<string, string>; url?: string };
      }) => {
        const url = event.request.url;
        if (url) {
          this.upgradeHeaders.set(url, { ...event.request.headers });
        }
      },
    );

    // Use Playwright's native WebSocket event for frame capture.
    this.wsListener = (ws: import("playwright").WebSocket) => {
      const url = ws.url();

      // Build the captured connection entry.
      const captured: CapturedWebSocket = {
        url,
        frames: [],
        headers: this.upgradeHeaders.get(url) ?? {},
        createdAt: Date.now(),
      };

      this.capturedConnections.push(captured);

      // Capture sent frames.
      ws.on("framesent", (data: { payload: string | Buffer }) => {
        const frame: CapturedFrame = {
          direction: "sent",
          data: typeof data.payload === "string" ? data.payload : data.payload.toString("utf-8"),
          timestamp: Date.now(),
        };
        captured.frames.push(frame);
      });

      // Capture received frames.
      ws.on("framereceived", (data: { payload: string | Buffer }) => {
        const frame: CapturedFrame = {
          direction: "received",
          data: typeof data.payload === "string" ? data.payload : data.payload.toString("utf-8"),
          timestamp: Date.now(),
        };
        captured.frames.push(frame);

        // Backfill headers: CDP event may arrive after the Playwright WS event
        // for the same URL. Re-check the map on each frame.
        if (
          Object.keys(captured.headers).length === 0 &&
          this.upgradeHeaders.has(url)
        ) {
          captured.headers = this.upgradeHeaders.get(url)!;
        }
      });
    };

    this.page.on("websocket", this.wsListener);
    this.attached = true;
  }

  /**
   * Wait for a WebSocket connection matching the given criteria.
   *
   * Polls `capturedConnections` until a matching entry has accumulated enough
   * frames, or throws when the timeout is exceeded.
   *
   * @param options - Filtering and timing options
   * @returns The matching `CapturedWebSocket`
   * @throws Error if no matching connection is found within the timeout
   */
  async waitForWebSocket(
    options: WaitForWebSocketOptions = {},
  ): Promise<CapturedWebSocket> {
    const {
      urlPattern,
      index = 0,
      timeout = 15_000,
      minFrames = 2,
    } = options;

    const deadline = Date.now() + timeout;
    const pollInterval = 100;

    while (Date.now() < deadline) {
      const match = this.findMatch(urlPattern, index, minFrames);
      if (match) {
        return match;
      }
      await this.sleep(pollInterval);
    }

    // One final check after the loop (avoids off-by-one on tight timeouts).
    const lastCheck = this.findMatch(urlPattern, index, minFrames);
    if (lastCheck) {
      return lastCheck;
    }

    // Build a descriptive error message.
    const matchingCount = this.getMatchingConnections(urlPattern).length;
    const totalCount = this.capturedConnections.length;

    let message = `WebSocket capture timed out after ${timeout}ms.`;
    if (urlPattern) {
      message += ` Pattern: /${urlPattern}/`;
    }
    message += ` Found ${totalCount} total connection(s), ${matchingCount} matching.`;

    if (matchingCount > 0 && matchingCount <= index) {
      message += ` Requested index ${index} but only ${matchingCount} match(es) exist.`;
    } else if (matchingCount > 0) {
      const target = this.getMatchingConnections(urlPattern)[index];
      if (target) {
        message += ` Match has ${target.frames.length} frame(s), need ${minFrames}.`;
      }
    }

    throw new Error(message);
  }

  /**
   * Get all captured WebSocket connections.
   */
  getCapturedConnections(): CapturedWebSocket[] {
    return [...this.capturedConnections];
  }

  /**
   * Get a specific captured connection by index.
   *
   * @param index - Zero-based index into the captured connections array
   * @returns The connection or `undefined` if the index is out of bounds
   */
  getConnection(index: number): CapturedWebSocket | undefined {
    return this.capturedConnections[index];
  }

  /**
   * Detach all listeners and close the CDP session.
   *
   * Safe to call multiple times.
   */
  async detach(): Promise<void> {
    if (!this.attached) {
      return;
    }

    // Remove the Playwright websocket listener.
    if (this.wsListener) {
      this.page.removeListener("websocket", this.wsListener);
      this.wsListener = null;
    }

    // Close the CDP session.
    if (this.cdpSession) {
      try {
        await this.cdpSession.send("Network.disable");
      } catch {
        // Session may already be closed (e.g. page navigated away).
      }
      try {
        await this.cdpSession.detach();
      } catch {
        // Ignore detach errors.
      }
      this.cdpSession = null;
    }

    this.attached = false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Find a matching captured connection.
   */
  private findMatch(
    urlPattern: string | undefined,
    index: number,
    minFrames: number,
  ): CapturedWebSocket | null {
    const matches = this.getMatchingConnections(urlPattern);

    if (matches.length <= index) {
      return null;
    }

    const target = matches[index];
    if (target.frames.length >= minFrames) {
      return target;
    }

    return null;
  }

  /**
   * Filter captured connections by URL pattern.
   */
  private getMatchingConnections(
    urlPattern: string | undefined,
  ): CapturedWebSocket[] {
    if (!urlPattern) {
      return this.capturedConnections;
    }
    return this.capturedConnections.filter((c) =>
      matchesUrlPattern(c.url, urlPattern),
    );
  }

  /**
   * Promise-based sleep.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
