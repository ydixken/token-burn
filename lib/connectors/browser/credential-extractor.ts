/**
 * Credential Extractor
 *
 * Extracts cookies, localStorage, and sessionStorage from a Playwright browser
 * context and page. These credentials are used to reconstruct authenticated
 * WebSocket connections outside of the browser.
 */

import type { Page, BrowserContext } from 'playwright';

export class CredentialExtractor {
  /**
   * Extract all credentials from the browser context and page.
   *
   * Collects cookies from the BrowserContext and storage data from the Page
   * via page.evaluate calls. All extractions are performed in parallel.
   *
   * @param page - The Playwright Page to extract storage from
   * @param context - The Playwright BrowserContext to extract cookies from
   * @returns An object containing cookies, localStorage, and sessionStorage
   */
  static async extract(
    page: Page,
    context: BrowserContext
  ): Promise<{
    cookies: Array<{ name: string; value: string; domain: string }>;
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  }> {
    const [cookies, localStorage, sessionStorage] = await Promise.all([
      this.extractCookies(context),
      this.extractLocalStorage(page),
      this.extractSessionStorage(page),
    ]);

    return { cookies, localStorage, sessionStorage };
  }

  /**
   * Extract cookies from the browser context.
   *
   * Uses the Playwright BrowserContext.cookies() API which returns all cookies
   * for the context. We map them to a simplified format containing only the
   * fields needed for WebSocket connection replay.
   *
   * @param context - The Playwright BrowserContext
   * @returns Array of cookies with name, value, and domain
   */
  private static async extractCookies(
    context: BrowserContext
  ): Promise<Array<{ name: string; value: string; domain: string }>> {
    try {
      const allCookies = await context.cookies();
      return allCookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Extract all localStorage key-value pairs from the page.
   *
   * Executes a script in the page context to enumerate all localStorage entries.
   * This captures authentication tokens, session IDs, and other state that
   * chat widgets often store in localStorage.
   *
   * @param page - The Playwright Page
   * @returns A Record of localStorage key-value pairs
   */
  private static async extractLocalStorage(
    page: Page
  ): Promise<Record<string, string>> {
    try {
      return await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key !== null) {
            items[key] = localStorage.getItem(key) ?? '';
          }
        }
        return items;
      });
    } catch {
      return {};
    }
  }

  /**
   * Extract all sessionStorage key-value pairs from the page.
   *
   * Similar to localStorage extraction, but targets sessionStorage which
   * persists only for the browser tab's lifetime. Some chat widgets store
   * conversation state or session tokens here.
   *
   * @param page - The Playwright Page
   * @returns A Record of sessionStorage key-value pairs
   */
  private static async extractSessionStorage(
    page: Page
  ): Promise<Record<string, string>> {
    try {
      return await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key !== null) {
            items[key] = sessionStorage.getItem(key) ?? '';
          }
        }
        return items;
      });
    } catch {
      return {};
    }
  }

  /**
   * Build a Cookie header string from extracted cookies.
   *
   * Formats an array of cookies into a semicolon-separated string suitable
   * for use as an HTTP Cookie header value.
   *
   * @param cookies - Array of cookies with name and value
   * @returns A formatted Cookie header string (e.g. "name1=value1; name2=value2")
   */
  static buildCookieHeader(
    cookies: Array<{ name: string; value: string }>
  ): string {
    if (!cookies || cookies.length === 0) {
      return '';
    }
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }
}
