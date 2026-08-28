/**
 * Prediction service — wraps mock data and exposes the same interface as the real API.
 * Swap the mock implementations for real `apiFetch` calls when backend is ready.
 */
import type { Stock, HistoryEntry, ForecastPoint, SectorStats } from "../types";
import { HISTORY_ENTRIES, generateForecast, SECTORS_LIST } from "../utils/data";

export interface AIPrediction {
  ticker: string;
  current_price?: number;
  prediction_date?: string;
  historical: {
    date: string;
    close: number;
  }[];
  forecast: {
    date: string;
    predicted_close: number;
  }[];
  trend_prediction: {
    signal: string;
    /** P1 brut du modèle LightGBM — sortie mathématique inchangée */
    confidence: number;
    /** P1 brut (alias de confidence pour traçabilité) */
    raw_confidence?: number;
    /** P1 - P2 : séparation entre les deux premières classes */
    margin?: number;
    /** Entropie de Shannon normalisée [0=certain, 1=aléatoire] */
    entropy?: number;
    /** Niveau de confiance lisible (Très élevée / Élevée / Moyenne / Faible / Très faible) */
    confidence_level?: string;
    /** Indice de fiabilité qualitatif (Très fiable / Fiable / Correcte / Ambiguë / Très ambiguë) */
    prediction_quality?: string;
    /** Explication en langage naturel */
    confidence_reason?: string;
    decision?: string;
    risk_level?: string;
    trade_allowed?: boolean;
    reason?: string;
    probabilities: {
      Hausse: number;
      Baisse: number;
      Stabilite: number;
    };
    model_prediction?: string;
    router_status?: string;
  };
  risk_management: {
    take_profit: number | null;
    stop_loss: number | null;
    risk_reward: number | null;
  };
}

let _stocks: Stock[] = [];

// ── Stocks ────────────────────────────────────────────────────────────────────

export function getAllStocks(): Stock[] {
  return _stocks;
}

export function getStockByTicker(ticker: string): Stock | undefined {
  return _stocks.find(s => s.ticker === ticker);
}

export function toggleFavorite(id: string): Stock[] {
  _stocks = _stocks.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s);
  return _stocks;
}

// ── History ───────────────────────────────────────────────────────────────────

export function getAllHistory(): HistoryEntry[] {
  return HISTORY_ENTRIES;
}

export function getHistoryByTicker(ticker: string): HistoryEntry[] {
  return HISTORY_ENTRIES.filter(e => e.ticker === ticker);
}



// ── Predictions ───────────────────────────────────────────────────────────────

export function getForecast(ticker: string, horizon = 5): ForecastPoint[] {
  const stock = getStockByTicker(ticker);
  if (!stock) return [];
  return generateForecast(stock, horizon);
}

// ── Sector stats ──────────────────────────────────────────────────────────────

export function getSectorStats(): SectorStats[] {
  return SECTORS_LIST.map(s => ({ sector: s, avgPerformance: 0, predictions: { Hausse: 0, Baisse: 0, Stabilite: 0 } })) as any;
}

import { apiFetch } from "./api";

export async function getAIPrediction(ticker: string): Promise<AIPrediction | null> {
  try {
    const res = await apiFetch<any>(`/predictions/${ticker}`);
    if (res.status === "error") {
      console.error(`[getAIPrediction] Error for ${ticker}:`, res.message);
      return null;
    }
    const data = res.data;
    // Normalise accented key that may arrive from Windows backend
    if (data?.trend_prediction?.probabilities) {
      const p = data.trend_prediction.probabilities;
      if ("Stabilité" in p) { p["Stabilite"] = p["Stabilité"]; delete p["Stabilité"]; }
    }
    console.log("[getAIPrediction] Live prediction data for", ticker, data);
    return data as AIPrediction;
  } catch (error) {
    console.error("Error fetching AI prediction:", error);
    return null;
  }
}

export async function getAllStocksDynamic(): Promise<any> {
  try {
    const res = await fetch("/api/stocks");
    if (!res.ok) throw new Error("Failed to fetch /api/stocks");
    return await res.json();
  } catch (error) {
    console.error("Error fetching all stocks dynamic:", error);
    return null;
  }
}

export async function getStockDetailDynamic(ticker: string, period: string = "1y"): Promise<any> {
  try {
    const res = await fetch(`/api/stock/${ticker}?period=${period}`);
    if (!res.ok) throw new Error(`Failed to fetch /api/stock/${ticker}`);
    return await res.json();
  } catch (error) {
    console.error(`Error fetching stock detail for ${ticker}:`, error);
    return null;
  }
}
