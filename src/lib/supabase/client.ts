'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Browser Supabase client (RLS-enforced, session stored in cookies via
// @supabase/ssr). Replaces the Firebase client `db`/`auth`. Fallback values keep
// `npm run build` working when env vars aren't present locally; real values are
// inlined at build time on Vercel.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

// Singleton browser client used across the client-side data services.
export const supabase: SupabaseClient = getSupabase();
