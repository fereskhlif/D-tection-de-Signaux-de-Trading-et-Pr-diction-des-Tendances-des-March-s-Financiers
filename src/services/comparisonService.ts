import axios from "axios";
import type { ComparisonResponse, HistoryResponse, TickerResult } from "../types/comparison";

const api = axios.create({
  baseURL: "/api",
});

export const comparisonService = {
  getComparison: async (
    tickers: string[],
    period: string = "30d",
    interval: string = "1d",
    signal?: AbortSignal
  ): Promise<ComparisonResponse> => {
    try {
      console.debug("API GET /compare", { tickers, period, interval });
      const { data } = await api.get<ComparisonResponse>("/compare", {
        params: {
          tickers: tickers.join(","),
          period,
          interval,
        },
        signal,
      });
      console.debug("API /compare response", data);
      return data;
    } catch (err: any) {
      console.error("comparisonService.getComparison error:", err.response?.status, err.response?.data || err.message || err);
      throw err;
    }
  },

  getHistory: async (
    ticker: string,
    period: string = "30d",
    interval: string = "1d",
    signal?: AbortSignal
  ): Promise<HistoryResponse> => {
    const { data } = await api.get<HistoryResponse>(`/history/${ticker}`, {
      params: { period, interval },
      signal,
    });
    return data;
  },

  searchTicker: async (q: string, signal?: AbortSignal): Promise<TickerResult[]> => {
    if (!q) return [];
    try {
      console.debug("API GET /search", { q });
      const { data } = await api.get<TickerResult[]>("/search", {
        params: { q },
        signal,
      });
      console.debug("API /search response", data?.length);
      return data;
    } catch (err: any) {
      console.error("comparisonService.searchTicker error:", err.response?.status, err.response?.data || err.message || err);
      throw err;
    }
  },
};
