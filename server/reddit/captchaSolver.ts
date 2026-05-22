/**
 * 2Captcha Integration — solves reCAPTCHA / hCaptcha / Turnstile on signup
 * and login pages by detecting the sitekey, sending it to 2Captcha, polling
 * for the solution, and injecting the token back into the page so form
 * submission proceeds.
 *
 * Pricing (April 2026): ~$1-3 per 1000 reCAPTCHA v2 solves. We expect
 * 5-8 solves per client account over its lifetime (signup + occasional
 * re-challenges) → ~$0.02/client.
 *
 * Circuit breaker: if 3+ captchas are needed within 1 hour for the same
 * account, that's Reddit suspecting bot behavior. accountCreator/Poster
 * MUST stop posting from that account for 24h.
 *
 * Reference: https://2captcha.com/api-docs/recaptcha-v2
 */

import type { Page } from 'patchright';
import { ENV } from '../_core/env';

interface CaptchaSitekey {
  type: 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'turnstile';
  sitekey: string;
  iframeUrl?: string;
}

const TWO_CAPTCHA_BASE = 'https://2captcha.com';
const SOLVE_TIMEOUT_MS = 180_000;        // Reddit captchas usually solve in 30-90s
const POLL_INTERVAL_MS = 5_000;

export class CaptchaError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CaptchaError';
  }
}

/** Detect a captcha widget on the current page. Returns null if none present.
 *
 * IMPORTANT — only return non-null when the user must actually solve something.
 * Reddit (and many sites) load invisible reCAPTCHA v3 on every page for
 * passive risk scoring; that's not a block. Treating it as one falsely flips
 * `awaiting_verification` accounts to `captcha_blocked` on the very first
 * login attempt. Empirically: April 30 2026, account #4 hit this — the
 * screenshot showed Reddit's normal login form with no challenge widget,
 * yet our old detector matched the invisible v3 anchor iframe and bailed.
 *
 * Strategy:
 *   - Look for the v2 *challenge* iframe (`title="recaptcha challenge ..."`).
 *     This iframe only renders when Google decides the user must solve a
 *     puzzle. If present AND on screen → real v2 challenge.
 *   - For data-sitekey widgets, require that the widget is visibly rendered
 *     (offsetParent !== null) and NOT marked invisible (data-size!="invisible").
 *   - hCaptcha and Turnstile follow the same visible-widget rule.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaSitekey | null> {
  // NOTE: We pass the body as a plain JS string evaluated via Function(), not
  // a TS arrow callback. esbuild/tsx decorate compiled callbacks with __name()
  // calls for stack-trace naming; that helper doesn't exist in the page
  // context, so the eval'd code throws `ReferenceError: __name is not defined`
  // before our logic runs. A string body bypasses the entire compiler pipeline.
  const script = `(function () {
    var v = function (el) {
      if (!el) return false;
      if (el.offsetParent === null) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    // reCAPTCHA v2 — challenge popup (only present when Google actually challenges)
    var challenge = document.querySelector('iframe[title*="recaptcha challenge" i]');
    if (challenge && v(challenge)) {
      var widget = document.querySelector('.g-recaptcha[data-sitekey], [data-sitekey]:not(.cf-turnstile)');
      var sitekey = (widget && widget.dataset && widget.dataset.sitekey)
        || (challenge.src && (challenge.src.match(/[?&]k=([^&]+)/) || [])[1])
        || null;
      if (sitekey) {
        return { type: 'recaptcha_v2', sitekey: decodeURIComponent(sitekey), iframeUrl: window.location.href };
      }
    }

    // Visible v2 widget (rare; Reddit uses invisible v3)
    var v2 = document.querySelector('.g-recaptcha[data-sitekey]');
    if (v2 && v2.dataset.sitekey && v2.dataset.size !== 'invisible' && v(v2)) {
      return { type: 'recaptcha_v2', sitekey: v2.dataset.sitekey, iframeUrl: window.location.href };
    }

    // Visible hCaptcha
    var h = document.querySelector('[data-hcaptcha-sitekey]');
    if (h && h.dataset.hcaptchaSitekey && v(h)) {
      return { type: 'hcaptcha', sitekey: h.dataset.hcaptchaSitekey, iframeUrl: window.location.href };
    }

    // Visible Turnstile
    var t = document.querySelector('[data-sitekey].cf-turnstile, .cf-turnstile[data-sitekey]');
    if (t && t.dataset.sitekey && v(t)) {
      return { type: 'turnstile', sitekey: t.dataset.sitekey, iframeUrl: window.location.href };
    }

    return null;
  })()`;
  const found = await page.evaluate(script);
  return (found as CaptchaSitekey | null) || null;
}

export interface SolveContext {
  proxy?: { server: string; username?: string; password?: string };
  userAgent?: string;
}

/** Submit a captcha task to 2Captcha and return the request ID.
 *
 * Critical: pass the same proxy + User-Agent that will submit the form. If the
 * 2Captcha worker solves from a different network than our submission, Google's
 * reCAPTCHA risk model returns a low-confidence token and the host site (Reddit)
 * silently rejects the form. This was the cause of repeated OTP-no-show in
 * April 2026 testing.
 */
async function submitCaptchaTask(captcha: CaptchaSitekey, ctx?: SolveContext): Promise<string> {
  const apiKey = ENV.twoCaptchaApiKey;
  if (!apiKey) throw new CaptchaError('TWO_CAPTCHA_API_KEY not configured', 'no_api_key');

  const params = new URLSearchParams({
    key: apiKey,
    method: captcha.type === 'recaptcha_v2' || captcha.type === 'recaptcha_v3' ? 'userrecaptcha' :
            captcha.type === 'hcaptcha' ? 'hcaptcha' :
            captcha.type === 'turnstile' ? 'turnstile' : 'userrecaptcha',
    googlekey: captcha.sitekey,
    sitekey: captcha.sitekey,
    pageurl: captcha.iframeUrl || '',
    json: '1',
  });

  if (ctx?.proxy?.server) {
    // Patchright proxy.server is like "http://host:port" or "host:port".
    // 2Captcha wants "user:pass@host:port" with a separate proxytype param.
    let hostPort = ctx.proxy.server.replace(/^https?:\/\//, '');
    const auth = ctx.proxy.username && ctx.proxy.password
      ? `${ctx.proxy.username}:${ctx.proxy.password}@`
      : '';
    params.set('proxy', `${auth}${hostPort}`);
    params.set('proxytype', 'HTTPS');
  }
  if (ctx?.userAgent) {
    params.set('userAgent', ctx.userAgent);
  }

  const res = await fetch(`${TWO_CAPTCHA_BASE}/in.php?${params}`);
  const data = await res.json() as { status: number; request: string };
  if (data.status !== 1) {
    throw new CaptchaError(`2Captcha submit failed: ${data.request}`, data.request);
  }
  return data.request;
}

/** Poll 2Captcha for the solution. Returns the token. */
async function waitForSolution(requestId: string): Promise<string> {
  const apiKey = ENV.twoCaptchaApiKey;
  const start = Date.now();
  await new Promise(r => setTimeout(r, 15_000)); // initial delay before first poll

  while (Date.now() - start < SOLVE_TIMEOUT_MS) {
    const params = new URLSearchParams({
      key: apiKey,
      action: 'get',
      id: requestId,
      json: '1',
    });
    const res = await fetch(`${TWO_CAPTCHA_BASE}/res.php?${params}`);
    const data = await res.json() as { status: number; request: string };
    if (data.status === 1) {
      return data.request; // captcha solution token
    }
    if (data.request !== 'CAPCHA_NOT_READY') {
      throw new CaptchaError(`2Captcha solve failed: ${data.request}`, data.request);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new CaptchaError('2Captcha solve timed out', 'timeout');
}

/** Inject the solution token into the page so form submission can proceed. */
async function injectSolution(page: Page, captcha: CaptchaSitekey, token: string): Promise<void> {
  if (captcha.type === 'recaptcha_v2' || captcha.type === 'recaptcha_v3') {
    // reCAPTCHA stores its response in a hidden textarea named g-recaptcha-response.
    // BUT — modern sites (Reddit included) attach a registered callback via
    // grecaptcha.render() rather than reading the textarea on submit. The host
    // form's React state only flips to "captcha verified" when that callback
    // fires with the token. Stuffing the textarea alone leads to silent
    // submission rejection. We walk ___grecaptcha_cfg.clients[*] to find and
    // invoke the registered callback — the standard 2Captcha integration pattern.
    await page.evaluate((tok) => {
      const els = document.getElementsByName('g-recaptcha-response') as unknown as HTMLTextAreaElement[];
      for (const el of Array.from(els)) {
        el.style.display = 'block';
        el.value = tok;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Walk grecaptcha config to find the registered callback.
      try {
        const cfg = (window as any).___grecaptcha_cfg;
        if (cfg && cfg.clients) {
          for (const clientId of Object.keys(cfg.clients)) {
            const client = cfg.clients[clientId];
            const stack: any[] = [client];
            const seen = new Set<any>();
            while (stack.length) {
              const node = stack.pop();
              if (!node || typeof node !== 'object' || seen.has(node)) continue;
              seen.add(node);
              for (const k of Object.keys(node)) {
                const v = node[k];
                if (k === 'callback') {
                  if (typeof v === 'function') {
                    try { v(tok); } catch {}
                  } else if (typeof v === 'string') {
                    const fn = (window as any)[v];
                    if (typeof fn === 'function') {
                      try { fn(tok); } catch {}
                    }
                  }
                } else if (v && typeof v === 'object') {
                  stack.push(v);
                }
              }
            }
          }
        }
      } catch {}
      // Legacy generic fallback
      if ((window as any).onCaptchaSuccess) (window as any).onCaptchaSuccess(tok);
    }, token);
  } else if (captcha.type === 'hcaptcha') {
    await page.evaluate((tok) => {
      const els = document.getElementsByName('h-captcha-response') as unknown as HTMLTextAreaElement[];
      for (const el of Array.from(els)) {
        el.style.display = 'block';
        el.value = tok;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, token);
  } else if (captcha.type === 'turnstile') {
    await page.evaluate((tok) => {
      const els = document.querySelectorAll('input[name="cf-turnstile-response"]') as NodeListOf<HTMLInputElement>;
      for (const el of Array.from(els)) {
        el.value = tok;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, token);
  }
}

/**
 * Solve any captcha visible on the current page. No-op if nothing detected.
 * Returns true if a captcha was solved, false if none present.
 *
 * Throws CaptchaError on solver failure (e.g., insufficient funds, timeout).
 */
export async function solveCaptchaOnPage(page: Page, ctx?: SolveContext): Promise<boolean> {
  const captcha = await detectCaptcha(page);
  if (!captcha) return false;

  console.log(`[2Captcha] Detected ${captcha.type} on ${captcha.iframeUrl}`);
  if (ctx?.proxy?.server) console.log(`[2Captcha] Using proxy ${ctx.proxy.server} (network-bound solve)`);
  const requestId = await submitCaptchaTask(captcha, ctx);
  console.log(`[2Captcha] Submitted task ${requestId}, polling for solution...`);

  const token = await waitForSolution(requestId);
  console.log(`[2Captcha] Solution received (${token.length} chars), injecting...`);

  await injectSolution(page, captcha, token);
  console.log('[2Captcha] Token injected. Form should now be submittable.');
  return true;
}

/** Quick balance check — used by health checks to ensure 2Captcha account has credits. */
export async function getBalance(): Promise<number | null> {
  const apiKey = ENV.twoCaptchaApiKey;
  if (!apiKey) return null;
  const res = await fetch(`${TWO_CAPTCHA_BASE}/res.php?key=${apiKey}&action=getbalance&json=1`);
  const data = await res.json() as { status: number; request: string };
  if (data.status !== 1) return null;
  return parseFloat(data.request);
}
