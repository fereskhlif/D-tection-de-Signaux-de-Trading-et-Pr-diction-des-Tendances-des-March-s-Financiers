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
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// Generic fetch helper — ready for real API calls
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const token = localStorage.getItem("access_token");
    const headers = new Headers({ "Content-Type": "application/json", ...options?.headers });
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      // Handle logout/redirect at context level
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, status: "success" };
  } catch (err) {
    return { data: null as unknown as T, status: "error", message: String(err) };
  }
}

export interface ModelInfo {
  model_name: string;
  model_version: string;
  model_type: string;
  prediction_horizon: string;
  feature_count: number;
  meta_model: string | null;
  calibrator: string | null;
  conditional_regressors: string | null;
  selective_prediction: boolean;
  performance: number | null;
}

export const aiModelService = {
  getModelInfo: async (): Promise<ApiResponse<ModelInfo>> => {
    return apiFetch<ModelInfo>('/model/info');
  }
};

