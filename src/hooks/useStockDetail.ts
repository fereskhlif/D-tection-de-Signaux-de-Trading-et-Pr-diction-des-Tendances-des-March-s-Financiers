import { useState, useEffect } from "react";
import type { StockDetailResponse } from "../types/stockDetail";

export function useStockDetail(ticker: string | null) {
  const [data, setData] = useState<StockDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (!ticker) return;

    let active = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}?period=1y&horizon=5`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Erreur API (${res.status}): ${text}`);
        }
        const json: StockDetailResponse = await res.json();
        if (active) {
          setData(json);
        }
      } catch (err: any) {
        if (active) {
          // Gérer les erreurs spécifiques selon la demande
          if (err.name === "TypeError" && err.message.includes("fetch")) {
            setError("Impossible de contacter le serveur");
          } else if (err.message.includes("404")) {
            setError("Ticker introuvable");
          } else if (err.message.includes("Yahoo")) { // Si le backend renvoie une erreur détaillée
            setError("Données de marché indisponibles");
          } else if (err.message.includes("ML") || err.message.includes("prediction") || err.message.includes("500")) {
            setError("Prédiction temporairement indisponible");
          } else {
            setError(err.message || "Impossible de contacter le serveur");
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => { active = false; };
  }, [ticker, refreshKey]);

  return { data, loading, error, refresh };
}
