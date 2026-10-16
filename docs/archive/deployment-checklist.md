# CryptoSuccess Deployment Checklist

## Pre-Deployment

### Environment Variables
- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY` — Firebase config
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key
- [ ] `STRIPE_SECRET_KEY` — Stripe secret key (server-side only)
- [ ] `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` — Firebase Admin SDK JSON
- [ ] `NEXT_PUBLIC_APP_URL` — Production URL

### Firebase Setup
- [ ] Firebase Auth providers enabled (Email/Password, Google)
- [ ] Firestore rules deployed: `firebase deploy --only firestore:rules`
- [ ] Firestore indexes deployed: `firebase deploy --only firestore:indexes`
- [ ] Cloud Functions deployed: `firebase deploy --only functions`

### Stripe Setup
- [ ] Webhook endpoint configured in Stripe Dashboard
- [ ] Webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Price IDs match environment variables
- [ ] Test mode verified, then switch to live keys

## Build & Deploy

1. `npm run type-check` — No TypeScript errors
2. `npm run lint` — No linting errors
3. `npm test` — All tests pass
4. `npm run build` — Build succeeds
5. Deploy to hosting platform (Vercel/Firebase Hosting)

## Post-Deployment Smoke Tests

1. [ ] Landing page loads with correct pricing
2. [ ] Sign up with email/password works
3. [ ] Google OAuth sign-in works
4. [ ] Dashboard loads with sentiment gauge
5. [ ] Market page shows live prices (20 coins)
6. [ ] Generate AI signal — shows ATR-based stops and confidence <= 85%
7. [ ] Signal stored in Firestore `signals` collection
8. [ ] Notification appears after signal generation
9. [ ] Stripe checkout flow completes (test mode)
10. [ ] After checkout, user subscription updates to 'pro'
11. [ ] Portfolio and Trade pages accessible for Pro users
12. [ ] 404 page renders for invalid routes
13. [ ] No console errors on any page

## Monitoring

- [ ] Firebase Console — check Auth, Firestore, Functions health
- [ ] Stripe Dashboard — monitor webhook delivery success rate
- [ ] Hosting platform — check deploy logs and error rates
