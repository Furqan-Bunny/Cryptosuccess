import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';

// OAuth / email-confirmation callback. Supabase redirects here with a `code`
// which we exchange for a session (PKCE), setting the auth cookies, then send
// the user on to the app. Replaces Firebase's popup Google sign-in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only same-site paths: `?next=//evil.com` (or `/\evil.com`) would otherwise
  // bounce a freshly signed-in user to another site.
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard');

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
