/*
 * Walk-forward backtest of the deterministic (technical) signal engine.
 * Run: npm run backtest  → writes public/backtest-results.json
 *
 * Mirrors the rule-based logic in market.service.generateSignal (RSI / EMA
 * crossover / MACD with fixed % target & stop) and, at each step, uses ONLY
 * past candles to generate a signal, then looks 24h ahead to score the outcome.
 * This measures the technical baseline honestly — it is NOT the Claude analyst
 * layer (which can't be backtested per-point without huge API cost).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { TechnicalIndicators } from '../src/services/ai/indicators';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];
const SYMBOL_MAP: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT' };
const HOST = 'https://data-api.binance.vision';
const CANDLES_PER_COIN = 3000;
const LOOKBACK = 60;     // min history before generating a signal
const HORIZON = 24;      // evaluate outcome over the next 24 hours
const STEP = 3;          // sample every 3h to reduce overlapping trades

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchKlines(symbol: string, total: number): Promise<Candle[]> {
  const binanceSymbol = SYMBOL_MAP[symbol];
  const all: Candle[] = [];
  let endTime: number | undefined;
  while (all.length < total) {
    const limit = Math.min(1000, total - all.length);
    const url = new URL(`${HOST}/api/v3/klines`);
    url.searchParams.set('symbol', binanceSymbol);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('limit', String(limit));
    if (endTime) url.searchParams.set('endTime', String(endTime));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`klines ${symbol} HTTP ${res.status}`);
    const rows: any[] = await res.json();
    if (!rows.length) break;
    const candles: Candle[] = rows.map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
    all.unshift(...candles);
    endTime = candles[0].time - 1;
    if (rows.length < limit) break;
  }
  all.sort((a, b) => a.time - b.time);
  return all;
}

type Action = 'BUY' | 'SELL' | 'HOLD';

function genSignal(closes: number[]): Action {
  const ema20arr = TechnicalIndicators.calculateEMA(closes, 20);
  const ema50arr = TechnicalIndicators.calculateEMA(closes, 50);
  const ema20 = ema20arr.length ? ema20arr[ema20arr.length - 1] : closes[closes.length - 1];
  const ema50 = ema50arr.length ? ema50arr[ema50arr.length - 1] : closes[closes.length - 1];
  const rsi = TechnicalIndicators.calculateRSI(closes);
  const macd = TechnicalIndicators.calculateMACD(closes);

  let action: Action = 'HOLD';
  if (rsi < 30) action = 'BUY';
  else if (rsi > 70) action = 'SELL';
  if (action === 'HOLD') {
    if (ema20 > ema50) action = 'BUY';
    else if (ema20 < ema50) action = 'SELL';
  }
  // MACD must not contradict
  if (action === 'BUY' && macd.histogram < 0 && rsi >= 30) return 'HOLD';
  if (action === 'SELL' && macd.histogram > 0 && rsi <= 70) return 'HOLD';
  return action;
}

function scoreTrade(entry: number, action: Action, future: Candle[]): 'win' | 'loss' {
  const target = action === 'BUY' ? entry * 1.05 : entry * 0.95;
  const stop = action === 'BUY' ? entry * 0.98 : entry * 1.02;
  for (const c of future) {
    if (action === 'BUY') {
      if (c.high >= target) return 'win';
      if (c.low <= stop) return 'loss';
    } else {
      if (c.low <= target) return 'win';
      if (c.high >= stop) return 'loss';
    }
  }
  const finalClose = future[future.length - 1].close;
  if (action === 'BUY') return finalClose >= entry ? 'win' : 'loss';
  return finalClose <= entry ? 'win' : 'loss';
}

async function main() {
  let total = 0, wins = 0, losses = 0;
  const byAction: Record<string, { total: number; wins: number }> = { BUY: { total: 0, wins: 0 }, SELL: { total: 0, wins: 0 } };

  for (const sym of SYMBOLS) {
    process.stdout.write(`Backtesting ${sym}… `);
    const candles = await fetchKlines(sym, CANDLES_PER_COIN);
    let symTotal = 0, symWins = 0;

    for (let i = LOOKBACK; i < candles.length - HORIZON; i += STEP) {
      const closes = candles.slice(0, i + 1).map(c => c.close);
      const action = genSignal(closes);
      if (action === 'HOLD') continue;
      const entry = candles[i].close;
      const future = candles.slice(i + 1, i + 1 + HORIZON);
      const result = scoreTrade(entry, action, future);
      total++; symTotal++;
      byAction[action].total++;
      if (result === 'win') { wins++; symWins++; byAction[action].wins++; }
      else losses++;
    }
    console.log(`${symTotal} trades, ${symTotal ? ((symWins / symTotal) * 100).toFixed(1) : '0'}% win`);
  }

  const winRate = total ? (wins / total) * 100 : 0;
  const result = {
    generatedAt: new Date().toISOString(),
    engine: 'technical',
    coins: SYMBOLS,
    horizonHours: HORIZON,
    targetPct: 5,
    stopPct: 2,
    totalTrades: total,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    byAction: {
      BUY: { trades: byAction.BUY.total, winRate: byAction.BUY.total ? Number(((byAction.BUY.wins / byAction.BUY.total) * 100).toFixed(1)) : 0 },
      SELL: { trades: byAction.SELL.total, winRate: byAction.SELL.total ? Number(((byAction.SELL.wins / byAction.SELL.total) * 100).toFixed(1)) : 0 },
    },
    note: 'Walk-forward backtest of the technical engine on 1h candles. Overlapping trades and fees are not modeled. Past performance does not predict future results.',
  };

  const outPath = path.join(process.cwd(), 'public', 'backtest-results.json');
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`\nTotal: ${total} trades, ${winRate.toFixed(1)}% win rate → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
