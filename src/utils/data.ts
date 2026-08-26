/**
 * AlphaML — Utilitaires de données.
 *
 * Ce fichier contient uniquement :
 *   - Générateurs utilitaires (conservés pour les pages Prédictions)
 *   - Données statiques non-financières (historique des prédictions passées,
 *     alertes, métriques du modèle)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPPRIMÉ :
 *   - STOCKS   → remplacé par StocksContext (données réelles via /api/market)
 *   - SECTORS  → remplacé par useSectorStats() (agrégé depuis les stocks réels)
 *   - RAW_STOCKS, stockStats() → données fictives supprimées
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Les données financières réelles viennent exclusivement du backend.
 * NE PAS remettre de valeurs codées en dur ici.
 */
import type { HistoryEntry, Alert, PricePoint, ForecastPoint } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// PRNG — Conservé pour les intervalles de confiance dans la page Prédictions
// ─────────────────────────────────────────────────────────────────────────────

export function prng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─────────────────────────────────────────────────────────────────────────────
// Génération d'historique de prix (non utilisé pour les données réelles)
// ─────────────────────────────────────────────────────────────────────────────

export function generatePriceHistory(initialPrice: number, days = 90, seed = 1): PricePoint[] {
  const rand = prng(seed);
  let price = initialPrice;
  return Array.from({ length: days }, (_, i) => {
    const drift = (rand() - 0.49) * 0.03;
    const o = price;
    const c = Math.max(o * (1 + drift), 1);
    const wh = rand() * 0.013, wl = rand() * 0.013;
    price = c;
    return {
      date: new Date(2024, 2, 1 + i).toLocaleDateString("fr-FR", { month: "short", day: "numeric" }),
      open: Math.round(o * 100) / 100,
      close: Math.round(c * 100) / 100,
      high: Math.round(Math.max(o, c) * (1 + wh) * 100) / 100,
      low: Math.round(Math.min(o, c) * (1 - wl) * 100) / 100,
      volume: Math.floor(500_000 + rand() * 9_000_000),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Génération de prévision (fallback si le backend ne répond pas)
// ─────────────────────────────────────────────────────────────────────────────

export function generateForecast(price: number, prediction: string, numDays = 5, seed = 1): ForecastPoint[] {
  const rand = prng(seed);
  const baseDrift = prediction === "Hausse" ? 0.007 : prediction === "Baisse" ? -0.007 : 0.0005;
  let p = price;
  return Array.from({ length: numDays }, (_, i) => {
    p = p * (1 + baseDrift + (rand() - 0.5) * 0.012);
    const ciWidth = (i + 1) * 0.018 + 0.008;
    return {
      day: `J+${i + 1}`,
      price: Math.round(p * 100) / 100,
      upper: Math.round(p * (1 + ciWidth) * 100) / 100,
      lower: Math.round(p * (1 - ciWidth) * 100) / 100,
      changePct: Math.round(((p - price) / price) * 10000) / 100,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Historique des prédictions passées (données de démonstration)
// Note : ces entrées sont des données statiques car il n'existe pas encore
// d'endpoint de journalisation des prédictions dans le backend.
// ─────────────────────────────────────────────────────────────────────────────

export const HISTORY_ENTRIES: HistoryEntry[] = [
  { id: "h1",  ticker: "AAPL", date: "5 juil.",  predicted: "Stabilité",  actual: "Hausse",    confidence: 71 },
  { id: "h2",  ticker: "NVDA", date: "5 juil.",  predicted: "Hausse",     actual: "Hausse",    confidence: 88 },
  { id: "h3",  ticker: "JPM",  date: "5 juil.",  predicted: "Hausse",     actual: "Stabilité", confidence: 60 },
  { id: "h4",  ticker: "GS",   date: "5 juil.",  predicted: "Stabilité",  actual: "Baisse",    confidence: 65 },
  { id: "h5",  ticker: "AAPL", date: "12 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 79 },
  { id: "h6",  ticker: "GS",   date: "12 juil.", predicted: "Baisse",     actual: "Baisse",    confidence: 69 },
  { id: "h7",  ticker: "NVO",  date: "12 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 85 },
  { id: "h8",  ticker: "CAT",  date: "12 juil.", predicted: "Baisse",     actual: "Stabilité", confidence: 72 },
  { id: "h9",  ticker: "MSFT", date: "19 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 76 },
  { id: "h10", ticker: "JNJ",  date: "19 juil.", predicted: "Baisse",     actual: "Stabilité", confidence: 58 },
  { id: "h11", ticker: "UNH",  date: "19 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 73 },
  { id: "h12", ticker: "NEE",  date: "19 juil.", predicted: "Stabilité",  actual: "Baisse",    confidence: 61 },
  { id: "h13", ticker: "AAPL", date: "26 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 82 },
  { id: "h14", ticker: "BNP",  date: "26 juil.", predicted: "Stabilité",  actual: "Stabilité", confidence: 57 },
  { id: "h15", ticker: "GE",   date: "26 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 71 },
  { id: "h16", ticker: "BTC",  date: "26 juil.", predicted: "Hausse",     actual: "Hausse",    confidence: 75 },
  { id: "h17", ticker: "NVDA", date: "2 août",  predicted: "Hausse",     actual: "Hausse",    confidence: 91 },
  { id: "h18", ticker: "ETH",  date: "2 août",  predicted: "Hausse",     actual: "Stabilité", confidence: 68 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alertes de notifications (statiques — pas de système de push en temps réel)
// ─────────────────────────────────────────────────────────────────────────────

export const ALERTS: Alert[] = [
  { id: "a1", ticker: "AAPL", from: "Stabilité", to: "Hausse",    timeAgo: "2h",  confidence: 84 },
  { id: "a2", ticker: "GS",   from: "Stabilité", to: "Baisse",    timeAgo: "5h",  confidence: 71 },
  { id: "a3", ticker: "NEE",  from: "Hausse",    to: "Baisse",    timeAgo: "1j",  confidence: 65 },
  { id: "a4", ticker: "NVO",  from: "Hausse",    to: "Hausse",    timeAgo: "1j",  confidence: 88 },
  { id: "a5", ticker: "BTC",  from: "Baisse",    to: "Hausse",    timeAgo: "2j",  confidence: 78 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Liste des secteurs (noms uniquement — composition dans src/config/sectors.ts)
// ─────────────────────────────────────────────────────────────────────────────

export { SECTORS_LIST } from "../config/sectors";
