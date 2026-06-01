/*
 * Offline trainer for the CryptoSuccess LSTM.   Run: npm run train:model
 *
 * Trains the SAME architecture the browser uses (src/services/ai/model.ts) on
 * the SAME 12 normalized features (src/services/ai/indicators.ts) and the same
 * ATR-based labels (src/services/ai/training.service.ts), then writes a tfjs
 * layers-model to public/models/crypto-prediction-model/ so the app can serve
 * it to every user. Uses pure @tensorflow/tfjs on the CPU backend (no native
 * deps, cross-platform).
 */
import * as tf from '@tensorflow/tfjs';
import { promises as fs } from 'fs';
import path from 'path';
import { TechnicalIndicators } from '../src/services/ai/indicators';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'];
const SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT',
};
const HOST = 'https://data-api.binance.vision';
const CANDLES_PER_COIN = 5000; // ~208 days of 1h candles (5 paginated requests)
const LOOKBACK = 50;
const TIMESTEPS = 24; // must match CryptoPredictionModel.TIMESTEPS
const FEATURES = 12;  // must match prepareNormalizedFeatures output
const LOOKAHEAD = 24;
const EPOCHS = 60;   // upper bound; early stopping ends sooner
const PATIENCE = 5;  // early-stopping patience on val_loss

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

    const candles: Candle[] = rows.map(r => ({
      time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
    }));
    all.unshift(...candles);
    endTime = candles[0].time - 1;
    if (rows.length < limit) break;
  }

  all.sort((a, b) => a.time - b.time);
  return all;
}

function buildWindowsAndLabels(candles: Candle[]) {
  const windows: number[][][] = [];
  const labels: number[][] = [];
  if (candles.length < LOOKBACK + TIMESTEPS + LOOKAHEAD + 5) return { windows, labels };

  const allFeatures: number[][] = [];
  for (let i = LOOKBACK; i < candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - LOOKBACK), i + 1);
    allFeatures.push(TechnicalIndicators.prepareNormalizedFeatures(slice));
  }

  for (let i = TIMESTEPS; i < allFeatures.length - LOOKAHEAD; i++) {
    const window = allFeatures.slice(i - TIMESTEPS, i);
    const candleIdx = i + LOOKBACK;
    const currentPrice = candles[candleIdx].close;
    const futurePrice = candles[candleIdx + LOOKAHEAD].close;
    const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

    const sliceForATR = candles.slice(Math.max(0, candleIdx - 50), candleIdx + 1);
    const atrPercent = TechnicalIndicators.calculateATRPercent(
      sliceForATR.map(c => c.high), sliceForATR.map(c => c.low), sliceForATR.map(c => c.close),
    );
    const threshold = Math.max(atrPercent, 1);

    if (priceChange > threshold) labels.push([1, 0, 0]);
    else if (priceChange < -threshold) labels.push([0, 1, 0]);
    else labels.push([0, 0, 1]);
    windows.push(window);
  }

  return { windows, labels };
}

async function main() {
  await tf.setBackend('cpu');
  await tf.ready();
  console.log('TensorFlow backend:', tf.getBackend());

  const allWindows: number[][][] = [];
  const allLabels: number[][] = [];

  for (const sym of SYMBOLS) {
    process.stdout.write(`Fetching ${sym}… `);
    const candles = await fetchKlines(sym, CANDLES_PER_COIN);
    const { windows, labels } = buildWindowsAndLabels(candles);
    console.log(`${candles.length} candles → ${windows.length} samples`);
    allWindows.push(...windows);
    allLabels.push(...labels);
  }

  console.log(`Total samples: ${allWindows.length}`);
  if (allWindows.length < 200) throw new Error('Not enough training data');

  const counts = [0, 0, 0];
  allLabels.forEach(l => { counts[l.indexOf(1)]++; });
  console.log('Label distribution [BUY, SELL, HOLD]:', counts);

  const total = allLabels.length;
  const classWeight: Record<number, number> = {
    0: total / (3 * Math.max(1, counts[0])),
    1: total / (3 * Math.max(1, counts[1])),
    2: total / (3 * Math.max(1, counts[2])),
  };

  const xs = tf.tensor3d(allWindows, [allWindows.length, TIMESTEPS, FEATURES]);
  const ys = tf.tensor2d(allLabels, [allLabels.length, 3]);

  const model = tf.sequential();
  // Lower capacity + stronger dropout + L2 to curb the overfitting seen with units:32/dropout:0.2.
  model.add(tf.layers.lstm({ inputShape: [TIMESTEPS, FEATURES], units: 24, returnSequences: false }));
  model.add(tf.layers.dropout({ rate: 0.35 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.0008), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

  let bestValLoss = Infinity;
  let bestWeights: any[] | null = null;
  let wait = 0;

  await model.fit(xs, ys, {
    epochs: EPOCHS,
    batchSize: 32,
    validationSplit: 0.2,
    shuffle: true,
    classWeight,
    callbacks: {
      onEpochEnd: (epoch: number, logs: any) => {
        console.log(
          `epoch ${epoch + 1}/${EPOCHS} ` +
          `loss=${logs?.loss?.toFixed(4)} acc=${(logs?.acc ?? logs?.accuracy)?.toFixed?.(4)} ` +
          `val_loss=${logs?.val_loss?.toFixed(4)} val_acc=${(logs?.val_acc ?? logs?.val_accuracy)?.toFixed?.(4)}`,
        );
        const vl = logs?.val_loss ?? logs?.loss ?? Infinity;
        if (vl < bestValLoss - 1e-4) {
          bestValLoss = vl;
          wait = 0;
          if (bestWeights) bestWeights.forEach(t => t.dispose());
          bestWeights = model.getWeights().map((w: any) => w.clone());
        } else if (++wait >= PATIENCE) {
          (model as any).stopTraining = true;
        }
      },
    },
  });

  // Restore the best-val_loss weights — tfjs early stopping doesn't do this itself.
  if (bestWeights) {
    model.setWeights(bestWeights as any);
    bestWeights.forEach(t => t.dispose());
    console.log(`Restored best weights (val_loss=${bestValLoss.toFixed(4)})`);
  }

  xs.dispose();
  ys.dispose();

  const outDir = path.join(process.cwd(), 'public', 'models', 'crypto-prediction-model');
  await fs.mkdir(outDir, { recursive: true });

  await model.save(tf.io.withSaveHandler(async (artifacts: any) => {
    await fs.writeFile(path.join(outDir, 'weights.bin'), Buffer.from(artifacts.weightData as ArrayBuffer));
    const modelJson = {
      modelTopology: artifacts.modelTopology,
      format: 'layers-model',
      generatedBy: 'cryptosuccess train:model',
      convertedBy: null,
      weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
    };
    await fs.writeFile(path.join(outDir, 'model.json'), JSON.stringify(modelJson));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));

  console.log('Saved model →', outDir);
}

main().catch(err => { console.error(err); process.exit(1); });
