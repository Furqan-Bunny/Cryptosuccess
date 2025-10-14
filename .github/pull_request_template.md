## Summary
This PR fixes the critical bug where users couldn't sign up due to a TensorFlow.js initialization error.

## Problem
- Users were encountering `Cannot read properties of undefined (reading 'sqrt')` error during signup
- TensorFlow.js was initializing too early, before the Math library was ready
- This blocked the signup flow and prevented new user registrations

## Solution
- ✅ Implemented lazy loading for AI services (load only when needed)
- ✅ Added `tf.ready()` check to ensure TensorFlow is properly initialized
- ✅ Added browser environment guards to prevent SSR issues
- ✅ Improved error handling with user-friendly fallback messages
- ✅ Created Terms of Service and Privacy Policy pages (fixes 404 errors)

## Changes
- `src/services/ai-signals.service.ts` - Lazy initialization pattern
- `src/services/ai/model.ts` - Added tf.ready() check and error handling
- `src/services/ai/training.service.ts` - Browser environment guard
- `src/services/market.service.ts` - Better AI fallback logic
- `src/app/terms/page.tsx` - New Terms of Service page
- `src/app/privacy/page.tsx` - New Privacy Policy page

## Testing
1. ✅ User signup now works without errors
2. ✅ Dashboard loads successfully after signup
3. ✅ AI features load on-demand when requested
4. ✅ Graceful fallback to technical indicators if AI fails

## Impact
- **Critical**: Unblocks user registrations
- **Performance**: Faster initial page load (lazy loading)
- **Reliability**: Better error handling and fallbacks
- **Compliance**: Added legal pages (Terms & Privacy)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
