/**
 * Browser Widget Heuristic Selectors
 *
 * Curated lists of CSS selectors for detecting common chat widgets,
 * organized by category and priority. Also provides utility functions
 * for dynamically building selectors from user-supplied WidgetHints.
 */

import type { WidgetHints } from './types';

// ---------------------------------------------------------------------------
// Heuristic Selector Lists (ordered by specificity / likelihood)
// ---------------------------------------------------------------------------

/** Selectors targeting known chat provider iframes */
export const IFRAME_SELECTORS: string[] = [
  'iframe[src*="intercom"]',
  'iframe[src*="drift"]',
  'iframe[src*="zendesk"]',
  'iframe[src*="livechat"]',
  'iframe[src*="tawk"]',
  'iframe[src*="hubspot"]',
  'iframe[src*="crisp"]',
  'iframe[src*="tidio"]',
  'iframe[src*="freshdesk"]',
  'iframe[src*="freshchat"]',
  'iframe[src*="olark"]',
  'iframe[src*="helpscout"]',
  'iframe[src*="chatwoot"]',
  'iframe[title*="chat" i]',
  'iframe[title*="Chat" i]',
  'iframe[name*="chat" i]',
];

/** Selectors targeting ARIA labels and data-testid attributes */
export const ARIA_SELECTORS: string[] = [
  '[aria-label*="chat" i]',
  '[aria-label*="Chat" i]',
  '[aria-label*="support" i]',
  '[aria-label*="help" i]',
  '[data-testid*="chat"]',
  '[data-testid*="widget"]',
];

/** Selectors targeting common class and ID patterns */
export const CLASS_ID_SELECTORS: string[] = [
  '[class*="chat-button"]',
  '[class*="chat-widget"]',
  '[class*="chat-launcher"]',
  '[class*="chatbot"]',
  '[class*="chat-bubble"]',
  '[class*="chat-toggle"]',
  '[class*="chat-icon"]',
  '[class*="widget-launcher"]',
  '[class*="launcher-button"]',
  '[id*="chat-widget"]',
  '[id*="chatbot"]',
  '[id*="chat-button"]',
  '[id*="chat-launcher"]',
  '[id*="live-chat"]',
];

/** Selectors targeting elements by visible text content (Playwright :has-text) */
export const TEXT_SELECTORS: string[] = [
  'button:has-text("Chat")',
  'button:has-text("chat")',
  'button:has-text("Jetzt chatten")',
  'button:has-text("Start chat")',
  'button:has-text("Live chat")',
  'button:has-text("Help")',
  'button:has-text("Support")',
  'a:has-text("Chat")',
  'div[role="button"]:has-text("Chat")',
];

/**
 * All heuristic selectors combined in priority order:
 * iframes → ARIA/data → class/ID → text-based
 */
export const ALL_HEURISTIC_SELECTORS: string[] = [
  ...IFRAME_SELECTORS,
  ...ARIA_SELECTORS,
  ...CLASS_ID_SELECTORS,
  ...TEXT_SELECTORS,
];

// ---------------------------------------------------------------------------
// Hint-to-Selector Builders
// ---------------------------------------------------------------------------

/**
 * Dynamically builds an ordered array of CSS selectors from user-supplied WidgetHints.
 *
 * Priority order:
 * 1. buttonText  → generates button/a/div[role="button"] :has-text selectors
 * 2. containsClass → generates [class*="..."] selectors
 * 3. containsId → generates [id*="..."] selectors
 * 4. iframeSrc → generates iframe[src*="..."] selectors
 * 5. dataAttributes → generates [key="value"] selectors
 *
 * If `withinSelector` is provided, all generated selectors are scoped
 * to that container (e.g. "#app [class*=\"chat\"]").
 *
 * @param hints - The WidgetHints object containing detection clues
 * @returns An ordered array of CSS selectors
 */
export function buildSelectorsFromHints(hints: WidgetHints): string[] {
  if (!hints) return [];

  const selectors: string[] = [];

  // 1. Button text → generate text-based selectors for common clickable elements
  if (hints.buttonText && hints.buttonText.length > 0) {
    for (const text of hints.buttonText) {
      selectors.push(`button:has-text("${text}")`);
      selectors.push(`a:has-text("${text}")`);
      selectors.push(`div[role="button"]:has-text("${text}")`);
    }
  }

  // 2. Class name fragments → generate partial class match selectors
  if (hints.containsClass && hints.containsClass.length > 0) {
    for (const className of hints.containsClass) {
      selectors.push(`[class*="${className}"]`);
    }
  }

  // 3. ID fragments → generate partial ID match selectors
  if (hints.containsId && hints.containsId.length > 0) {
    for (const idFragment of hints.containsId) {
      selectors.push(`[id*="${idFragment}"]`);
    }
  }

  // 4. Iframe src patterns → generate iframe src match selectors
  if (hints.iframeSrc && hints.iframeSrc.length > 0) {
    for (const srcPattern of hints.iframeSrc) {
      selectors.push(`iframe[src*="${srcPattern}"]`);
    }
  }

  // 5. Data attributes → generate exact attribute match selectors
  if (hints.dataAttributes && Object.keys(hints.dataAttributes).length > 0) {
    for (const [key, value] of Object.entries(hints.dataAttributes)) {
      selectors.push(`[${key}="${value}"]`);
    }
  }

  // Scope all selectors to the container if withinSelector is provided
  if (hints.withinSelector) {
    const container = hints.withinSelector;
    return selectors.map((sel) => `${container} ${sel}`);
  }

  return selectors;
}

/**
 * Result of building a positional filter.
 * The `selector` is a broad CSS selector to find candidates,
 * and the `filterFn` narrows results to those in the expected viewport position.
 */
export interface PositionalFilterResult {
  /** The CSS selector to find candidate elements */
  selector: string;
  /** A function that filters elements by their bounding box position */
  filterFn: (boundingBox: { x: number; y: number; width: number; height: number }, viewport: { width: number; height: number }) => boolean;
}

/**
 * Builds a positional filter for locating widgets by their expected screen position.
 *
 * The returned `selector` targets all elements of the given type, and the `filterFn`
 * can be applied to each element's bounding box to check if it's in the expected position.
 *
 * @param position - Expected widget position ('bottom-right', 'bottom-left', 'bottom-center')
 * @param elementType - HTML element type to target ('button', 'div', 'a', 'iframe', 'any')
 * @returns A PositionalFilterResult with selector and bounding-box filter function
 */
export function buildPositionalFilter(
  position: string,
  elementType: string
): PositionalFilterResult {
  // Build the base selector from element type
  const selector = elementType === 'any'
    ? 'button, div[role="button"], a, iframe, [class*="chat"], [class*="widget"]'
    : elementType;

  // Build a filter function that checks element position against viewport
  const filterFn = (
    boundingBox: { x: number; y: number; width: number; height: number },
    viewport: { width: number; height: number }
  ): boolean => {
    const { x, y, width: elWidth } = boundingBox;
    const { width: vpWidth, height: vpHeight } = viewport;

    // Element center point
    const centerX = x + elWidth / 2;

    // Thresholds: element must be in the bottom 30% of the viewport
    const isBottom = y > vpHeight * 0.7;

    switch (position) {
      case 'bottom-right':
        return isBottom && centerX > vpWidth * 0.6;
      case 'bottom-left':
        return isBottom && centerX < vpWidth * 0.4;
      case 'bottom-center':
        return isBottom && centerX >= vpWidth * 0.3 && centerX <= vpWidth * 0.7;
      default:
        // 'custom' or unknown position — accept any bottom element
        return isBottom;
    }
  };

  return { selector, filterFn };
}
