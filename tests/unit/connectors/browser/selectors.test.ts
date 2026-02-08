import { describe, it, expect } from 'vitest';
import {
  IFRAME_SELECTORS,
  ARIA_SELECTORS,
  CLASS_ID_SELECTORS,
  TEXT_SELECTORS,
  ALL_HEURISTIC_SELECTORS,
  buildSelectorsFromHints,
  buildPositionalFilter,
} from '@/lib/connectors/browser/selectors';
import type { WidgetHints } from '@/lib/connectors/browser/types';

describe('Heuristic Selector Lists', () => {
  it('should have iframe selectors targeting known providers', () => {
    expect(IFRAME_SELECTORS.length).toBeGreaterThan(0);
    expect(IFRAME_SELECTORS).toContain('iframe[src*="intercom"]');
    expect(IFRAME_SELECTORS).toContain('iframe[src*="drift"]');
    expect(IFRAME_SELECTORS).toContain('iframe[src*="zendesk"]');
    expect(IFRAME_SELECTORS).toContain('iframe[src*="tawk"]');
    expect(IFRAME_SELECTORS).toContain('iframe[src*="crisp"]');
  });

  it('should have ARIA selectors for accessibility attributes', () => {
    expect(ARIA_SELECTORS.length).toBeGreaterThan(0);
    expect(ARIA_SELECTORS).toContain('[aria-label*="chat" i]');
    expect(ARIA_SELECTORS).toContain('[data-testid*="chat"]');
  });

  it('should have class/ID selectors for common patterns', () => {
    expect(CLASS_ID_SELECTORS.length).toBeGreaterThan(0);
    expect(CLASS_ID_SELECTORS).toContain('[class*="chat-widget"]');
    expect(CLASS_ID_SELECTORS).toContain('[id*="chatbot"]');
  });

  it('should have text selectors for visible chat button text', () => {
    expect(TEXT_SELECTORS.length).toBeGreaterThan(0);
    expect(TEXT_SELECTORS).toContain('button:has-text("Chat")');
    expect(TEXT_SELECTORS).toContain('button:has-text("Jetzt chatten")');
  });

  describe('ALL_HEURISTIC_SELECTORS', () => {
    it('should contain all individual selector lists', () => {
      for (const sel of IFRAME_SELECTORS) {
        expect(ALL_HEURISTIC_SELECTORS).toContain(sel);
      }
      for (const sel of ARIA_SELECTORS) {
        expect(ALL_HEURISTIC_SELECTORS).toContain(sel);
      }
      for (const sel of CLASS_ID_SELECTORS) {
        expect(ALL_HEURISTIC_SELECTORS).toContain(sel);
      }
      for (const sel of TEXT_SELECTORS) {
        expect(ALL_HEURISTIC_SELECTORS).toContain(sel);
      }
    });

    it('should maintain priority order: iframes → ARIA → class/ID → text', () => {
      const iframeEnd = ALL_HEURISTIC_SELECTORS.indexOf(IFRAME_SELECTORS[IFRAME_SELECTORS.length - 1]);
      const ariaStart = ALL_HEURISTIC_SELECTORS.indexOf(ARIA_SELECTORS[0]);
      const ariaEnd = ALL_HEURISTIC_SELECTORS.indexOf(ARIA_SELECTORS[ARIA_SELECTORS.length - 1]);
      const classStart = ALL_HEURISTIC_SELECTORS.indexOf(CLASS_ID_SELECTORS[0]);
      const classEnd = ALL_HEURISTIC_SELECTORS.indexOf(CLASS_ID_SELECTORS[CLASS_ID_SELECTORS.length - 1]);
      const textStart = ALL_HEURISTIC_SELECTORS.indexOf(TEXT_SELECTORS[0]);

      expect(iframeEnd).toBeLessThan(ariaStart);
      expect(ariaEnd).toBeLessThan(classStart);
      expect(classEnd).toBeLessThan(textStart);
    });

    it('should have the correct total count', () => {
      const expectedLength =
        IFRAME_SELECTORS.length +
        ARIA_SELECTORS.length +
        CLASS_ID_SELECTORS.length +
        TEXT_SELECTORS.length;
      expect(ALL_HEURISTIC_SELECTORS.length).toBe(expectedLength);
    });

    it('should have no duplicate entries', () => {
      const unique = new Set(ALL_HEURISTIC_SELECTORS);
      expect(unique.size).toBe(ALL_HEURISTIC_SELECTORS.length);
    });
  });
});

describe('buildSelectorsFromHints', () => {
  it('should return empty array for empty hints', () => {
    const result = buildSelectorsFromHints({});
    expect(result).toEqual([]);
  });

  it('should return empty array for null-like hints', () => {
    const result = buildSelectorsFromHints(null as unknown as WidgetHints);
    expect(result).toEqual([]);
  });

  describe('buttonText', () => {
    it('should generate button, a, and div[role=button] selectors for each text', () => {
      const hints: WidgetHints = {
        buttonText: ['Chat starten'],
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([
        'button:has-text("Chat starten")',
        'a:has-text("Chat starten")',
        'div[role="button"]:has-text("Chat starten")',
      ]);
    });

    it('should generate selectors for multiple button texts in order', () => {
      const hints: WidgetHints = {
        buttonText: ['Jetzt Chatten', 'Help'],
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toHaveLength(6);
      expect(result[0]).toBe('button:has-text("Jetzt Chatten")');
      expect(result[1]).toBe('a:has-text("Jetzt Chatten")');
      expect(result[2]).toBe('div[role="button"]:has-text("Jetzt Chatten")');
      expect(result[3]).toBe('button:has-text("Help")');
      expect(result[4]).toBe('a:has-text("Help")');
      expect(result[5]).toBe('div[role="button"]:has-text("Help")');
    });

    it('should skip buttonText if array is empty', () => {
      const hints: WidgetHints = { buttonText: [] };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([]);
    });
  });

  describe('containsClass', () => {
    it('should generate class*= selectors for each class name', () => {
      const hints: WidgetHints = {
        containsClass: ['chat-widget', 'launcher'],
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([
        '[class*="chat-widget"]',
        '[class*="launcher"]',
      ]);
    });
  });

  describe('containsId', () => {
    it('should generate id*= selectors for each ID fragment', () => {
      const hints: WidgetHints = {
        containsId: ['chat-btn', 'widget-toggle'],
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([
        '[id*="chat-btn"]',
        '[id*="widget-toggle"]',
      ]);
    });
  });

  describe('iframeSrc', () => {
    it('should generate iframe src*= selectors for each pattern', () => {
      const hints: WidgetHints = {
        iframeSrc: ['intercom', 'drift'],
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([
        'iframe[src*="intercom"]',
        'iframe[src*="drift"]',
      ]);
    });
  });

  describe('dataAttributes', () => {
    it('should generate exact attribute selectors for each key-value pair', () => {
      const hints: WidgetHints = {
        dataAttributes: {
          'data-widget': 'chat',
          'data-provider': 'custom',
        },
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([
        '[data-widget="chat"]',
        '[data-provider="custom"]',
      ]);
    });

    it('should skip dataAttributes if object is empty', () => {
      const hints: WidgetHints = { dataAttributes: {} };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual([]);
    });
  });

  describe('withinSelector scoping', () => {
    it('should scope all selectors to the container when withinSelector is set', () => {
      const hints: WidgetHints = {
        buttonText: ['Chat'],
        containsClass: ['widget'],
        withinSelector: '#app',
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toHaveLength(4);
      expect(result[0]).toBe('#app button:has-text("Chat")');
      expect(result[1]).toBe('#app a:has-text("Chat")');
      expect(result[2]).toBe('#app div[role="button"]:has-text("Chat")');
      expect(result[3]).toBe('#app [class*="widget"]');
    });

    it('should handle complex container selectors', () => {
      const hints: WidgetHints = {
        containsId: ['chat'],
        withinSelector: 'div.main-content > section',
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toEqual(['div.main-content > section [id*="chat"]']);
    });
  });

  describe('priority ordering', () => {
    it('should generate selectors in correct priority: buttonText → class → id → iframe → data', () => {
      const hints: WidgetHints = {
        buttonText: ['Chat'],
        containsClass: ['widget'],
        containsId: ['chat-btn'],
        iframeSrc: ['drift'],
        dataAttributes: { 'data-chat': 'true' },
      };
      const result = buildSelectorsFromHints(hints);

      // buttonText generates 3 selectors, then 1 class, 1 id, 1 iframe, 1 data
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('button:has-text("Chat")');
      expect(result[1]).toBe('a:has-text("Chat")');
      expect(result[2]).toBe('div[role="button"]:has-text("Chat")');
      expect(result[3]).toBe('[class*="widget"]');
      expect(result[4]).toBe('[id*="chat-btn"]');
      expect(result[5]).toBe('iframe[src*="drift"]');
      expect(result[6]).toBe('[data-chat="true"]');
    });
  });

  describe('combined hints with scoping', () => {
    it('should scope all combined selectors when withinSelector is present', () => {
      const hints: WidgetHints = {
        buttonText: ['Help'],
        iframeSrc: ['zendesk'],
        withinSelector: '.page-wrapper',
      };
      const result = buildSelectorsFromHints(hints);
      expect(result).toHaveLength(4);
      for (const sel of result) {
        expect(sel).toMatch(/^\.page-wrapper /);
      }
    });
  });
});

describe('buildPositionalFilter', () => {
  const viewport = { width: 1280, height: 720 };

  it('should return a selector and filter function', () => {
    const result = buildPositionalFilter('bottom-right', 'button');
    expect(result.selector).toBe('button');
    expect(typeof result.filterFn).toBe('function');
  });

  it('should use broad selector for "any" element type', () => {
    const result = buildPositionalFilter('bottom-right', 'any');
    expect(result.selector).toContain('button');
    expect(result.selector).toContain('iframe');
  });

  describe('bottom-right filter', () => {
    it('should accept elements in the bottom-right quadrant', () => {
      const { filterFn } = buildPositionalFilter('bottom-right', 'button');
      // Element at bottom-right: x=1100, y=650
      expect(filterFn({ x: 1100, y: 650, width: 60, height: 60 }, viewport)).toBe(true);
    });

    it('should reject elements in the top-left', () => {
      const { filterFn } = buildPositionalFilter('bottom-right', 'button');
      expect(filterFn({ x: 10, y: 10, width: 60, height: 60 }, viewport)).toBe(false);
    });

    it('should reject elements at the bottom-left', () => {
      const { filterFn } = buildPositionalFilter('bottom-right', 'button');
      expect(filterFn({ x: 10, y: 650, width: 60, height: 60 }, viewport)).toBe(false);
    });
  });

  describe('bottom-left filter', () => {
    it('should accept elements in the bottom-left area', () => {
      const { filterFn } = buildPositionalFilter('bottom-left', 'div');
      expect(filterFn({ x: 10, y: 650, width: 60, height: 60 }, viewport)).toBe(true);
    });

    it('should reject elements at the bottom-right', () => {
      const { filterFn } = buildPositionalFilter('bottom-left', 'div');
      expect(filterFn({ x: 1100, y: 650, width: 60, height: 60 }, viewport)).toBe(false);
    });
  });

  describe('bottom-center filter', () => {
    it('should accept elements in the bottom-center area', () => {
      const { filterFn } = buildPositionalFilter('bottom-center', 'button');
      // Center of viewport horizontally
      expect(filterFn({ x: 580, y: 650, width: 100, height: 50 }, viewport)).toBe(true);
    });

    it('should reject elements at the far right', () => {
      const { filterFn } = buildPositionalFilter('bottom-center', 'button');
      expect(filterFn({ x: 1200, y: 650, width: 60, height: 60 }, viewport)).toBe(false);
    });
  });

  describe('custom/unknown position', () => {
    it('should accept any element in the bottom 30% for custom position', () => {
      const { filterFn } = buildPositionalFilter('custom', 'button');
      expect(filterFn({ x: 10, y: 650, width: 60, height: 60 }, viewport)).toBe(true);
      expect(filterFn({ x: 1100, y: 650, width: 60, height: 60 }, viewport)).toBe(true);
    });

    it('should reject elements in the top portion for custom position', () => {
      const { filterFn } = buildPositionalFilter('custom', 'button');
      expect(filterFn({ x: 640, y: 100, width: 60, height: 60 }, viewport)).toBe(false);
    });
  });
});
