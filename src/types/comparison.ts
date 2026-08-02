export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface HistoryResponse {
  ticker: string;
  name: string;
  period: string;
  interval: string;
  history: HistoricalPrice[];
  count: number;
}

export interface ChartPoint {
  date: string;
  value: number;
}

export interface ComparisonSeries {
  ticker: string;
  name: string;
  data: ChartPoint[];
  color: string;
}

export interface Statistics {
  ticker: string;
  totalReturn: number;
  performance: number;
  volatility: number;
  avgReturn: number;
  maxPrice: number;
  minPrice: number;
  maxDrawdown: number;
  currentDrawdown: number;
  stdDev: number;
  sessions: number;
  cagr: number;
  sharpe: number;
}

export interface CorrelationCell {
  tickerA: string;
  tickerB: string;
  value: number;
}

export interface ComparisonResponse {
  series: ComparisonSeries[];
  correlation: CorrelationCell[];
  statistics: Statistics[];
  tickers: string[];
  period: string;
  interval: string;
}

export interface TickerResult {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
  assetType: string;
}

export interface Prediction {
  ticker: string;
  label: "Hausse" | "Baisse" | "Stabilité";
  confidence: number;
}
