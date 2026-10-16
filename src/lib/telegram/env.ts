// Server-only environment helpers shared by the Telegram routes (webhook, setup,
// push + follow-up crons). No secrets are returned — only booleans and the
// public app URL.

/**
 * Public base URL for links in bot messages (/verify, /pricing, /settings).
 * Prefers an explicit NEXT_PUBLIC_APP_URL, but falls back to the deployment host
 * from the request so it "just works" on Vercel without any env config. The
 * fallback only ever builds an absolute URL to THIS deployment (no redirect,
 * no fetch), so a spoofed host header can at worst garble a link in our own reply.
 */
export function resolveBaseUrl(headers: Headers): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost/.test(env)) return env.replace(/\/$/, '');
  const host = headers.get('x-forwarded-host') || headers.get('host');
  const proto = headers.get('x-forwarded-proto') || 'https';
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) && /^https?$/.test(proto)) return `${proto}://${host}`;
  return env || 'http://localhost:3000';
}

/**
 * Is Supabase pointed at a real project (not a placeholder / example value)?
 * When it isn't, DB calls would hang trying to reach a bogus host and stall the
 * whole webhook response (Telegram then times out at ~60s and retries). So all
 * DB work is skipped in that state and DB-free commands (/start, /help, …) still work.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return (
    /^https:\/\/.+\.supabase\.co/.test(url) &&
    !/your-project|placeholder/.test(url) &&
    key.length > 20 &&
    !/your_|placeholder/.test(key)
  );
}

/** Is a real Anthropic key configured (not the .env.example placeholder)? */
export function isAnalystConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && !/your_key_here|sk-ant-your/.test(key);
}
