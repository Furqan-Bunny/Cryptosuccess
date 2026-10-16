// Pure rules behind the second integrity pass: paper-futures request
// validation, anchored-tree completeness, horizon level floors, recorded-level
// display and the crypto "extend" success check.
import { validateOpenFuturesInput, validateCloseFuturesInput, MAX_PAPER_AMOUNT_USD } from '@/lib/paper-input';
import { isCompleteLeafSet, computeMerkleRoot, computeMerkleProof, verifyMerkleProof, hashLeaf } from '@/lib/merkle';
import { horizonLevels, MIN_LEVEL_FRACTION, getHorizon } from '@/lib/horizons';
import { validateSignalInput } from '@/lib/signal-input';
import { levelStats, isValidLevels } from '@/lib/recorded-levels';
import { rebaseToSpot } from '@/lib/signal-input';
import { cryptoPaymentApplied, parseCryptoBaseline } from '@/lib/crypto-checkout-baseline';
import { MAX_LEVERAGE } from '@/lib/futures';

describe('validateOpenFuturesInput', () => {
  const ok = { symbol: 'btc', side: 'long', leverage: 5, marginUsd: 100 };

  it('accepts a normal request and normalises the symbol', () => {
    expect(validateOpenFuturesInput(ok)).toEqual({ ok: true, value: { symbol: 'BTC', side: 'long', leverage: 5, marginUsd: 100 } });
  });

  it('never accepts a client price or extra fields as part of the trade', () => {
    const res = validateOpenFuturesInput({ ...ok, entryPrice: 1, quantity: 1e9 });
    expect(res.ok && Object.keys(res.value).sort()).toEqual(['leverage', 'marginUsd', 'side', 'symbol']);
  });

  it.each([
    [{ ...ok, symbol: 'NOTACOIN' }, 'invalid_symbol'],
    [{ ...ok, side: 'up' }, 'invalid_side'],
    [{ ...ok, leverage: MAX_LEVERAGE + 1 }, 'invalid_leverage'],
    [{ ...ok, leverage: 0.5 }, 'invalid_leverage'],
    [{ ...ok, marginUsd: 0 }, 'invalid_margin'],
    [{ ...ok, marginUsd: -5 }, 'invalid_margin'],
    [{ ...ok, marginUsd: Infinity }, 'invalid_margin'],
    [{ ...ok, marginUsd: MAX_PAPER_AMOUNT_USD + 1 }, 'invalid_margin'],
    [{ ...ok, marginUsd: '100' }, 'invalid_margin'],
    [[], 'invalid_body'],
    [null, 'invalid_body'],
  ])('rejects %j', (body, error) => {
    expect(validateOpenFuturesInput(body)).toEqual({ ok: false, error });
  });

  it('close requires a UUID position id', () => {
    expect(validateCloseFuturesInput({ positionId: '0b6a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b' }).ok).toBe(true);
    expect(validateCloseFuturesInput({ positionId: '1 or 1=1' })).toEqual({ ok: false, error: 'invalid_position' });
  });
});

describe('isCompleteLeafSet', () => {
  const leaves = [0, 1, 2, 3].map(i => ({ leaf_index: i }));

  it('accepts exactly the anchored set', () => {
    expect(isCompleteLeafSet(leaves, 4)).toBe(true);
  });

  it('rejects a set with a removed leaf, a gap or a wrong count', () => {
    expect(isCompleteLeafSet([leaves[0], leaves[1], leaves[3]], 4)).toBe(false);
    expect(isCompleteLeafSet([leaves[0], leaves[1], leaves[3]], 3)).toBe(false);
    expect(isCompleteLeafSet(leaves, 5)).toBe(false);
    expect(isCompleteLeafSet(leaves, null)).toBe(false);
  });

  it('is what keeps proofs honest: a proof from a filtered tree fails against the root', () => {
    const hashes = ['a', 'b', 'c', 'd'].map(hashLeaf);
    const root = computeMerkleRoot(hashes);
    const filtered = [hashes[0], hashes[1], hashes[3]]; // leaf 2 "deleted"
    const proof = computeMerkleProof(filtered, 2);
    expect(verifyMerkleProof(hashes[3], proof, root)).toBe(false);
    expect(verifyMerkleProof(hashes[3], computeMerkleProof(hashes, 3), root)).toBe(true);
  });
});

describe('horizonLevels', () => {
  const h = getHorizon('1y');

  it('keeps a high-ATR 1y BUY stop positive, so the record route accepts it', () => {
    const price = 1;
    const atr = 0.4; // 40% weekly ATR: 4 x ATR would put the stop at -0.6
    const { stopLoss, targetPrice } = horizonLevels('BUY', price, atr, h.atr);
    expect(stopLoss).toBeCloseTo(price * MIN_LEVEL_FRACTION);
    const parsed = validateSignalInput({
      symbol: 'DOGE', action: 'BUY', confidence: 55, entryPrice: price, targetPrice, stopLoss, reasoning: 'x', horizon: '1y',
    });
    expect(parsed.ok).toBe(true);
  });

  it('floors a SELL target the same way', () => {
    const { stopLoss, targetPrice } = horizonLevels('SELL', 1, 0.4, h.atr);
    expect(targetPrice).toBeCloseTo(MIN_LEVEL_FRACTION);
    expect(stopLoss).toBeGreaterThan(1);
  });

  it('leaves normal levels untouched', () => {
    expect(horizonLevels('BUY', 100, 2, { stop: 1.5, target: 2.5 })).toEqual({ stopLoss: 97, targetPrice: 105 });
    expect(horizonLevels('SELL', 100, 2, { stop: 1.5, target: 2.5 })).toEqual({ stopLoss: 103, targetPrice: 95 });
  });
});

describe('recorded levels', () => {
  it('rebasing keeps the percentages and risk/reward the user was shown', () => {
    const shown = { entryPrice: 100, targetPrice: 110, stopLoss: 95 };
    const recorded = rebaseToSpot(shown, 101);
    const a = levelStats(shown);
    const b = levelStats(recorded);
    expect(b.riskReward).toBeCloseTo(a.riskReward);
    expect(b.potentialGainPct).toBeCloseTo(a.potentialGainPct);
    expect(b.potentialLossPct).toBeCloseTo(a.potentialLossPct);
    expect(recorded.entryPrice).toBe(101);
  });

  it('only accepts three positive numbers from the server', () => {
    expect(isValidLevels({ entryPrice: 1, targetPrice: 2, stopLoss: 0.5 })).toBe(true);
    expect(isValidLevels({ entryPrice: 1, targetPrice: 2 })).toBe(false);
    expect(isValidLevels({ entryPrice: 1, targetPrice: 2, stopLoss: -1 })).toBe(false);
    expect(isValidLevels(null)).toBe(false);
  });
});

describe('crypto extend: success page check', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const oldEnd = Date.parse('2026-11-01T00:00:00Z');

  it('is not "applied" while the period end has not moved (extension still unconfirmed)', () => {
    expect(cryptoPaymentApplied({ periodEndMs: oldEnd, startedAt: now }, true, oldEnd)).toBe(false);
  });

  it('is applied once the period end moves past the old one', () => {
    expect(cryptoPaymentApplied({ periodEndMs: oldEnd, startedAt: now }, true, oldEnd + 30 * 86400000)).toBe(true);
  });

  it('a first purchase is applied as soon as Pro shows up', () => {
    expect(cryptoPaymentApplied({ periodEndMs: null, startedAt: now }, true, oldEnd)).toBe(true);
    expect(cryptoPaymentApplied({ periodEndMs: null, startedAt: now }, false, null)).toBe(false);
  });

  it('without a recorded checkout the answer is unknown', () => {
    expect(cryptoPaymentApplied(null, true, oldEnd)).toBeNull();
  });

  it('ignores malformed or stale stored hints', () => {
    expect(parseCryptoBaseline(JSON.stringify({ periodEndMs: oldEnd, startedAt: now }), now)).toEqual({ periodEndMs: oldEnd, startedAt: now });
    expect(parseCryptoBaseline(JSON.stringify({ periodEndMs: oldEnd, startedAt: now - 2 * 86400000 }), now)).toBeNull();
    expect(parseCryptoBaseline(JSON.stringify({ periodEndMs: 'x', startedAt: now }), now)).toBeNull();
    expect(parseCryptoBaseline('{not json', now)).toBeNull();
    expect(parseCryptoBaseline(null, now)).toBeNull();
  });
});
