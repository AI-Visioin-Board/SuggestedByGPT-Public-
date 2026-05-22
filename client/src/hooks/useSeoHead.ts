/**
 * useSeoHead — Per-route head management without react-helmet.
 *
 * Why hand-rolled instead of react-helmet-async: the dependency adds ~6KB
 * gzipped + a Provider wrap for one feature we use on a single high-value
 * route. A focused useEffect with cleanup is simpler and has zero runtime
 * cost on routes that don't use it.
 *
 * What it does, on mount:
 *   1. Sets <title>
 *   2. Upserts a set of <meta> tags by name or property
 *   3. Upserts <link rel="canonical">
 *   4. Injects a <script type="application/ld+json"> JSON-LD graph
 *
 * On unmount: restores the previous title and removes anything it created.
 * Tags that already existed in the document (e.g. site-wide schema in
 * index.html) are left untouched.
 *
 * Crawler note: GoogleBot and most major AI crawlers (GPTBot, ClaudeBot,
 * PerplexityBot, GeminiBot) execute JavaScript before extracting content,
 * so JSON-LD injected via this hook IS picked up. Confirm via Google's
 * Rich Results Test after deploy.
 */
import { useEffect } from "react";

type MetaTag =
  | { name: string; content: string }
  | { property: string; content: string };

interface UseSeoHeadOptions {
  /** Page title — replaces <title>. Restored on unmount. */
  title?: string;
  /** Canonical URL — upserts <link rel="canonical">. */
  canonical?: string;
  /** Meta tags by `name` or `property` (Open Graph uses `property`). */
  meta?: MetaTag[];
  /** JSON-LD object — serialized into a tagged <script>. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  /**
   * Optional `data-seo-id` to scope the injected JSON-LD script. If multiple
   * routes inject schema on the same render pass (rare, but possible during
   * route transitions), this prevents collisions.
   */
  jsonLdId?: string;
}

const DATA_KEY = "data-managed-by";
const DATA_VALUE = "useSeoHead";

function setMetaTag(tag: MetaTag): HTMLMetaElement {
  const selector =
    "name" in tag
      ? `meta[name="${tag.name}"]`
      : `meta[property="${tag.property}"]`;
  let el = document.querySelector<HTMLMetaElement>(selector);
  let created = false;
  if (!el) {
    el = document.createElement("meta");
    if ("name" in tag) el.setAttribute("name", tag.name);
    else el.setAttribute("property", tag.property);
    el.setAttribute(DATA_KEY, DATA_VALUE);
    document.head.appendChild(el);
    created = true;
  }
  // Stash prior content so cleanup can restore it
  if (!created && !el.hasAttribute("data-prior-content")) {
    el.setAttribute("data-prior-content", el.getAttribute("content") || "");
  }
  el.setAttribute("content", tag.content);
  return el;
}

function setCanonical(href: string): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  let created = false;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    el.setAttribute(DATA_KEY, DATA_VALUE);
    document.head.appendChild(el);
    created = true;
  }
  if (!created && !el.hasAttribute("data-prior-href")) {
    el.setAttribute("data-prior-href", el.getAttribute("href") || "");
  }
  el.setAttribute("href", href);
  return el;
}

export function useSeoHead(opts: UseSeoHeadOptions): void {
  useEffect(() => {
    const created: Element[] = [];
    const restored: Array<() => void> = [];

    // Title
    const priorTitle = document.title;
    if (opts.title) document.title = opts.title;

    // Canonical
    if (opts.canonical) {
      const el = setCanonical(opts.canonical);
      restored.push(() => {
        const prior = el.getAttribute("data-prior-href");
        if (prior !== null) {
          el.setAttribute("href", prior);
          el.removeAttribute("data-prior-href");
        } else if (el.getAttribute(DATA_KEY) === DATA_VALUE) {
          el.remove();
        }
      });
    }

    // Meta tags
    if (opts.meta) {
      for (const tag of opts.meta) {
        const el = setMetaTag(tag);
        restored.push(() => {
          const prior = el.getAttribute("data-prior-content");
          if (prior !== null) {
            el.setAttribute("content", prior);
            el.removeAttribute("data-prior-content");
          } else if (el.getAttribute(DATA_KEY) === DATA_VALUE) {
            el.remove();
          }
        });
      }
    }

    // JSON-LD
    if (opts.jsonLd) {
      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      if (opts.jsonLdId) script.setAttribute("data-seo-id", opts.jsonLdId);
      script.setAttribute(DATA_KEY, DATA_VALUE);
      script.text = JSON.stringify(opts.jsonLd);
      document.head.appendChild(script);
      created.push(script);
    }

    return () => {
      // Run restorers first (preserves prior values), then remove anything we
      // created from scratch.
      for (const fn of restored) fn();
      for (const el of created) el.remove();
      document.title = priorTitle;
    };
    // We deliberately re-run only when opts identity changes; consumers should
    // memoize the options object if they want stable behavior across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(opts)]);
}
