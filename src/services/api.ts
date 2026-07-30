/**
 * API service interface — replace mock implementations with real HTTP calls.
 */
import type { Stock, HistoryEntry, Alert, ForecastPoint } from "../types";

export interface ApiResponse<T> {
  data: T;
  status: "success" | "error";
  message?: string;
}

export interface StocksApi {
  fetchAll(): Promise<ApiResponse<Stock[]>>;
  fetchById(id: string): Promise<ApiResponse<Stock>>;
  toggleFavorite(id: string): Promise<ApiResponse<Stock>>;
}

export interface HistoryApi {
  fetchAll(): Promise<ApiResponse<HistoryEntry[]>>;
  fetchByTicker(ticker: string): Promise<ApiResponse<HistoryEntry[]>>;
}

export interface AlertsApi {
  fetchAll(): Promise<ApiResponse<Alert[]>>;
  dismiss(id: string): Promise<ApiResponse<void>>;
}

export interface PredictionsApi {
  fetchForecast(ticker: string, horizon: number): Promise<ApiResponse<ForecastPoint[]>>;
}

// Base URL for future integration
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

// Generic fetch helper — ready for real API calls
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, status: "success" };
  } catch (err) {
    return { data: null as unknown as T, status: "error", message: String(err) };
  }
}
