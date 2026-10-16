// Review fixes: HOLD display, the public record summary, paged reads and the
// recordable horizons. Every test imports the real code.
import { outcomeBadge } from '@/lib/outcome-badge';
import { toTrackRecordSummary, MIN_SAMPLE_FOR_WIN_RATE, RECENT_ANCHOR_DAYS } from '@/lib/track-record-summary';
import { readAllPages } from '@/lib/paging';
import { HORIZONS } from '@/lib/horizons';
import { validateSignalInput } from '@/lib/signal-input';

describe('outcomeBadge', () => {
  it('never shows a scored HOLD as a profit', () => {
    const b = outcomeBadge('HOLD', 'expired_profit');
    expect(b.tone).toBe('neutral');
    expect(b.label).toMatch(/not scored/i);
    expect(b.label).not.toMatch(/profit/i);
    expect(b.moveCaption).toBe('price move');
  });

  it('keeps a pending HOLD pending', () => {
    expect(outcomeBadge('HOLD', 'pending').tone).toBe('pending');
    expect(outcomeBadge('HOLD', undefined).tone).toBe('pending');
  });

  it('labels directional outcomes as scored at 24h', () => {
    expect(outcomeBadge('BUY', 'hit_target')).toEqual({ label: 'Past Target at 24h', tone: 'win', moveCaption: 'P/L' });
    expect(outcomeBadge('SELL', 'expired_profit').tone).toBe('small_win');
    expect(outcomeBadge('BUY', 'hit_stop').tone).toBe('loss');
    expect(outcomeBadge('SELL', 'expired_loss').tone).toBe('small_loss');
    expect(outcomeBadge('BUY', null).label).toBe('Pending');
  });
});

describe('toTrackRecordSummary', () => {
  const tx = `0x${'ab'.repeat(32)}`;

  it('computes the win rate from BUY/SELL wins and losses only', () => {
    const s = toTrackRecordSummary(
      { anchored_days: '3', confirmed_days: 2, anchored_signals: '50', directional: '40', wins: '18', losses: '22', first_day: '2026-10-01', last_day: '2026-10-03' },
      [],
    );
    expect(s.winRate).toBeCloseTo(45);
    expect(s.smallSample).toBe(false);
    expect(s.anchoredSignals).toBe(50);
    expect(s.firstDay).toBe('2026-10-01');
  });

  it('flags a small sample and reports no rate when nothing is scored', () => {
    expect(toTrackRecordSummary({ anchored_days: 1, confirmed_days: 0, anchored_signals: 2, directional: 2, wins: 1, losses: 1, first_day: null, last_day: null }, []).smallSample)
      .toBe(MIN_SAMPLE_FOR_WIN_RATE > 2);
    const empty = toTrackRecordSummary(null, []);
    expect(empty.winRate).toBeNull();
    expect(empty.anchoredSignals).toBe(0);
  });

  it('only marks a day on-chain with a confirmed status and a well-formed tx hash', () => {
    const s = toTrackRecordSummary(null, [
      { day: '2026-10-03', leaf_count: 7, status: 'confirmed', tx_hash: tx },
      { day: '2026-10-02', leaf_count: 4, status: 'pending', tx_hash: null },
      { day: '2026-10-01', leaf_count: 2, status: 'confirmed', tx_hash: 'javascript:alert(1)' },
      { day: 'not-a-day', leaf_count: 1, status: 'confirmed', tx_hash: tx },
    ]);
    expect(s.recent).toEqual([
      { day: '2026-10-03', leafCount: 7, onChain: true, txHash: tx },
      { day: '2026-10-02', leafCount: 4, onChain: false, txHash: null },
      { day: '2026-10-01', leafCount: 2, onChain: false, txHash: null },
    ]);
  });

  it('exposes no per-signal or per-user data and caps the day list', () => {
    const anchors = Array.from({ length: RECENT_ANCHOR_DAYS + 5 }, (_, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, '0')}`, leaf_count: 1, status: 'pending', tx_hash: null,
    }));
    const s = toTrackRecordSummary(null, anchors);
    expect(s.recent).toHaveLength(RECENT_ANCHOR_DAYS);
    expect(JSON.stringify(s)).not.toMatch(/user|signal_id|canonical/i);
  });
});

describe('readAllPages', () => {
  const source = Array.from({ length: 2500 }, (_, i) => i);
  const fetchPage = (from: number, to: number) =>
    Promise.resolve({ data: source.slice(from, to + 1), error: null });

  it('reads past the 1000-row response cap', async () => {
    const rows = await readAllPages(fetchPage);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toBe(2499);
  });

  it('stops on an exact multiple with one short (empty) page', async () => {
    const calls: number[] = [];
    const rows = await readAllPages((from, to) => {
      calls.push(from);
      return Promise.resolve({ data: source.slice(0, 2000).slice(from, to + 1), error: null });
    });
    expect(rows).toHaveLength(2000);
    expect(calls).toEqual([0, 1000, 2000]);
  });

  it('throws on an error instead of returning a partial set', async () => {
    await expect(readAllPages((from) =>
      Promise.resolve(from === 0 ? { data: source.slice(0, 1000), error: null } : { data: null, error: { message: 'boom' } })
    )).rejects.toThrow('boom');
  });

  it('refuses to return a set that hit the page ceiling', async () => {
    await expect(readAllPages(() => Promise.resolve({ data: [1, 2], error: null }), 2, 3)).rejects.toThrow();
  });
});

describe('recordable horizons', () => {
  it('only offers horizons the 24h scoring can judge', () => {
    expect(HORIZONS.map(h => h.id)).toEqual(['15m', '1h', '4h', '1d']);
  });

  it('rejects month / year horizons at the record route', () => {
    const base = { symbol: 'BTC', action: 'BUY', confidence: 60, entryPrice: 100, targetPrice: 110, stopLoss: 95, reasoning: 'x' };
    expect(validateSignalInput({ ...base, horizon: '1d' }).ok).toBe(true);
    for (const horizon of ['1mo', '1y']) {
      expect(validateSignalInput({ ...base, horizon })).toEqual({ ok: false, error: 'invalid_horizon' });
    }
  });
});
