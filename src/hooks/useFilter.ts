import { useState, useMemo } from "react";
import type { Stock, FilterType } from "../types";

export function useFilter(stocks: Stock[]) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("Tous");

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case "Hausse": return stocks.filter(s => s.prediction === "Hausse");
      case "Baisse": return stocks.filter(s => s.prediction === "Baisse");
      case "Stabilité": return stocks.filter(s => s.prediction === "Stabilité");
      case "Favoris": return stocks.filter(s => s.isFavorite);
      default: return stocks;
    }
  }, [stocks, activeFilter]);

  return { activeFilter, setActiveFilter, filtered };
}
