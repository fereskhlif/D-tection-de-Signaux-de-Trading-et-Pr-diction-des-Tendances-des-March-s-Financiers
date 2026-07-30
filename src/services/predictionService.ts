/**
 * Prediction service — wraps mock data and exposes the same interface as the real API.
 * Swap the mock implementations for real `apiFetch` calls when backend is ready.
 */
import type { Stock, HistoryEntry, Alert, ForecastPoint, SectorStats } from "../types";
import { STOCKS, HISTORY_ENTRIES, ALERTS, generateForecast, SECTORS } from "../utils/data";

let _stocks = [...STOCKS];
let _alerts = [...ALERTS];

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

// ── Alerts ────────────────────────────────────────────────────────────────────

export function getAlerts(): Alert[] {
  return _alerts;
}

export function dismissAlert(id: string): Alert[] {
  _alerts = _alerts.filter(a => a.id !== id);
  return _alerts;
}

// ── Predictions ───────────────────────────────────────────────────────────────

export function getForecast(ticker: string, horizon = 5): ForecastPoint[] {
  const stock = getStockByTicker(ticker);
  if (!stock) return [];
  return generateForecast(stock, horizon);
}

// ── Sector stats ──────────────────────────────────────────────────────────────

export function getSectorStats(): SectorStats[] {
  return SECTORS;
}
