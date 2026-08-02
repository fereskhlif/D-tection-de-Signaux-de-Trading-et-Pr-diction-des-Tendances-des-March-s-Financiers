import { useState, useEffect, useRef, useCallback } from "react";
import { comparisonService } from "../services/comparisonService";
import type { HistoryResponse } from "../types/comparison";

interface UseHistoryResult {
  data: HistoryResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHistory(ticker: string, period: string, interval: string = "1d"): UseHistoryResult {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchHistory = useCallback(async (retryCount = 0) => {
    if (!ticker) {
      setData(null);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await comparisonService.getHistory(ticker, period, interval, abortControllerRef.current.signal);
      setData(result);
      setError(null);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.message === "canceled") {
        return; // aborted
      }
      if (retryCount < 1) {
        // Retry once on failure
        setTimeout(() => fetchHistory(retryCount + 1), 1000);
        return;
      }
      setError(err.response?.data?.error || err.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [ticker, period, interval]);

  useEffect(() => {
    fetchHistory();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHistory]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchHistory(0),
  };
}
