/**
 * Browser WebSocket Discovery Types
 *
 * All interfaces and types for the Browser WebSocket feature.
 * Used by the discovery service to navigate to chatbot pages,
 * detect chat widgets, capture WebSocket connections, and extract credentials.
 */

/**
 * Clues for heuristic widget detection.
 * These hints guide the heuristic selector engine to find the chat widget
 * on the page without a known CSS selector.
 */
export interface WidgetHints {
  /** Text content of the chat button, e.g. ["Jetzt Chatten", "Chat starten"] */
  buttonText?: string[];
  /** Partial class name matches, e.g. ["chat-widget", "launcher"] */
  containsClass?: string[];
  /** Partial ID matches, e.g. ["chat-button", "widget"] */
  containsId?: string[];
  /** Partial iframe src matches, e.g. ["intercom", "drift"] */
  iframeSrc?: string[];
  /** Expected position of the widget on the page */
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'custom';
  /** HTML element type of the widget trigger */
  elementType?: 'button' | 'div' | 'a' | 'iframe' | 'any';
  /** Scope heuristic search to elements within this container */
  withinSelector?: string;
  /** Data attribute key-value pairs to match, e.g. { "data-widget": "chat" } */
  dataAttributes?: Record<string, string>;
}

/**
 * A single step in a multi-step widget interaction sequence.
 * Used with the 'steps' detection strategy.
 */
export interface InteractionStep {
  /** The type of browser action to perform */
  action: 'click' | 'type' | 'wait' | 'waitForSelector' | 'evaluate';
  /** CSS selector for the target element (for click, type, waitForSelector) */
  selector?: string;
  /** Value to type (for 'type' action) or wait duration in ms (for 'wait' action) */
  value?: string;
  /** Timeout in milliseconds for this step */
  timeout?: number;
  /** JavaScript code to execute in the page context (for 'evaluate' action) */
  script?: string;
}

/**
 * Configuration for Browser WebSocket protocol discovery.
 * Stored in Target.protocolConfig when connectorType is BROWSER_WS.
 */
export interface BrowserWebSocketProtocolConfig {
  /** The web page URL containing the chat widget */
  pageUrl: string;

  /** Configuration for detecting and activating the chat widget */
  widgetDetection: {
    /** Detection strategy: heuristic (auto-detect), selector (CSS), or steps (scripted) */
    strategy: 'heuristic' | 'selector' | 'steps';
    /** CSS selector for the widget trigger element (for 'selector' strategy) */
    selector?: string;
    /** Ordered interaction steps (for 'steps' strategy) */
    steps?: InteractionStep[];
    /** Widget detection timeout in ms (default: 15000) */
    timeout?: number;
    /** Hints to guide heuristic detection */
    hints?: WidgetHints;
  };

  /** Filter to select the desired WebSocket connection from potentially many */
  wsFilter?: {
    /** Regex pattern to match the desired WSS URL */
    urlPattern?: string;
    /** If multiple WS connections match, which one to use (default: 0) */
    index?: number;
  };

  /** Browser launch and viewport configuration */
  browser?: {
    /** Run browser in headless mode (default: true) */
    headless?: boolean;
    /** Viewport dimensions */
    viewport?: { width: number; height: number };
    /** Custom User-Agent string */
    userAgent?: string;
    /** Proxy configuration */
    proxy?: { server: string; username?: string; password?: string };
  };

  /** Session management configuration */
  session?: {
    /** Re-discover the WebSocket URL after N milliseconds (default: 300000) */
    maxAge?: number;
    /** Keep the browser instance alive between discoveries for reuse */
    keepBrowserAlive?: boolean;
    /** Fraction of maxAge at which to proactively refresh tokens (0.0-1.0, default 0.75) */
    refreshAheadPercent?: number;
    /** Enable proactive token refresh via background worker (default true) */
    tokenRefreshEnabled?: boolean;
    /** Stop warning after N consecutive refresh failures (default 5) */
    maxConsecutiveRefreshFailures?: number;
  };

  /** Protocol detection and configuration */
  protocol?: {
    /** Protocol detection mode: auto-detect, force Socket.IO, or force raw WS */
    type?: 'auto' | 'socket.io' | 'raw';
    /** Socket.IO-specific configuration */
    socketIo?: { version?: 3 | 4 };
  };
}

/**
 * A single captured WebSocket frame (sent or received).
 */
export interface CapturedFrame {
  /** Whether the frame was sent by the page or received from the server */
  direction: 'sent' | 'received';
  /** The raw frame data as a string */
  data: string;
  /** Unix timestamp in milliseconds when the frame was captured */
  timestamp: number;
}

/**
 * Socket.IO handshake configuration extracted from the initial connection.
 */
export interface SocketIOConfig {
  /** Session ID from the Socket.IO handshake */
  sid: string;
  /** Server ping interval in milliseconds */
  pingInterval: number;
  /** Server ping timeout in milliseconds */
  pingTimeout: number;
  /** Detected Socket.IO engine version */
  version: number;
}

/**
 * The complete result of a browser WebSocket discovery operation.
 * Contains everything needed to establish a direct WebSocket connection.
 */
export interface DiscoveryResult {
  /** The discovered WebSocket URL */
  wssUrl: string;
  /** Cookies from the browser context */
  cookies: Array<{ name: string; value: string; domain: string }>;
  /** HTTP headers captured from the WebSocket upgrade request via CDP */
  headers: Record<string, string>;
  /** localStorage key-value pairs from the page */
  localStorage: Record<string, string>;
  /** sessionStorage key-value pairs from the page */
  sessionStorage: Record<string, string>;
  /** Captured WebSocket frames from the initial connection */
  capturedFrames: CapturedFrame[];
  /** The detected WebSocket protocol type */
  detectedProtocol: 'socket.io' | 'raw';
  /** Socket.IO-specific configuration (only present when protocol is socket.io) */
  socketIoConfig?: SocketIOConfig;
  /** Timestamp when this discovery was performed */
  discoveredAt: Date;
}

/**
 * Internal representation of a captured WebSocket connection during discovery.
 * Tracks a single WS connection's URL, frames, headers, and timing.
 */
export interface CapturedWebSocket {
  /** The WebSocket URL */
  url: string;
  /** Captured frames on this connection */
  frames: CapturedFrame[];
  /** HTTP headers from the WS upgrade request */
  headers: Record<string, string>;
  /** Unix timestamp in milliseconds when this WS connection was created */
  createdAt: number;
}

/**
 * Options passed to the browser discovery service.
 */
export interface BrowserDiscoveryOptions {
  /** The protocol configuration defining how to discover the WebSocket */
  config: BrowserWebSocketProtocolConfig;
  /** The target ID this discovery is for */
  targetId: string;
  /** Optional progress callback for UI updates */
  onProgress?: (message: string) => void;
  /** When true, bypass Redis cache and force a fresh browser discovery */
  forceFresh?: boolean;
}
