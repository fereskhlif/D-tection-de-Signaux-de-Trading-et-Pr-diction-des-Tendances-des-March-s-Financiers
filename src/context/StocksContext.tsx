/**
 * AlphaML — StocksContext.tsx
 *
 * Fournit les données réelles de tous les stocks depuis le backend.
 * Source unique de vérité pour les pages Dashboard, Actions et Secteurs.
 *
 * Architecture :
 *   StocksProvider (App.tsx root)
 *     └── useStocksContext()  →  stocks, loading, errors, refresh
 *
 * Chaque ticker appelle GET /api/market/{yf_ticker} qui :
 *   - récupère les données Yahoo Finance (cache backend)
 *   - applique le pipeline IA V13.5 existant
 *   - retourne : prix, variation, RSI, volatilité, SMA, prédiction, confiance
 *
 * Cache client-side (10 min TTL) pour éviter les appels redondants
 * entre les navigations de pages.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Prediction, Sector, Stock } from "../types";
import { useAuth } from "./AuthContext";
import { favoritesApi } from "../services/favoritesApi";
import {
  ALL_DISPLAY_TICKERS,
  DISPLAY_TO_YF,
  SECTOR_CONFIGS,
  TICKER_TO_COMPANY,
  TICKER_TO_SECTOR,
} from "../config/sectors";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TickerStatus = "idle" | "loading" | "success" | "error";

export interface StockApiResponse {
  ticker: string;
  yf_ticker: string;
  company: string;
  sector: string;
  price: number;
  day_change_pct: number;
  quarter_change_pct: number;
  rsi14: number;
  volatility_ann: number;
  sma20: number;
  sma50: number;
  high52: number;
  low52: number;
  volume: number;
  prediction: string;   // "Hausse" | "Baisse" | "Stabilite"
  confidence: number;   // 0–100
  probabilities: {
    Hausse: number;
    Stabilite: number;
    Baisse: number;
  };
  performance_90d: number;
}

export interface StocksContextValue {
  stocks: Stock[];
  /** Statut par ticker d'affichage (ex: "AAPL" → "loading" | "success" | "error") */
  statusByTicker: Record<string, TickerStatus>;
  /** Message d'erreur par ticker */
  errorByTicker: Record<string, string>;
  /** true si au moins un ticker est encore en chargement */
  loading: boolean;
  /** Date du dernier rafraîchissement réussi */
  lastUpdated: Date | null;
  /** Forcer un rechargement de toutes les données (invalide le cache client) */
  refresh: () => void;
  /** Bascule le favori d'un stock (local, côté client) */
  toggleFavorite: (id: string) => void;
  /** Données brutes de l'API par ticker (pour usage avancé) */
  rawByTicker: Record<string, StockApiResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache client-side (module-level singleton)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  data: StockApiResponse;
  ts: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheGet(yf: string): StockApiResponse | null {
  const entry = _cache.get(yf);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(yf);
    return null;
  }
  return entry.data;
}

function cacheSet(yf: string, data: StockApiResponse): void {
  _cache.set(yf, { data, ts: Date.now() });
}

function cacheInvalidate(): void {
  _cache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch d'un ticker
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTickerData(displayTicker: string, force = false): Promise<StockApiResponse> {
  const yf = DISPLAY_TO_YF[displayTicker] ?? displayTicker;

  if (!force) {
    const cached = cacheGet(yf);
    if (cached) return cached;
  }

  const res = await fetch(`/api/market/${encodeURIComponent(yf)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 404
        ? `Ticker introuvable : ${yf}`
        : res.status >= 500
        ? `Erreur serveur (${res.status})`
        : `HTTP ${res.status} : ${text.slice(0, 120)}`
    );
  }

  const data: StockApiResponse = await res.json();
  cacheSet(yf, data);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping API → type Stock (pour compatibilité avec les composants existants)
// ─────────────────────────────────────────────────────────────────────────────

const PRED_MAP: Record<string, Prediction> = {
  Hausse: "Hausse",
  Baisse: "Baisse",
  Stabilite: "Stabilité",
  Stabilité: "Stabilité",
};

const DEFAULT_FAVORITES = new Set(["AAPL", "NVDA", "NVO"]);

function apiToStock(
  api: StockApiResponse,
  isFavorite: boolean
): Stock {
  const displayTicker = api.ticker;
  return {
    id:            displayTicker.toLowerCase(),
    ticker:        displayTicker,
    company:       TICKER_TO_COMPANY[displayTicker] ?? api.company ?? displayTicker,
    sector:        (TICKER_TO_SECTOR[displayTicker] ?? api.sector) as Sector,
    price:         api.price,
    dayChange:     api.day_change_pct,
    quarterChange: api.quarter_change_pct,
    rsi:           api.rsi14,
    volatility:    api.volatility_ann,
    high52:        api.high52,
    low52:         api.low52,
    volume:        api.volume,
    prediction:    PRED_MAP[api.prediction] ?? "Stabilité",
    confidence:    api.confidence,
    isFavorite,
    seed:          0, // seed n'est plus nécessaire (données réelles)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const StocksContext = createContext<StocksContextValue | null>(null);

export function useStocksContext(): StocksContextValue {
  const ctx = useContext(StocksContext);
  if (!ctx) throw new Error("useStocksContext doit être utilisé dans <StocksProvider>");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function StocksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  // Favoris synchronisés avec le backend (avec fallback initial vide)
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [statusByTicker, setStatusByTicker] = useState<Record<string, TickerStatus>>({});
  const [errorByTicker, setErrorByTicker] = useState<Record<string, string>>({});
  const [rawByTicker, setRawByTicker] = useState<Record<string, StockApiResponse>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Synchronisation des favoris avec l'utilisateur connecté
  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      return;
    }
    
    let isCurrent = true;
    favoritesApi.getFavorites().then(favs => {
      if (isCurrent && mountedRef.current) {
        setFavorites(new Set(favs));
      }
    });
    
    return () => { isCurrent = false; };
  }, [user]);

  // Chargement de tous les tickers
  useEffect(() => {
    const force = refreshKey > 0;
    if (force) cacheInvalidate();

    // Marquer tous les tickers comme "loading"
    const initStatus: Record<string, TickerStatus> = {};
    ALL_DISPLAY_TICKERS.forEach(t => { initStatus[t] = "loading"; });
    setStatusByTicker(initStatus);
    setErrorByTicker({});

    const loadAll = async () => {
      const newStatus: Record<string, TickerStatus> = { ...initStatus };
      const newErrors: Record<string, string> = {};
      const newRaw: Record<string, StockApiResponse> = {};

      // Charger tous les tickers en parallèle
      await Promise.allSettled(
        ALL_DISPLAY_TICKERS.map(async (ticker) => {
          try {
            const data = await fetchTickerData(ticker, force);
            // Normaliser le ticker d'affichage (au cas où le backend renvoie le ticker YF)
            const normalized: StockApiResponse = { ...data, ticker };
            newRaw[ticker] = normalized;
            newStatus[ticker] = "success";
          } catch (err: any) {
            console.error(`[StocksContext] Erreur pour ${ticker}:`, err.message);
            newErrors[ticker] = err.message ?? "Erreur inconnue";
            newStatus[ticker] = "error";
          }
        })
      );

      if (!mountedRef.current) return;

      setStatusByTicker(newStatus);
      setErrorByTicker(newErrors);
      setRawByTicker(newRaw);
      if (Object.keys(newRaw).length > 0) {
        setLastUpdated(new Date());
      }
    };

    loadAll();
  }, [refreshKey]);

  // Dériver les stocks dans l'ordre de configuration (stable)
  const stocks: Stock[] = ALL_DISPLAY_TICKERS
    .filter(t => rawByTicker[t] !== undefined)
    .map(t => apiToStock(rawByTicker[t], favorites.has(t)));

  const loading = ALL_DISPLAY_TICKERS.some(t => statusByTicker[t] === "loading");

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    if (!user) {
      // Pourrait lancer un toast / modal auth, mais le UI gère souvent le requireAuth avant.
      console.warn("Utilisateur non connecté. Impossible d'ajouter aux favoris.");
      return;
    }
    
    // id est le ticker lowercase (ex: "aapl")
    const ticker = id.toUpperCase();
    
    // Optimistic UI update
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });

    // Appel API backend
    const result = await favoritesApi.toggleFavorite(ticker);
    
    // Si échec API, on restaure l'état exact via re-fetch (ou on inverse)
    if (!result) {
      favoritesApi.getFavorites().then(favs => setFavorites(new Set(favs)));
    }
  }, [user]);

  const value: StocksContextValue = {
    stocks,
    statusByTicker,
    errorByTicker,
    loading,
    lastUpdated,
    refresh,
    toggleFavorite,
    rawByTicker,
  };

  return (
    <StocksContext.Provider value={value}>
      {children}
    </StocksContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook utilitaire : secteur stats dérivées des stocks réels
// ─────────────────────────────────────────────────────────────────────────────

export interface RealSectorStats {
  sector: Sector;
  performance: number;
  count: number;
  bullish: number;
  bearish: number;
  stable: number;
  avgConfidence: number;
  color: string;
}

export function useSectorStats(): RealSectorStats[] {
  const { stocks, loading } = useStocksContext();

  if (loading && stocks.length === 0) return [];

  return SECTOR_CONFIGS.map(sectorCfg => {
    const sectorStocks = stocks.filter(s => s.sector === sectorCfg.displayName);
    const bullish = sectorStocks.filter(s => s.prediction === "Hausse").length;
    const bearish = sectorStocks.filter(s => s.prediction === "Baisse").length;
    const stable  = sectorStocks.filter(s => s.prediction === "Stabilité").length;
    const avgConfidence = sectorStocks.length
      ? Math.round(sectorStocks.reduce((a, s) => a + s.confidence, 0) / sectorStocks.length)
      : 0;
    const performance = sectorStocks.length
      ? +((sectorStocks.reduce((a, s) => a + s.quarterChange, 0) / sectorStocks.length).toFixed(2))
      : 0;

    return {
      sector:        sectorCfg.displayName,
      performance,
      count:         sectorCfg.tickers.length,
      bullish,
      bearish,
      stable,
      avgConfidence,
      color:         sectorCfg.color,
    };
  });
}
