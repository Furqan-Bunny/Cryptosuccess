## Summary
<!-- What does this PR change, and why? -->

## Changes
<!-- Key files / areas touched. Call out migrations, env vars, and cron changes explicitly. -->

## Database / deploy steps
<!-- New migration(s) to run in the Supabase SQL editor, new env vars, webhook/cron setup. "None" if none. -->
- [ ] New migration added under `supabase/migrations/` and `supabase/ALL_MIGRATIONS.sql` regenerated
- [ ] New env vars documented in `.env.local.example` (server secrets never prefixed `NEXT_PUBLIC_`)
- [ ] New cron routes added to `vercel.json`, wrapped in `withCronMonitoring`, and listed in `CRON_JOBS` (`src/lib/server/cron-monitor.ts`)

## Testing
- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manually verified: <!-- what you clicked / ran -->

## Security
- [ ] New API routes authenticate first (`getUidFromToken` for users, `isCronAuthorized` for crons) and validate all input
- [ ] Auth / quota checks fail closed; secrets compared in constant time
- [ ] New tables have RLS enabled; new SQL functions are `security definer`, `set search_path = public`, and granted to `service_role` only
- [ ] No secrets, tokens, emails or request bodies logged — use `reportError` for server errors

## Honesty guardrails
- [ ] No over-promising copy ("guaranteed", accuracy claims we can't back up, hidden losses)
- [ ] Any "verifiable / on-chain" claim is true for the data it refers to
