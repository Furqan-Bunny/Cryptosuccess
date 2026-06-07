import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase clients for API routes and cron jobs.
// The service-role client BYPASSES Row-Level Security — use only on the server
// (the engine, crons, Stripe webhook). NEVER expose the service-role key to the
// browser.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verify a Supabase access token (sent as `Authorization: Bearer <token>` from
 * the client) and return the user id, or null. Replaces Firebase
 * getAdminAuth().verifyIdToken().
 */
export async function getUidFromToken(token: string): Promise<string | null> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
