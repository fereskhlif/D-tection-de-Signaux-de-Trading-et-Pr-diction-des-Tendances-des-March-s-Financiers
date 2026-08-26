/**
 * AlphaML — Configuration centralisée des secteurs et tickers (Frontend).
 *
 * Cette configuration détermine :
 *   - la composition de chaque secteur (tickers d'affichage)
 *   - le symbole Yahoo Finance exact pour chaque ticker (yf)
 *   - le nom de la société
 *
 * Les données financières (prix, variation, prédiction...) sont TOUJOURS
 * récupérées depuis le backend — jamais codées ici.
 *
 * Couleurs des secteurs conservées depuis helpers.ts.
 */
import type { Sector } from "../types";

export interface TickerEntry {
  display: string;   // Ticker affiché dans l'UI
  yf: string;        // Symbole Yahoo Finance exact
  name: string;      // Nom de la société
}

export interface SectorEntry {
  displayName: Sector;
  tickers: TickerEntry[];
  color: string;
}

export const SECTOR_CONFIGS: SectorEntry[] = [
  {
    displayName: "Technologie",
    color: "#3b82f6",
    tickers: [
      { display: "AAPL",  yf: "AAPL",    name: "Apple Inc." },
      { display: "MSFT",  yf: "MSFT",    name: "Microsoft Corp." },
      { display: "NVDA",  yf: "NVDA",    name: "NVIDIA Corp." },
    ],
  },
  {
    displayName: "Finance",
    color: "#a855f7",
    tickers: [
      { display: "JPM",   yf: "JPM",     name: "JPMorgan Chase" },
      { display: "GS",    yf: "GS",      name: "Goldman Sachs" },
      { display: "BNP",   yf: "BNP.PA",  name: "BNP Paribas" },
    ],
  },
  {
    displayName: "Santé",
    color: "#10b981",
    tickers: [
      { display: "JNJ",   yf: "JNJ",     name: "Johnson & Johnson" },
      { display: "UNH",   yf: "UNH",     name: "UnitedHealth Group" },
      { display: "NVO",   yf: "NVO",     name: "Novo Nordisk A/S" },
    ],
  },
  {
    displayName: "Industrie",
    color: "#f59e0b",
    tickers: [
      { display: "CAT",   yf: "CAT",     name: "Caterpillar Inc." },
      { display: "GE",    yf: "GE",      name: "GE Aerospace" },
    ],
  },
  {
    displayName: "Services publics",
    color: "#f97316",
    tickers: [
      { display: "NEE",   yf: "NEE",     name: "NextEra Energy" },
      { display: "DUK",   yf: "DUK",     name: "Duke Energy" },
    ],
  },
  {
    displayName: "Crypto-monnaies",
    color: "#f97316",
    tickers: [
      { display: "BTC",   yf: "BTC-USD", name: "Bitcoin" },
      { display: "ETH",   yf: "ETH-USD", name: "Ethereum" },
      { display: "BNB",   yf: "BNB-USD", name: "Binance Coin" },
      { display: "SOL",   yf: "SOL-USD", name: "Solana" },
      { display: "XRP",   yf: "XRP-USD", name: "Ripple (XRP)" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers dérivés (calculés une fois au module load)
// ─────────────────────────────────────────────────────────────────────────────

/** Tous les tickers d'affichage dans l'ordre des secteurs. */
export const ALL_DISPLAY_TICKERS: string[] = SECTOR_CONFIGS.flatMap(s =>
  s.tickers.map(t => t.display)
);

/** Tous les symboles Yahoo Finance dans l'ordre des secteurs. */
export const ALL_YF_TICKERS: string[] = SECTOR_CONFIGS.flatMap(s =>
  s.tickers.map(t => t.yf)
);

/** Map display ticker → Yahoo Finance ticker. */
export const DISPLAY_TO_YF: Record<string, string> = {};
/** Map Yahoo Finance ticker → display ticker. */
export const YF_TO_DISPLAY: Record<string, string> = {};
/** Map display ticker → nom de la société. */
export const TICKER_TO_COMPANY: Record<string, string> = {};
/** Map display ticker → secteur. */
export const TICKER_TO_SECTOR: Record<string, Sector> = {};

for (const sector of SECTOR_CONFIGS) {
  for (const t of sector.tickers) {
    DISPLAY_TO_YF[t.display] = t.yf;
    YF_TO_DISPLAY[t.yf]      = t.display;
    TICKER_TO_COMPANY[t.display] = t.name;
    TICKER_TO_SECTOR[t.display]  = sector.displayName;
  }
}

/** Résout un ticker quelconque (display ou YF) vers le ticker d'affichage. */
export function resolveDisplayTicker(ticker: string): string {
  return YF_TO_DISPLAY[ticker] ?? ticker;
}

/** Retourne le symbole Yahoo Finance pour un ticker d'affichage. */
export function resolveYfTicker(ticker: string): string {
  return DISPLAY_TO_YF[ticker] ?? ticker;
}

/** Liste des noms de secteurs dans l'ordre de configuration. */
export const SECTORS_LIST = SECTOR_CONFIGS.map(s => s.displayName);
