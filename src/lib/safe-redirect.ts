// Open-redirect guards. Anything that ends up in a Location header (or is handed
// to Stripe / NOWPayments as a post-payment return URL) must stay on our own
// site — otherwise a crafted link like /login?redirect=//evil.com sends a freshly
// signed-in user to a phishing page under our name.
//
// Pure (no I/O, no Next imports) so it runs on the server, in the browser and in
// unit tests alike.

const MAX_REDIRECT_LENGTH = 2048;

// Control characters (C0 + DEL). Browsers silently strip tab/CR/LF from URLs, so
// "/\t/evil.com" would become "//evil.com" after we had already approved it.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Throwaway base used only to check that a relative path cannot escape the
// current origin once resolved (`.invalid` is a reserved TLD, never resolvable).
const PROBE_ORIGIN = 'http://redirect-check.invalid';

function hasUnsafeChars(value: string): boolean {
  // Backslashes are treated as forward slashes by the WHATWG URL parser for
  // http(s), so "/\evil.com" resolves to "//evil.com".
  return CONTROL_CHARS.test(value) || value.includes('\\');
}

/**
 * Return `input` only if it is a same-site relative path ("/pricing",
 * "/coin/BTC?tab=news"); otherwise `fallback`.
 *
 * Rejects: non-strings, empty values, anything not starting with exactly one
 * "/", protocol-relative "//host", backslashes anywhere, control characters,
 * absolute URLs / schemes ("javascript:", "https://…") and over-long values.
 */
export function safeRedirectPath(input: unknown, fallback = '/dashboard'): string {
  if (typeof input !== 'string') return fallback;
  if (input.length === 0 || input.length > MAX_REDIRECT_LENGTH) return fallback;
  if (input[0] !== '/' || input[1] === '/') return fallback;
  if (hasUnsafeChars(input)) return fallback;

  // Belt and braces: resolving against a dummy origin must not change origin.
  try {
    const resolved = new URL(input, PROBE_ORIGIN);
    if (resolved.origin !== PROBE_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return input;
}

/**
 * The origin payment-provider return URLs must live on: the configured public
 * app URL (NEXT_PUBLIC_APP_URL) when it parses, otherwise the request's own
 * origin. Callers pass both in so this stays pure.
 */
export function trustedAppOrigin(appUrl: string | undefined, requestUrl: string): string {
  if (appUrl) {
    try {
      const origin = new URL(appUrl).origin;
      if (origin !== 'null') return origin;
    } catch {
      /* fall through to the request origin */
    }
  }
  return new URL(requestUrl).origin;
}

/**
 * Validate a client-supplied absolute (or root-relative) URL against our trusted
 * origin. Returns an absolute URL rebuilt on `trustedOrigin` — never the raw
 * input — or null when the URL points anywhere else.
 *
 * Used for Stripe / NOWPayments success & cancel URLs and the billing-portal
 * return URL, which the payment provider redirects the user to.
 */
export function sameOriginUrl(input: unknown, trustedOrigin: string): string | null {
  if (typeof input !== 'string') return null;
  if (input.length === 0 || input.length > MAX_REDIRECT_LENGTH) return null;
  if (hasUnsafeChars(input)) return null;

  let origin: string;
  try {
    origin = new URL(trustedOrigin).origin;
  } catch {
    return null;
  }
  if (origin === 'null') return null;

  // Root-relative path → anchor it on the trusted origin.
  if (input.startsWith('/')) {
    const path = safeRedirectPath(input, '');
    return path ? `${origin}${path}` : null;
  }

  try {
    const url = new URL(input);
    if (url.origin !== origin) return null;
    if (url.username || url.password) return null;
    return `${origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
