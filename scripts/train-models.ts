/*
 * Generalized multi-timeframe trainer.   Run: npm run train:models
 *
 * Trains ONE model per timeframe (1h / 4h / 1d) on a POOL of many coins. Because
 * the 12 features (src/services/ai/indicators.ts) are normalized / coin-agnostic,
 * each model generalizes to ANY coin at inference time. Writes tfjs layers-models
 * to public/models/crypto-{tf}/ and merges honest, time-held-out test accuracy
 * into public/backtest-results.json under `models`.
 *
 * Uses pure @tensorflow/tfjs on CPU (cross-platform, no native deps).
 */
import * as tf from '@tensorflow/tfjs';
import { promises as fs } from 'fs';
import path from 'path';
import { TechnicalIndicators } from '../src/services/ai/indicators';

// A basket of liquid coins to learn generic price-action patterns from.
const COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'LTC', 'ATOM', 'UNI', 'TRX', 'BCH', 'NEAR', 'APT', 'ARB', 'OP',
];

const TF_CONFIG = [
  { tf: '1h', candles: 5000, lookahead: 24 },
  { tf: '4h', candles: 3000, lookahead: 30 },
  { tf: '1d', candles: 1500, lookahead: 14 },
];

const HOST = 'https://data-api.binance.vision';
const LOOKBACK = 50;
const TIMESTEPS = 24;
const FEATURES = 12;
const MAX_TRAIN_SAMPLES = 40000; // cap pooled samples to keep CPU training tractable
const EPOCHS = 40;
const PATIENCE = 5;

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchKlines(symbol: string, interval: string, total: number): Promise<Candle[]> {
  const pair = `${symbol}USDT`;
  const all: Candle[] = [];
  let endTime: number | undefined;
  while (all.length < total) {
    const limit = Math.min(1000, total - all.length);
    const url = new URL(`${HOST}/api/v3/klines`);
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));
    if (endTime) url.searchParams.set('endTime', String(endTime));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
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

interface Sample { window: number[][]; label: number[]; }

function buildSamples(candles: Candle[], lookahead: number): Sample[] {
  const out: Sample[] = [];
  if (candles.length < LOOKBACK + TIMESTEPS + lookahead + 5) return out;

  const allFeatures: number[][] = [];
  for (let i = LOOKBACK; i < candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
    allFeatures.push(TechnicalIndicators.prepareNormalizedFeatures(slice));
  }

  for (let i = TIMESTEPS; i < allFeatures.length - lookahead; i++) {
    const window = allFeatures.slice(i - TIMESTEPS, i);
    const candleIdx = i + LOOKBACK;
    const currentPrice = candles[candleIdx].close;
    const futurePrice = candles[candleIdx + lookahead].close;
    const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

    const sliceForATR = candles.slice(Math.max(0, candleIdx - 50), candleIdx + 1);
    const atrPercent = TechnicalIndicators.calculateATRPercent(
      sliceForATR.map(c => c.high), sliceForATR.map(c => c.low), sliceForATR.map(c => c.close),
    );
    const threshold = Math.max(atrPercent, 1);

    let label: number[];
    if (priceChange > threshold) label = [1, 0, 0];
    else if (priceChange < -threshold) label = [0, 1, 0];
    else label = [0, 0, 1];
    out.push({ window, label });
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.lstm({ inputShape: [TIMESTEPS, FEATURES], units: 24, returnSequences: false }));
  model.add(tf.layers.dropout({ rate: 0.35 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.0008), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return model;
}

async function evaluate(model: tf.LayersModel, test: Sample[]): Promise<{ winRate: number; samples: number; directional: number }> {
  // Directional accuracy on time-held-out data: among real BUY/SELL labels,
  // how often does the model predict the same direction?
  let directional = 0, correct = 0;
  const BATCH = 1000;
  for (let i = 0; i < test.length; i += BATCH) {
    const chunk = test.slice(i, i + BATCH);
    const xs = tf.tensor3d(chunk.map(s => s.window), [chunk.length, TIMESTEPS, FEATURES]);
    const preds = model.predict(xs) as tf.Tensor;
    const data = await preds.data();
    xs.dispose(); preds.dispose();
    for (let j = 0; j < chunk.length; j++) {
      const trueIdx = chunk[j].label.indexOf(1);
      if (trueIdx === 2) continue; // skip HOLD — measure directional skill only
      const p = [data[j * 3], data[j * 3 + 1], data[j * 3 + 2]];
      const predIdx = p.indexOf(Math.max(...p));
      directional++;
      if (predIdx === trueIdx) correct++;
    }
  }
  return { winRate: directional ? Number(((correct / directional) * 100).toFixed(1)) : 0, samples: test.length, directional };
}

async function trainForTimeframe(cfg: { tf: string; candles: number; lookahead: number }) {
  console.log(`\n=== Timeframe ${cfg.tf} (lookahead ${cfg.lookahead}) ===`);
  const train: Sample[] = [];
  const test: Sample[] = [];

  for (const sym of COINS) {
    try {
      process.stdout.write(`  ${sym}… `);
      const candles = await fetchKlines(sym, cfg.tf, cfg.candles);
      const samples = buildSamples(candles, cfg.lookahead);
      // Time-ordered split: last 15% is genuinely future data → honest test set.
      const cut = Math.floor(samples.length * 0.85);
      train.push(...samples.slice(0, cut));
      test.push(...samples.slice(cut));
      console.log(`${candles.length} candles → ${samples.length} samples`);
    } catch (e: any) {
      console.log(`skip (${e.message})`);
    }
  }

  if (train.length < 500) throw new Error(`Not enough training data for ${cfg.tf} (${train.length})`);

  // Subsample training to keep CPU fit tractable.
  shuffle(train);
  const trainSet = train.slice(0, MAX_TRAIN_SAMPLES);

  const counts = [0, 0, 0];
  trainSet.forEach(s => counts[s.label.indexOf(1)]++);
  console.log(`  train ${trainSet.length} (BUY/SELL/HOLD ${counts.join('/')}), test ${test.length}`);

  const tot = trainSet.length;
  const classWeight: Record<number, number> = {
    0: tot / (3 * Math.max(1, counts[0])),
    1: tot / (3 * Math.max(1, counts[1])),
    2: tot / (3 * Math.max(1, counts[2])),
  };

  const xs = tf.tensor3d(trainSet.map(s => s.window), [trainSet.length, TIMESTEPS, FEATURES]);
  const ys = tf.tensor2d(trainSet.map(s => s.label), [trainSet.length, 3]);

  const model = buildModel();
  let bestValLoss = Infinity, bestWeights: any[] | null = null, wait = 0;

  await model.fit(xs, ys, {
    epochs: EPOCHS, batchSize: 32, validationSplit: 0.2, shuffle: true, classWeight,
    callbacks: {
      onEpochEnd: (epoch: number, logs: any) => {
        console.log(`  epoch ${epoch + 1}/${EPOCHS} loss=${logs?.loss?.toFixed(4)} val_loss=${logs?.val_loss?.toFixed(4)} val_acc=${(logs?.val_acc ?? logs?.val_accuracy)?.toFixed?.(4)}`);
        const vl = logs?.val_loss ?? logs?.loss ?? Infinity;
        if (vl < bestValLoss - 1e-4) {
          bestValLoss = vl; wait = 0;
          if (bestWeights) bestWeights.forEach(t => t.dispose());
          bestWeights = model.getWeights().map((w: any) => w.clone());
        } else if (++wait >= PATIENCE) {
          (model as any).stopTraining = true;
        }
      },
    },
  });

  if (bestWeights) {
    model.setWeights(bestWeights as any);
    bestWeights.forEach(t => t.dispose());
  }
  xs.dispose(); ys.dispose();

  const metrics = await evaluate(model, test);
  console.log(`  ${cfg.tf} out-of-sample directional accuracy: ${metrics.winRate}% (${metrics.directional} BUY/SELL trades)`);

  const outDir = path.join(process.cwd(), 'public', 'models', `crypto-${cfg.tf}`);
  await fs.mkdir(outDir, { recursive: true });
  await model.save(tf.io.withSaveHandler(async (artifacts: any) => {
    await fs.writeFile(path.join(outDir, 'weights.bin'), Buffer.from(artifacts.weightData as ArrayBuffer));
    await fs.writeFile(path.join(outDir, 'model.json'), JSON.stringify({
      modelTopology: artifacts.modelTopology,
      format: 'layers-model',
      generatedBy: 'cryptosuccess train:models',
      convertedBy: null,
      weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
    }));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));
  model.dispose();
  console.log(`  saved → ${outDir}`);

  return { winRate: metrics.winRate, directionalTrades: metrics.directional, lookahead: cfg.lookahead };
}

async function main() {
  await tf.setBackend('cpu');
  await tf.ready();
  console.log('TensorFlow backend:', tf.getBackend());

  const models: Record<string, any> = {};
  for (const cfg of TF_CONFIG) {
    models[cfg.tf] = await trainForTimeframe(cfg);
  }

  // Merge per-timeframe model metrics into backtest-results.json (preserve the
  // existing technical-engine top-level fields used by the TrackRecord card).
  const outPath = path.join(process.cwd(), 'public', 'backtest-results.json');
  let existing: any = {};
  try { existing = JSON.parse(await fs.readFile(outPath, 'utf8')); } catch { /* none yet */ }
  existing.models = { generatedAt: new Date().toISOString(), coins: COINS.length, byTimeframe: models };
  await fs.writeFile(outPath, JSON.stringify(existing, null, 2));
  console.log(`\nMerged model metrics → ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
