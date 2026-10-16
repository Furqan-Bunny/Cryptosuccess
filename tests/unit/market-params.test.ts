import {
  parseBoundedInt,
  parseDepthLimit,
  parseKlineInterval,
  parseMarketSymbol,
} from '../../src/lib/market-params';

describe('parseMarketSymbol', () => {
  it('maps catalogue symbols case-insensitively', () => {
    expect(parseMarketSymbol('btc')).toEqual({ symbol: 'BTC', pair: 'BTCUSDT' });
    expect(parseMarketSymbol(' PEPE ')).toEqual({ symbol: 'PEPE', pair: 'PEPEUSDT' });
  });

  it('falls back to SYMBOLUSDT for other well-formed tickers', () => {
    expect(parseMarketSymbol('WIF')).toEqual({ symbol: 'WIF', pair: 'WIFUSDT' });
  });

  it('rejects anything that is not a plain ticker', () => {
    for (const bad of [null, undefined, '', 'BTC&limit=5000', '../x', 'BTC USDT', 'A'.repeat(16), 'ÉTH']) {
      expect(parseMarketSymbol(bad)).toBeNull();
    }
  });
});

describe('parseKlineInterval', () => {
  it('defaults when missing and allows Binance intervals', () => {
    expect(parseKlineInterval(null)).toBe('1h');
    expect(parseKlineInterval('15m')).toBe('15m');
    expect(parseKlineInterval('1M')).toBe('1M');
  });

  it('rejects unknown intervals', () => {
    expect(parseKlineInterval('7m')).toBeNull();
    expect(parseKlineInterval('1h;drop')).toBeNull();
  });
});

describe('parseBoundedInt', () => {
  it('defaults, clamps and rejects non-integers', () => {
    expect(parseBoundedInt(null, 100, 1, 1000)).toBe(100);
    expect(parseBoundedInt('5000', 100, 1, 1000)).toBe(1000);
    expect(parseBoundedInt('0', 100, 1, 1000)).toBe(1);
    expect(parseBoundedInt('-5', 100, 1, 1000)).toBeNull();
    expect(parseBoundedInt('12.5', 100, 1, 1000)).toBeNull();
    expect(parseBoundedInt('abc', 100, 1, 1000)).toBeNull();
  });
});

describe('parseDepthLimit', () => {
  it('snaps to an allowed Binance depth', () => {
    expect(parseDepthLimit(null)).toBe(20);
    expect(parseDepthLimit('20')).toBe(20);
    expect(parseDepthLimit('21')).toBe(50);
    expect(parseDepthLimit('3')).toBe(5);
    expect(parseDepthLimit('99999')).toBe(1000);
    expect(parseDepthLimit('x')).toBeNull();
  });
});
