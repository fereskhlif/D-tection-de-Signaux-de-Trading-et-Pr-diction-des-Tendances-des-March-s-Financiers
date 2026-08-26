import { apiFetch, ApiResponse } from "./api";

export const favoritesApi = {
  /**
   * Récupère la liste complète des tickers favoris pour l'utilisateur connecté.
   */
  getFavorites: async (): Promise<string[]> => {
    const res = await apiFetch<{ favorites: string[] }>("/favorites");
    if (res.status === "error") {
      console.error("[favoritesApi] Error fetching favorites:", res.message);
      return [];
    }
    return res.data?.favorites || [];
  },

  /**
   * Bascule l'état d'un ticker (ajoute s'il n'y est pas, supprime s'il y est).
   * Atomique côté backend pour éviter les requêtes conflictuelles.
   */
  toggleFavorite: async (ticker: string): Promise<{ ticker: string; is_favorite: boolean } | null> => {
    const res = await apiFetch<{ ticker: string; is_favorite: boolean }>("/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ ticker }),
    });
    
    if (res.status === "error") {
      console.error("[favoritesApi] Error toggling favorite:", res.message);
      return null;
    }
    return res.data;
  },
};
