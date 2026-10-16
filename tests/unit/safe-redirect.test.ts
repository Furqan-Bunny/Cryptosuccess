import { safeRedirectPath, sameOriginUrl, trustedAppOrigin } from '@/lib/safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps same-site relative paths', () => {
    expect(safeRedirectPath('/pricing')).toBe('/pricing');
    expect(safeRedirectPath('/coin/BTC?tab=news#chart')).toBe('/coin/BTC?tab=news#chart');
    expect(safeRedirectPath('/')).toBe('/');
  });

  it('falls back for missing / non-string input', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath(undefined)).toBe('/dashboard');
    expect(safeRedirectPath('')).toBe('/dashboard');
    expect(safeRedirectPath(42)).toBe('/dashboard');
    expect(safeRedirectPath(['/x'])).toBe('/dashboard');
  });

  it('uses the supplied fallback', () => {
    expect(safeRedirectPath('//evil.com', '/signals')).toBe('/signals');
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('///evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/\\evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('\\\\evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/ok\\..\\evil')).toBe('/dashboard');
  });

  it('rejects absolute URLs and schemes', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/dashboard');
    expect(safeRedirectPath('data:text/html,hi')).toBe('/dashboard');
    expect(safeRedirectPath('evil.com/path')).toBe('/dashboard');
  });

  it('rejects control characters that browsers strip', () => {
    expect(safeRedirectPath('/\t/evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/\n/evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/\r\n/evil.com')).toBe('/dashboard');
    expect(safeRedirectPath('/dash\u0000board')).toBe('/dashboard');
    expect(safeRedirectPath(' /pricing')).toBe('/dashboard');
  });

  it('rejects over-long values', () => {
    expect(safeRedirectPath('/' + 'a'.repeat(5000))).toBe('/dashboard');
  });
});

describe('sameOriginUrl', () => {
  const origin = 'https://app.example.com';

  it('accepts URLs on the trusted origin and rebuilds them', () => {
    expect(sameOriginUrl('https://app.example.com/pricing', origin)).toBe('https://app.example.com/pricing');
    expect(
      sameOriginUrl('https://app.example.com/subscription/success?session_id={CHECKOUT_SESSION_ID}', origin)
    ).toBe('https://app.example.com/subscription/success?session_id={CHECKOUT_SESSION_ID}');
  });

  it('anchors root-relative paths on the trusted origin', () => {
    expect(sameOriginUrl('/dashboard', origin)).toBe('https://app.example.com/dashboard');
    expect(sameOriginUrl('//evil.com', origin)).toBeNull();
  });

  it('rejects other origins, schemes and userinfo tricks', () => {
    expect(sameOriginUrl('https://evil.com/x', origin)).toBeNull();
    expect(sameOriginUrl('http://app.example.com/x', origin)).toBeNull(); // scheme differs
    expect(sameOriginUrl('https://app.example.com.evil.com/x', origin)).toBeNull();
    expect(sameOriginUrl('https://app.example.com@evil.com/x', origin)).toBeNull();
    expect(sameOriginUrl('https://user:pw@app.example.com/x', origin)).toBeNull();
    expect(sameOriginUrl('https://app.example.com\\@evil.com/x', origin)).toBeNull();
    expect(sameOriginUrl('javascript:alert(1)', origin)).toBeNull();
    expect(sameOriginUrl(undefined, origin)).toBeNull();
    expect(sameOriginUrl('', origin)).toBeNull();
  });

  it('returns null for an unusable trusted origin', () => {
    expect(sameOriginUrl('/x', 'not a url')).toBeNull();
  });
});

describe('trustedAppOrigin', () => {
  it('prefers the configured app URL', () => {
    expect(trustedAppOrigin('https://app.example.com/some/path', 'https://other.host/api')).toBe(
      'https://app.example.com'
    );
  });

  it('falls back to the request origin when unset or invalid', () => {
    expect(trustedAppOrigin(undefined, 'http://localhost:3000/api/x')).toBe('http://localhost:3000');
    expect(trustedAppOrigin('not a url', 'http://localhost:3000/api/x')).toBe('http://localhost:3000');
  });
});
