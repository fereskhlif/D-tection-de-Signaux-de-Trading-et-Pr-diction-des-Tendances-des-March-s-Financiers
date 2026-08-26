/**
 * useStocks — Délègue au StocksContext qui charge les données réelles.
 *
 * L'API publique est conservée (stocks, toggleFavorite, refresh)
 * pour ne pas modifier les composants consommateurs.
 */
import { useStocksContext } from "../context/StocksContext";

export function useStocks() {
  const { stocks, toggleFavorite, refresh, loading } = useStocksContext();
  return { stocks, toggleFavorite, refresh, loading };
}
