import { describe, it, expect, vi } from 'vitest';
import { CredentialExtractor } from '@/lib/connectors/browser/credential-extractor';
import type { Page, BrowserContext } from 'playwright';

/**
 * Creates a mock Playwright BrowserContext with configurable cookies.
 */
function createMockContext(
  cookies: Array<{ name: string; value: string; domain: string; [key: string]: unknown }> = []
): BrowserContext {
  return {
    cookies: vi.fn().mockResolvedValue(cookies),
  } as unknown as BrowserContext;
}

/**
 * Creates a mock Playwright Page with configurable localStorage and sessionStorage.
 */
function createMockPage(
  localStorage: Record<string, string> = {},
  sessionStorage: Record<string, string> = {}
): Page {
  return {
    evaluate: vi.fn().mockImplementation((fn: () => Record<string, string>) => {
      // Determine which storage is being accessed by inspecting the function source
      const fnStr = fn.toString();
      if (fnStr.includes('sessionStorage')) {
        return Promise.resolve(sessionStorage);
      }
      return Promise.resolve(localStorage);
    }),
  } as unknown as Page;
}

describe('CredentialExtractor', () => {
  describe('extract', () => {
    it('should extract cookies, localStorage, and sessionStorage together', async () => {
      const mockCookies = [
        { name: 'session_id', value: 'abc123', domain: '.example.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
        { name: 'csrf', value: 'token456', domain: '.example.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Strict' as const },
      ];
      const mockLocalStorage = { 'auth_token': 'jwt-xyz', 'user_id': '42' };
      const mockSessionStorage = { 'chat_session': 'sess-789' };

      const context = createMockContext(mockCookies);
      const page = createMockPage(mockLocalStorage, mockSessionStorage);

      const result = await CredentialExtractor.extract(page, context);

      expect(result.cookies).toHaveLength(2);
      expect(result.cookies[0]).toEqual({ name: 'session_id', value: 'abc123', domain: '.example.com' });
      expect(result.cookies[1]).toEqual({ name: 'csrf', value: 'token456', domain: '.example.com' });
      expect(result.localStorage).toEqual(mockLocalStorage);
      expect(result.sessionStorage).toEqual(mockSessionStorage);
    });

    it('should handle empty browser state gracefully', async () => {
      const context = createMockContext([]);
      const page = createMockPage({}, {});

      const result = await CredentialExtractor.extract(page, context);

      expect(result.cookies).toEqual([]);
      expect(result.localStorage).toEqual({});
      expect(result.sessionStorage).toEqual({});
    });

    it('should extract only name, value, and domain from cookies', async () => {
      const mockCookies = [
        {
          name: 'session',
          value: 's3cr3t',
          domain: '.app.com',
          path: '/app',
          expires: 9999999999,
          httpOnly: true,
          secure: true,
          sameSite: 'None' as const,
        },
      ];
      const context = createMockContext(mockCookies);
      const page = createMockPage();

      const result = await CredentialExtractor.extract(page, context);

      // Should only have the 3 fields we care about
      expect(result.cookies[0]).toEqual({
        name: 'session',
        value: 's3cr3t',
        domain: '.app.com',
      });
      expect(Object.keys(result.cookies[0])).toHaveLength(3);
    });

    it('should run all extractions in parallel', async () => {
      let resolveCount = 0;

      const context = {
        cookies: vi.fn().mockImplementation(() => {
          resolveCount++;
          return Promise.resolve([]);
        }),
      } as unknown as BrowserContext;

      const page = {
        evaluate: vi.fn().mockImplementation(() => {
          resolveCount++;
          return Promise.resolve({});
        }),
      } as unknown as Page;

      await CredentialExtractor.extract(page, context);

      // cookies + localStorage + sessionStorage = 3 calls
      expect(resolveCount).toBe(3);
      expect(context.cookies).toHaveBeenCalledTimes(1);
      expect(page.evaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('cookie extraction error handling', () => {
    it('should return empty cookies when context.cookies() throws', async () => {
      const context = {
        cookies: vi.fn().mockRejectedValue(new Error('Browser context destroyed')),
      } as unknown as BrowserContext;
      const page = createMockPage();

      const result = await CredentialExtractor.extract(page, context);

      expect(result.cookies).toEqual([]);
    });
  });

  describe('localStorage extraction error handling', () => {
    it('should return empty localStorage when page.evaluate throws', async () => {
      const page = {
        evaluate: vi.fn().mockRejectedValue(new Error('Page navigated')),
      } as unknown as Page;
      const context = createMockContext();

      const result = await CredentialExtractor.extract(page, context);

      expect(result.localStorage).toEqual({});
      expect(result.sessionStorage).toEqual({});
    });
  });

  describe('large data sets', () => {
    it('should handle many cookies', async () => {
      const manyCookies = Array.from({ length: 50 }, (_, i) => ({
        name: `cookie_${i}`,
        value: `value_${i}`,
        domain: `.site${i}.com`,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      }));
      const context = createMockContext(manyCookies);
      const page = createMockPage();

      const result = await CredentialExtractor.extract(page, context);

      expect(result.cookies).toHaveLength(50);
      expect(result.cookies[49]).toEqual({
        name: 'cookie_49',
        value: 'value_49',
        domain: '.site49.com',
      });
    });

    it('should handle many localStorage entries', async () => {
      const manyEntries: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        manyEntries[`key_${i}`] = `val_${i}`;
      }
      const page = createMockPage(manyEntries);
      const context = createMockContext();

      const result = await CredentialExtractor.extract(page, context);

      expect(Object.keys(result.localStorage)).toHaveLength(100);
      expect(result.localStorage['key_99']).toBe('val_99');
    });
  });

  describe('buildCookieHeader', () => {
    it('should format cookies as semicolon-separated name=value pairs', () => {
      const cookies = [
        { name: 'session', value: 'abc' },
        { name: 'csrf', value: 'xyz' },
        { name: 'tracking', value: '123' },
      ];
      const header = CredentialExtractor.buildCookieHeader(cookies);
      expect(header).toBe('session=abc; csrf=xyz; tracking=123');
    });

    it('should return single cookie without trailing semicolon', () => {
      const cookies = [{ name: 'token', value: 'jwt-xxx' }];
      const header = CredentialExtractor.buildCookieHeader(cookies);
      expect(header).toBe('token=jwt-xxx');
    });

    it('should return empty string for empty array', () => {
      const header = CredentialExtractor.buildCookieHeader([]);
      expect(header).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(CredentialExtractor.buildCookieHeader(null as unknown as Array<{ name: string; value: string }>)).toBe('');
      expect(CredentialExtractor.buildCookieHeader(undefined as unknown as Array<{ name: string; value: string }>)).toBe('');
    });

    it('should handle cookies with special characters in values', () => {
      const cookies = [
        { name: 'data', value: 'hello%20world' },
        { name: 'json', value: '{"key":"val"}' },
      ];
      const header = CredentialExtractor.buildCookieHeader(cookies);
      expect(header).toBe('data=hello%20world; json={"key":"val"}');
    });

    it('should handle cookies with empty values', () => {
      const cookies = [
        { name: 'empty', value: '' },
        { name: 'full', value: 'abc' },
      ];
      const header = CredentialExtractor.buildCookieHeader(cookies);
      expect(header).toBe('empty=; full=abc');
    });
  });
});
