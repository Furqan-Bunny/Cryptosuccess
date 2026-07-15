// Client gateway to the Coinbase Commerce checkout. The server derives the user
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
        redirectUrl: `${window.location.origin}/subscription/success`,
        cancelUrl: `${window.location.origin}/pricing`,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.url) {
      throw new Error(data.reason === 'not_configured' ? 'Crypto payments are not enabled' : 'Failed to start crypto checkout');
    }
    window.location.href = data.url; // Coinbase Commerce hosted checkout
  }
}

export const cryptoPayService = new CryptoPayService();
