export class CryptoPredictionModel {
  private model: any | null = null;
  private isTraining = false;
  private isTrained = false;
  private tf: any = null; // TensorFlow.js handle (lazy)
  private readonly timeframe: string; // which timeframe this model is for

  // Each instance is bound to a timeframe; its weights are loaded from
  // /models/crypto-{tf}/. Defaults to 1h for backward compatibility.
  constructor(timeframe: string = '1h') {
    this.timeframe = timeframe;
  }

  // True only once a model has been loaded from storage or freshly trained.
  // A freshly initialized (untrained) model would produce random predictions,
  // so callers use this to fall back to rule-based signals instead.
  hasTrainedModel(): boolean {
    return this.isTrained;
  }

  static readonly TIMESTEPS = 24;
  static readonly FEATURES = 12;
  // Legacy shipped model (1h) — kept as a fallback for the 1h timeframe.
  static readonly LEGACY_MODEL_URL = '/models/crypto-prediction-model/model.json';

  private shippedUrl(): string {
    return `/models/crypto-${this.timeframe}/model.json`;
  }
  private idbKey(): string {
    return `indexeddb://crypto-prediction-model-${this.timeframe}`;
  }

  private async ensureTensorFlow() {
    if (typeof window === 'undefined') {
      throw new Error('TensorFlow.js requires browser environment');
    }

    if (!this.tf) {
      try {
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();

        // A backend chunk can fail to load (e.g. served as a static export),
        // leaving the engine with no active backend. Running an op then throws
        // deep errors like "Cannot read properties of undefined (reading 'sqrt')"
        // from layer initializers. Explicitly activate a backend and verify it
        // before any op runs, so callers fall back instead of crashing.
        if (!tf.getBackend()) {
          for (const backend of ['webgl', 'cpu']) {
            try {
              if (await tf.setBackend(backend)) break;
            } catch {
              // try the next backend
            }
          }
          await tf.ready();
        }

        if (!tf.getBackend()) {
          throw new Error('No TensorFlow.js compute backend is available');
        }

        this.tf = tf;
      } catch (error) {
        this.tf = null; // allow a retry on the next attempt
        console.error('Failed to initialize TensorFlow.js:', error);
        throw new Error('TensorFlow.js initialization failed. Please refresh the page.');
      }
    }
    return this.tf;
  }

  private async initializeModel() {
    const tf = await this.ensureTensorFlow();

    this.model = tf.sequential();

    // LSTM layer: input [24 timesteps, 12 features]
    this.model.add(tf.layers.lstm({
      inputShape: [CryptoPredictionModel.TIMESTEPS, CryptoPredictionModel.FEATURES],
      units: 32,
      returnSequences: false,
    }));

    this.model.add(tf.layers.dropout({ rate: 0.2 }));

    this.model.add(tf.layers.dense({
      units: 16,
      activation: 'relu',
    }));

    // Output: 3 classes (BUY, SELL, HOLD)
    this.model.add(tf.layers.dense({
      units: 3,
      activation: 'softmax',
    }));

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  }

  // Train with windowed data: xs shape [numSamples, 24, 12], ys shape [numSamples, 3]
  async train(
    windowedFeatures: number[][][],
    labels: number[][],
    options?: { epochs?: number; earlyStoppingPatience?: number; validationSplit?: number }
  ): Promise<{ finalLoss: number; finalAccuracy: number }> {
    const tf = await this.ensureTensorFlow();
    if (!this.model) await this.initializeModel();
    if (this.isTraining) throw new Error('Model is already training');

    this.isTraining = true;
    try {
      const xs = tf.tensor3d(windowedFeatures);
      const ys = tf.tensor2d(labels);

      // Early stopping via manual tracking
      const patience = options?.earlyStoppingPatience ?? 5;
      let bestValLoss = Infinity;
      let waitCount = 0;

      const result = await this.model.fit(xs, ys, {
        epochs: options?.epochs ?? 50,
        batchSize: 32,
        validationSplit: options?.validationSplit ?? 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch: number, logs: any) => {
            console.log(`Epoch ${epoch + 1}: loss=${logs?.loss?.toFixed(4)}, acc=${logs?.acc?.toFixed(4)}, val_loss=${logs?.val_loss?.toFixed(4)}`);
            const valLoss = logs?.val_loss ?? logs?.loss;
            if (valLoss < bestValLoss - 0.001) {
              bestValLoss = valLoss;
              waitCount = 0;
            } else {
              waitCount++;
              if (waitCount >= patience) {
                this.model.stopTraining = true;
              }
            }
          },
        },
      });

      xs.dispose();
      ys.dispose();

      const history = result.history;
      this.isTrained = true;
      return {
        finalLoss: history.loss[history.loss.length - 1] as number,
        finalAccuracy: history.acc[history.acc.length - 1] as number,
      };
    } finally {
      this.isTraining = false;
    }
  }

  // Predict: input is a single window [24][12]
  async predict(window: number[][]): Promise<{
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    signals: { buy: number; sell: number; hold: number };
  }> {
    const tf = await this.ensureTensorFlow();
    if (!this.model) await this.initializeModel();

    const input = tf.tensor3d([window]); // Shape: [1, 24, 12]
    const prediction = this.model.predict(input);
    const probabilities = await prediction.data();

    input.dispose();
    prediction.dispose();

    const [buyProb, sellProb, holdProb] = probabilities;
    let action: 'buy' | 'sell' | 'hold';
    let confidence: number;

    if (buyProb > sellProb && buyProb > holdProb) {
      action = 'buy'; confidence = buyProb;
    } else if (sellProb > buyProb && sellProb > holdProb) {
      action = 'sell'; confidence = sellProb;
    } else {
      action = 'hold'; confidence = holdProb;
    }

    return {
      action,
      confidence: confidence * 100,
      signals: { buy: buyProb * 100, sell: sellProb * 100, hold: holdProb * 100 },
    };
  }

  async save(): Promise<void> {
    await this.ensureTensorFlow();
    if (!this.model) throw new Error('Model not initialized');
    await this.model.save(this.idbKey());
  }

  private compileLoaded(tf: any) {
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  }

  async load(): Promise<void> {
    const tf = await this.ensureTensorFlow();

    // 1) A user's own retrained model for this timeframe (IndexedDB).
    try {
      this.model = await tf.loadLayersModel(this.idbKey());
      this.compileLoaded(tf);
      this.isTrained = true;
      return;
    } catch {
      // nothing saved locally — fall through to the shipped model
    }

    // 2) The generalized model shipped for this timeframe (/models/crypto-{tf}/).
    try {
      this.model = await tf.loadLayersModel(this.shippedUrl());
      this.compileLoaded(tf);
      this.isTrained = true;
      return;
    } catch {
      // not shipped yet — fall through
    }

    // 3) Legacy 1h model fallback (the original shipped model).
    if (this.timeframe === '1h') {
      try {
        this.model = await tf.loadLayersModel(CryptoPredictionModel.LEGACY_MODEL_URL);
        this.compileLoaded(tf);
        this.isTrained = true;
        return;
      } catch {
        // fall through
      }
    }

    // 4) Fresh, untrained model → callers fall back to the technical engine.
    console.log(`No trained model available for ${this.timeframe}, using fresh model`);
    await this.initializeModel();
    this.isTrained = false;
  }
}
