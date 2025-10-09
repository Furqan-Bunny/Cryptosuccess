export class CryptoPredictionModel {
  private model: any | null = null;
  private isTraining = false;
  private tf: any = null;

  constructor() {
    // Don't initialize immediately - wait for browser
  }

  private async ensureTensorFlow() {
    // Only import TensorFlow in browser environment
    if (typeof window === 'undefined') {
      throw new Error('TensorFlow.js requires browser environment');
    }

    if (!this.tf) {
      this.tf = await import('@tensorflow/tfjs');
    }
    return this.tf;
  }

  private async initializeModel() {
    const tf = await this.ensureTensorFlow();
    // Create a sequential model
    this.model = tf.sequential({
      layers: [
        // Input layer - takes in multiple features
        tf.layers.dense({
          inputShape: [10], // 10 features: price, volume, RSI, MACD, etc.
          units: 128,
          activation: 'relu',
        }),

        // Hidden layers
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),

        // Output layer - predicts 3 values: buy signal, sell signal, hold signal
        tf.layers.dense({
          units: 3,
          activation: 'softmax',
        }),
      ],
    });

    // Compile the model
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  }

  // Prepare features from market data
  private prepareFeatures(marketData: any[]): any {
    const features = marketData.map(data => [
      data.price / 100000, // Normalize price
      data.volume / 1000000, // Normalize volume
      data.priceChange24h / 100, // Normalize 24h change
      data.rsi / 100, // RSI is already 0-100
      data.macd.signal / 100,
      data.macd.histogram / 100,
      data.bollinger.upper / 100000,
      data.bollinger.lower / 100000,
      data.ema50 / 100000,
      data.ema200 / 100000,
    ]);

    return this.tf.tensor2d(features);
  }

  // Train the model with historical data
  async train(trainingData: any[], labels: number[][]): Promise<void> {
    await this.ensureTensorFlow();

    if (!this.model) {
      await this.initializeModel();
    }

    if (this.isTraining) {
      throw new Error('Model is already training');
    }

    this.isTraining = true;

    try {
      const xs = this.prepareFeatures(trainingData);
      const ys = this.tf.tensor2d(labels);

      // Train the model
      await this.model!.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch: number, logs: any) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss?.toFixed(4)}, accuracy = ${logs?.acc?.toFixed(4)}`);
          },
        },
      });

      // Clean up tensors
      xs.dispose();
      ys.dispose();
    } finally {
      this.isTraining = false;
    }
  }

  // Make predictions
  async predict(marketData: any): Promise<{
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    signals: {
      buy: number;
      sell: number;
      hold: number;
    };
  }> {
    await this.ensureTensorFlow();

    if (!this.model) {
      await this.initializeModel();
    }

    const features = this.prepareFeatures([marketData]);
    const prediction = this.model.predict(features);
    const probabilities = await prediction.data();

    features.dispose();
    prediction.dispose();

    const [buyProb, sellProb, holdProb] = probabilities;

    // Determine action based on highest probability
    let action: 'buy' | 'sell' | 'hold';
    let confidence: number;

    if (buyProb > sellProb && buyProb > holdProb) {
      action = 'buy';
      confidence = buyProb;
    } else if (sellProb > buyProb && sellProb > holdProb) {
      action = 'sell';
      confidence = sellProb;
    } else {
      action = 'hold';
      confidence = holdProb;
    }

    return {
      action,
      confidence: confidence * 100, // Convert to percentage
      signals: {
        buy: buyProb * 100,
        sell: sellProb * 100,
        hold: holdProb * 100,
      },
    };
  }

  // Save model to browser storage
  async save(): Promise<void> {
    await this.ensureTensorFlow();

    if (!this.model) {
      throw new Error('Model not initialized');
    }
    await this.model.save('localstorage://crypto-prediction-model');
  }

  // Load model from browser storage
  async load(): Promise<void> {
    await this.ensureTensorFlow();

    try {
      this.model = await this.tf.loadLayersModel('localstorage://crypto-prediction-model');
    } catch (error) {
      console.log('No saved model found, using new model');
      await this.initializeModel();
    }
  }
}