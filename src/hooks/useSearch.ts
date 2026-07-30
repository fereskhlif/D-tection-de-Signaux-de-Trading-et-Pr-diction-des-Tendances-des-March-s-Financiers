import { useState, useMemo } from "react";
import type { Stock } from "../types";

export function useSearch(stocks: Stock[]) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return stocks;
    return stocks.filter(
      s =>
        s.ticker.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    );
  }, [stocks, query]);

  return { query, setQuery, results };
}
