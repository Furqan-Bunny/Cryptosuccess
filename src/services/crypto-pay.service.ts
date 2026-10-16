// Client gateway to the NOWPayments crypto checkout. The server derives the user
// from the access token (never the body) and returns a hosted checkout URL we
// redirect to. Mirrors stripe.service's token handling.
class CryptoPayService {
  async startCheckout(interval: 'monthly' | 'yearly'): Promise<void> {
    const { supabase } = await import('@/lib/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const resp = await fetch('/api/crypto/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        billingInterval: interval,
        redirectUrl: `${window.location.origin}/subscription/success?provider=crypto`,
        cancelUrl: `${window.location.origin}/pricing`,
      }),
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok || typeof data?.url !== 'string') {
      if (data?.reason === 'not_configured') throw new Error('Crypto payments are not enabled');
      if (data?.reason === 'rate_limited') throw new Error('Too many attempts. Please wait a minute and try again.');
      if (data?.reason === 'already_subscribed') {
        throw new Error('You already have an active card subscription — manage it from Settings.');
      }
      throw new Error('Failed to start crypto checkout');
    }
    // Only ever leave for the payment provider over https.
    if (!data.url.startsWith('https://')) throw new Error('Failed to start crypto checkout');
    window.location.href = data.url; // NOWPayments hosted invoice
  }
}

export const cryptoPayService = new CryptoPayService();
