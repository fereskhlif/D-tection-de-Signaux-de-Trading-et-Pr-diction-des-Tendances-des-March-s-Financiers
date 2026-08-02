import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { comparisonService } from "../services/comparisonService";
import type { ComparisonResponse, Statistics, TickerResult } from "../types/comparison";

const MAX_STOCKS = 5;

export function useComparison() {
  const [selected, setSelected] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);
  const [days, setDays] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TickerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const periodString = days === 7 ? "7d" : days === 15 ? "15d" : days === 30 ? "30d" : days === 60 ? "60d" : days === 90 ? "90d" : days === 180 ? "6mo" : days === 365 ? "1y" : days === 730 ? "2y" : "5y";

  const fetchComparison = useCallback(async (retryCount = 0) => {
    if (!selected.length) {
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
      const result = await comparisonService.getComparison(selected, periodString, "1d", abortControllerRef.current.signal);
      console.debug("fetchComparison received", { tickers: selected, periodString, result });
      setData(result);
      setError(null);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.message === "canceled") {
        return; // aborted
      }
      if (retryCount < 1) {
        // Retry once on failure
        setTimeout(() => fetchComparison(retryCount + 1), 1000);
        return;
      }
      console.error("fetchComparison error:", err.response?.status, err.response?.data || err.message || err);
      setError(err.response?.data?.error || err.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [selected.join(","), periodString]);

  useEffect(() => {
    fetchComparison();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchComparison]);

  useEffect(() => {
    if (data && data.series.length > 0) {
      const firstSeriesData = data.series[0].data;
      if (firstSeriesData.length > 0) {
        console.log("Dernière date reçue:", firstSeriesData[firstSeriesData.length - 1].date);
      }
    }
  }, [data]);

  const search = useCallback(async (query: string) => {
    try {
      return await comparisonService.searchTicker(query);
    } catch (err: any) {
      if (err.name !== "CanceledError" && err.message !== "canceled") {
        console.error("Search error:", err);
      }
      return [];
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await search(searchQuery);
      setSuggestions(res.filter(t => !selected.includes(t.ticker)));
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, search, selected]);

  const addStock = (ticker: string) => {
    if (selected.includes(ticker) || selected.length >= MAX_STOCKS) return;
    setSelected(prev => [...prev, ticker]);
    setSearchQuery("");
    setSuggestions([]);
  };

  const removeStock = (ticker: string) => setSelected(prev => prev.filter(t => t !== ticker));

  /* Build chart data — uses dates from the backend (trading days only) */
  const chartData = useMemo(() => {
    if (!data || !data.series.length) return [];

    // Collect all unique dates across all series
    const allDates = new Set<string>();
    data.series.forEach(s => s.data.forEach(p => allDates.add(p.date)));
    const sortedDates = Array.from(allDates).sort();

    if (!sortedDates.length) return [];

    // Index each series by date for O(1) lookup
    const seriesMap: Record<string, Record<string, number>> = {};
    data.series.forEach(s => {
      seriesMap[s.ticker] = {};
      s.data.forEach(p => { seriesMap[s.ticker][p.date] = p.value; });
    });

    return sortedDates.map(date => {
      const row: Record<string, any> = { date };
      data.series.forEach(s => {
        const val = seriesMap[s.ticker]?.[date];
        row[s.ticker] = typeof val === "number" ? val : null;
      });
      return row;
    });
  }, [data]);

  const getCorrelation = useCallback((tickerA: string, tickerB: string) => {
    if (!data) return 1;
    if (tickerA === tickerB) return 1;
    const cell = data.correlation.find(c => c.tickerA === tickerA && c.tickerB === tickerB);
    return cell ? cell.value : 1;
  }, [data]);

  const statistics: Statistics[] = useMemo(
    () => data?.statistics ?? [],
    [data]
  );

  return {
    selected,
    days,
    setDays,
    searchQuery,
    setSearchQuery,
    suggestions,
    isSearching,
    addStock,
    removeStock,
    chartData,
    rawData: data,
    statistics,
    loading,
    error,
    getCorrelation,
    MAX_STOCKS
  };
}
