import axios from 'axios';

export interface SentimentData {
  value: number;
  classification: string;
  timestamp: Date;
}

class SentimentService {
  private cache: { data: SentimentData | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async getFearGreedIndex(): Promise<SentimentData> {
    if (this.cache.data && (Date.now() - this.cache.fetchedAt) < this.CACHE_DURATION) {
      return this.cache.data;
    }

    const response = await axios.get('/api/market/sentiment');
    const item = response.data.data[0];
    const result: SentimentData = {
      value: parseInt(item.value, 10),
      classification: item.value_classification,
      timestamp: new Date(parseInt(item.timestamp, 10) * 1000),
    };

    this.cache = { data: result, fetchedAt: Date.now() };
    return result;
  }

  async getHistoricalSentiment(days: number = 30): Promise<SentimentData[]> {
    const response = await axios.get('/api/market/sentiment', {
      params: { limit: days },
    });
    return response.data.data.map((item: any) => ({
      value: parseInt(item.value, 10),
      classification: item.value_classification,
      timestamp: new Date(parseInt(item.timestamp, 10) * 1000),
    }));
  }
}

export const sentimentService = new SentimentService();
