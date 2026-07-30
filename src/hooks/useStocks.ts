import { useState, useCallback } from "react";
import type { Stock } from "../types";
import { getAllStocks, toggleFavorite } from "../services/predictionService";

export function useStocks() {
  const [stocks, setStocks] = useState<Stock[]>(() => getAllStocks());

  const handleToggleFavorite = useCallback((id: string) => {
    setStocks(toggleFavorite(id));
  }, []);

  const refresh = useCallback(() => {
    setStocks(getAllStocks());
  }, []);

  return { stocks, toggleFavorite: handleToggleFavorite, refresh };
}
