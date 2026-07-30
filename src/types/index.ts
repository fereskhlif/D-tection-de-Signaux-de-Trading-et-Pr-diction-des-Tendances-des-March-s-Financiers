export type Prediction = "Hausse" | "Stabilité" | "Baisse";
export type Plan = "visitor" | "free" | "premium";
export type Sector =
  | "Technologie"
  | "Finance"
  | "Santé"
  | "Industrie"
  | "Services publics"
  | "Crypto-monnaies";

export type FilterType = "Tous" | "Hausse" | "Stabilité" | "Baisse" | "Favoris";

export interface Stock {
  id: string;
  ticker: string;
  company: string;
  sector: Sector;
  price: number;
  dayChange: number;
  quarterChange: number;
  rsi: number;
  prediction: Prediction;
  confidence: number;
  isFavorite: boolean;
  seed: number;
  volatility?: number;
  high52?: number;
  low52?: number;
  volume?: number;
}

export interface PricePoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface ForecastPoint {
  day: string;
  price: number;
  upper: number;
  lower: number;
  changePct: number;
}

export interface HistoryEntry {
  id: string;
  ticker: string;
  date: string;
  predicted: Prediction;
  actual: Prediction;
  confidence: number;
}

export interface Alert {
  id: string;
  ticker: string;
  from: Prediction;
  to: Prediction;
  timeAgo: string;
  confidence: number;
}

export interface SectorStats {
  sector: Sector;
  performance: number;
  count: number;
  bullish: number;
  bearish: number;
  stable: number;
  avgConfidence: number;
  color: string;
}

export interface ModelAccuracyPoint {
  week: string;
  accuracy: number;
}

export interface ComparisonPoint {
  date: string;
  [ticker: string]: number | string;
}

export interface StockColors {
  [ticker: string]: string;
}
