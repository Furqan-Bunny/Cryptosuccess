import { buildSignalScoredNotification, formatSignedPercent } from '../../src/lib/signal-notification';
import { deriveOutcome } from '../../src/lib/signal-outcome';

describe('formatSignedPercent', () => {
  it('signs and rounds to one decimal', () => {
    expect(formatSignedPercent(2.14)).toBe('+2.1%');
    expect(formatSignedPercent(-2.06)).toBe('-2.1%');
    expect(formatSignedPercent(0.01)).toBe('0.0%');
    expect(formatSignedPercent(NaN)).toBe('0.0%');
  });
});

describe('buildSignalScoredNotification', () => {
  const base = { id: 'sig-1', symbol: 'btc', entryPrice: 100, priceAt24h: 97.9 };

  it('reports a stopped-out BUY plainly, with the loss', () => {
    const signal = { action: 'BUY' as const, entryPrice: 100, targetPrice: 110, stopLoss: 98 };
    const { outcome, profitLossPercent } = deriveOutcome(signal, 97.9);
    const n = buildSignalScoredNotification({ ...base, action: 'BUY', outcome, profitLossPercent });
    expect(n.type).toBe('signal');
    expect(n.title).toBe('BTC BUY scored: stopped out, -2.1%');
    expect(n.message).toContain('-2.1%');
    expect(n.message).toMatch(/Losses are part of the record/);
    expect(n.data).toEqual({ signalId: 'sig-1' });
  });

  it('uses the direction-adjusted P/L for a SELL that worked', () => {
    const signal = { action: 'SELL' as const, entryPrice: 100, targetPrice: 90, stopLoss: 105 };
    const { outcome, profitLossPercent } = deriveOutcome(signal, 89);
    const n = buildSignalScoredNotification({
      ...base,
      symbol: 'ETH',
      priceAt24h: 89,
      action: 'SELL',
      outcome,
      profitLossPercent,
    });
    expect(n.title).toBe('ETH SELL scored: target reached, +11.0%');
    // No hype: a win is framed as one data point.
    expect(n.message).not.toMatch(/guarantee|100x/i);
    expect(n.message).toMatch(/full track record/);
  });

  it('labels expired outcomes honestly', () => {
    const win = buildSignalScoredNotification({
      ...base,
      action: 'BUY',
      outcome: 'expired_profit',
      profitLossPercent: 0.4,
      priceAt24h: 100.4,
    });
    const loss = buildSignalScoredNotification({
      ...base,
      action: 'BUY',
      outcome: 'expired_loss',
      profitLossPercent: -0.7,
      priceAt24h: 99.3,
    });
    expect(win.title).toBe('BTC BUY scored: closed in profit, +0.4%');
    expect(loss.title).toBe('BTC BUY scored: closed at a loss, -0.7%');
  });

  it('describes HOLD as non-directional and outside the win rate', () => {
    const n = buildSignalScoredNotification({
      ...base,
      action: 'HOLD',
      outcome: 'expired_profit',
      profitLossPercent: -2.1,
    });
    expect(n.title).toBe('BTC HOLD checked after 24h: price -2.1%');
    expect(n.message).toMatch(/does not count toward your win rate/);
  });

  it('keeps sub-dollar prices readable', () => {
    const n = buildSignalScoredNotification({
      id: 'sig-2',
      symbol: 'PEPE',
      action: 'BUY',
      outcome: 'expired_loss',
      profitLossPercent: -1,
      entryPrice: 0.00001234,
      priceAt24h: 0.00001221,
    });
    expect(n.message).toContain('$0.00001234');
  });
});
