export interface StockDetailHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number;
  sma50?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  macd_histogram?: number;
}

export interface StockDetailPrediction {
  model: string;
  direction: "Hausse" | "Baisse" | "Stabilité" | "Stabilite" | string;
  confidence: number;
  probabilities: {
    Baisse: number;
    Stabilite: number;
    Hausse: number;
  };
  level: string;
}

export interface StockDetailResponse {
  ticker: string;
  company_name: string;
  market: {
    price: number;
    change: number;
    change_percent: number;
    timestamp: string;
  };
  history: StockDetailHistory[];
  prediction: StockDetailPrediction;
}
