/**
 * Lightweight analytics tracker — sends page views and events to /api/analytics/collect.
 * No external dependencies. Batches events and flushes periodically or on page unload.
 * Privacy-friendly: no cookies, no fingerprinting — uses a random session ID per visit.
 */

type AnalyticsEvent = {
  type: "pageview" | "event";
  path: string;
  referrer?: string;
  screenWidth?: number;
  eventName?: string;
  eventData?: string;
};

let sessionId: string | null = null;
let queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getSessionId(): string {
  if (!sessionId) {
    // Try sessionStorage first (persists across SPA navigations, clears on tab close)
    try {
      sessionId = sessionStorage.getItem("_a_sid");
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem("_a_sid", sessionId);
      }
    } catch {
      sessionId = crypto.randomUUID();
    }
  }
  return sessionId;
}

function flush() {
  if (!queue.length) return;

  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({ sessionId: getSessionId(), events });

  // Use sendBeacon for reliability on page unload, fetch as fallback
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/collect", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 3000); // Flush every 3 seconds
}

// Skip tracking on admin/assistant routes to avoid polluting visitor metrics
const EXCLUDED_PREFIXES = ["/admin", "/assistant"];

function isExcluded(): boolean {
  return EXCLUDED_PREFIXES.some(p => window.location.pathname.startsWith(p));
}

/** Track a page view */
export function trackPageView(path?: string) {
  if (isExcluded()) return;
  queue.push({
    type: "pageview",
    path: path ?? window.location.pathname,
    referrer: document.referrer || undefined,
    screenWidth: window.innerWidth,
  });
  scheduleFlush();
}

/** Track a custom event */
export function trackEvent(eventName: string, eventData?: string) {
  if (isExcluded()) return;
  queue.push({
    type: "event",
    path: window.location.pathname,
    eventName,
    eventData,
  });
  scheduleFlush();
}

/** Initialize — call once in app root. Tracks initial page view + listens for SPA navigation. */
export function initAnalytics() {
  // Track initial page view
  trackPageView();

  // Flush on page unload
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  // Listen for SPA navigation via popstate
  window.addEventListener("popstate", () => {
    trackPageView();
  });

  // Patch pushState/replaceState to detect SPA navigations
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  let lastPath = window.location.pathname;

  history.pushState = function (...args) {
    origPush(...args);
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      trackPageView();
    }
  };

  history.replaceState = function (...args) {
    origReplace(...args);
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      trackPageView();
    }
  };
}
