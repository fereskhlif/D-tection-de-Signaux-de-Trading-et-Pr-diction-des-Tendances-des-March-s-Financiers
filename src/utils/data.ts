import type { Stock, HistoryEntry, Alert, ModelAccuracyPoint, PricePoint, ForecastPoint, Sector, SectorStats } from "../types";
import { sectorColor } from "./helpers";

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
export function prng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ── Price history generation ──────────────────────────────────────────────────
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

// ── Forecast generation ───────────────────────────────────────────────────────
export function generateForecast(stock: Stock, numDays = 5): ForecastPoint[] {
  const history = generatePriceHistory(stock.price * 0.85, 90, stock.seed);
  const lastPrice = history[history.length - 1].close;
  const rand = prng(stock.seed * 11 + 7);
  const baseDrift = stock.prediction === "Hausse" ? 0.007 : stock.prediction === "Baisse" ? -0.007 : 0.0005;
  const vol = stock.sector === "Crypto-monnaies" ? 0.032 : 0.012;
  let price = lastPrice;
  return Array.from({ length: numDays }, (_, i) => {
    price = price * (1 + baseDrift + (rand() - 0.5) * vol);
    const ciWidth = (1 - stock.confidence / 100) * (i + 1) * 0.018 + 0.008;
    return {
      day: `J+${i + 1}`,
      price: Math.round(price * 100) / 100,
      upper: Math.round(price * (1 + ciWidth) * 100) / 100,
      lower: Math.round(price * (1 - ciWidth) * 100) / 100,
      changePct: Math.round(((price - lastPrice) / lastPrice) * 10000) / 100,
    };
  });
}

// ── Computed stock stats ──────────────────────────────────────────────────────
function stockStats(seed: number, initialPrice: number) {
  const hist = generatePriceHistory(initialPrice, 90, seed);
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  const prices = hist.map(d => d.close);
  const returns = prices.slice(1).map((c, i) => (c - prices[i]) / prices[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) * Math.sqrt(252) * 100;
  // RSI(14)
  const changes = prices.slice(-15).map((c, i, a) => i === 0 ? 0 : c - a[i - 1]);
  const gains = changes.filter(x => x > 0).reduce((a, b) => a + b, 0) / 14;
  const losses = changes.filter(x => x < 0).reduce((a, b) => a - b, 0) / 14;
  const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));
  return {
    price: Math.round(last.close * 100) / 100,
    dayChange: Math.round(((last.close - prev.close) / prev.close) * 10000) / 100,
    quarterChange: Math.round(((last.close - hist[0].close) / hist[0].close) * 10000) / 100,
    high52: Math.round(Math.max(...hist.map(d => d.high)) * 100) / 100,
    low52: Math.round(Math.min(...hist.map(d => d.low)) * 100) / 100,
    volume: last.volume,
    volatility: Math.round(vol * 10) / 10,
    rsi,
  };
}

// ── Raw stock definitions ─────────────────────────────────────────────────────
const RAW_STOCKS = [
  { id: "aapl", ticker: "AAPL", company: "Apple Inc.", sector: "Technologie" as Sector, initialPrice: 182.5, seed: 7, prediction: "Hausse" as const, confidence: 84 },
  { id: "msft", ticker: "MSFT", company: "Microsoft Corp.", sector: "Technologie" as Sector, initialPrice: 415.2, seed: 13, prediction: "Hausse" as const, confidence: 79 },
  { id: "nvda", ticker: "NVDA", company: "NVIDIA Corp.", sector: "Technologie" as Sector, initialPrice: 875.3, seed: 3, prediction: "Hausse" as const, confidence: 92 },
  { id: "jpm", ticker: "JPM", company: "JPMorgan Chase", sector: "Finance" as Sector, initialPrice: 198.7, seed: 21, prediction: "Stabilité" as const, confidence: 67 },
  { id: "gs", ticker: "GS", company: "Goldman Sachs", sector: "Finance" as Sector, initialPrice: 452.1, seed: 8, prediction: "Baisse" as const, confidence: 71 },
  { id: "bnp", ticker: "BNP", company: "BNP Paribas", sector: "Finance" as Sector, initialPrice: 61.3, seed: 17, prediction: "Stabilité" as const, confidence: 59 },
  { id: "jnj", ticker: "JNJ", company: "Johnson & Johnson", sector: "Santé" as Sector, initialPrice: 151.2, seed: 5, prediction: "Stabilité" as const, confidence: 63 },
  { id: "unh", ticker: "UNH", company: "UnitedHealth Group", sector: "Santé" as Sector, initialPrice: 512.8, seed: 9, prediction: "Hausse" as const, confidence: 76 },
  { id: "nvo", ticker: "NVO", company: "Novo Nordisk A/S", sector: "Santé" as Sector, initialPrice: 128.4, seed: 2, prediction: "Hausse" as const, confidence: 88 },
  { id: "cat", ticker: "CAT", company: "Caterpillar Inc.", sector: "Industrie" as Sector, initialPrice: 348.6, seed: 11, prediction: "Baisse" as const, confidence: 69 },
  { id: "ge", ticker: "GE", company: "GE Aerospace", sector: "Industrie" as Sector, initialPrice: 168.3, seed: 14, prediction: "Hausse" as const, confidence: 74 },
  { id: "nee", ticker: "NEE", company: "NextEra Energy", sector: "Services publics" as Sector, initialPrice: 62.4, seed: 6, prediction: "Baisse" as const, confidence: 65 },
  { id: "duk", ticker: "DUK", company: "Duke Energy", sector: "Services publics" as Sector, initialPrice: 98.7, seed: 18, prediction: "Stabilité" as const, confidence: 72 },
  { id: "btc", ticker: "BTC", company: "Bitcoin", sector: "Crypto-monnaies" as Sector, initialPrice: 67500, seed: 33, prediction: "Hausse" as const, confidence: 78 },
  { id: "eth", ticker: "ETH", company: "Ethereum", sector: "Crypto-monnaies" as Sector, initialPrice: 3420, seed: 37, prediction: "Hausse" as const, confidence: 71 },
  { id: "bnb", ticker: "BNB", company: "Binance Coin", sector: "Crypto-monnaies" as Sector, initialPrice: 580, seed: 41, prediction: "Stabilité" as const, confidence: 62 },
  { id: "sol", ticker: "SOL", company: "Solana", sector: "Crypto-monnaies" as Sector, initialPrice: 185, seed: 45, prediction: "Hausse" as const, confidence: 83 },
  { id: "xrp", ticker: "XRP", company: "Ripple (XRP)", sector: "Crypto-monnaies" as Sector, initialPrice: 58, seed: 49, prediction: "Baisse" as const, confidence: 67 },
];

// Build full stock objects with computed stats
export const STOCKS: Stock[] = RAW_STOCKS.map(raw => ({
  ...raw,
  isFavorite: ["aapl", "nvda", "nvo"].includes(raw.id),
  ...stockStats(raw.seed, raw.initialPrice),
}));

// ── History data ──────────────────────────────────────────────────────────────
export const HISTORY_ENTRIES: HistoryEntry[] = [
  { id: "h1", ticker: "AAPL", date: "5 juil.", predicted: "Stabilité", actual: "Hausse", confidence: 71 },
  { id: "h2", ticker: "NVDA", date: "5 juil.", predicted: "Hausse", actual: "Hausse", confidence: 88 },
  { id: "h3", ticker: "JPM", date: "5 juil.", predicted: "Hausse", actual: "Stabilité", confidence: 60 },
  { id: "h4", ticker: "GS", date: "5 juil.", predicted: "Stabilité", actual: "Baisse", confidence: 65 },
  { id: "h5", ticker: "AAPL", date: "12 juil.", predicted: "Hausse", actual: "Hausse", confidence: 79 },
  { id: "h6", ticker: "GS", date: "12 juil.", predicted: "Baisse", actual: "Baisse", confidence: 69 },
  { id: "h7", ticker: "NVO", date: "12 juil.", predicted: "Hausse", actual: "Hausse", confidence: 85 },
  { id: "h8", ticker: "CAT", date: "12 juil.", predicted: "Baisse", actual: "Stabilité", confidence: 72 },
  { id: "h9", ticker: "MSFT", date: "19 juil.", predicted: "Hausse", actual: "Hausse", confidence: 76 },
  { id: "h10", ticker: "JNJ", date: "19 juil.", predicted: "Baisse", actual: "Stabilité", confidence: 58 },
  { id: "h11", ticker: "UNH", date: "19 juil.", predicted: "Hausse", actual: "Hausse", confidence: 73 },
  { id: "h12", ticker: "NEE", date: "19 juil.", predicted: "Stabilité", actual: "Baisse", confidence: 61 },
  { id: "h13", ticker: "AAPL", date: "26 juil.", predicted: "Hausse", actual: "Hausse", confidence: 82 },
  { id: "h14", ticker: "BNP", date: "26 juil.", predicted: "Stabilité", actual: "Stabilité", confidence: 57 },
  { id: "h15", ticker: "GE", date: "26 juil.", predicted: "Hausse", actual: "Hausse", confidence: 71 },
  { id: "h16", ticker: "BTC", date: "26 juil.", predicted: "Hausse", actual: "Hausse", confidence: 75 },
  { id: "h17", ticker: "NVDA", date: "2 août", predicted: "Hausse", actual: "Hausse", confidence: 91 },
  { id: "h18", ticker: "ETH", date: "2 août", predicted: "Hausse", actual: "Stabilité", confidence: 68 },
];

// ── Alerts ────────────────────────────────────────────────────────────────────
export const ALERTS: Alert[] = [
  { id: "a1", ticker: "AAPL", from: "Stabilité", to: "Hausse", timeAgo: "2h", confidence: 84 },
  { id: "a2", ticker: "GS", from: "Stabilité", to: "Baisse", timeAgo: "5h", confidence: 71 },
  { id: "a3", ticker: "NEE", from: "Hausse", to: "Baisse", timeAgo: "1j", confidence: 65 },
  { id: "a4", ticker: "NVO", from: "Hausse", to: "Hausse", timeAgo: "1j", confidence: 88 },
  { id: "a5", ticker: "BTC", from: "Baisse", to: "Hausse", timeAgo: "2j", confidence: 78 },
];

export const SECTORS_LIST = ["Technologie", "Finance", "Santé", "Industrie", "Services publics", "Crypto-monnaies"] as const;

// ── Model accuracy ────────────────────────────────────────────────────────────
export const MODEL_ACCURACY = {
  overall: 83.4,
  weekly: 2.1,
  series: [
    { week: "S1", accuracy: 79.2 }, { week: "S2", accuracy: 81.5 },
    { week: "S3", accuracy: 80.8 }, { week: "S4", accuracy: 83.1 },
    { week: "S5", accuracy: 82.4 }, { week: "S6", accuracy: 84.7 },
    { week: "S7", accuracy: 83.9 }, { week: "S8", accuracy: 82.6 },
    { week: "S9", accuracy: 85.2 }, { week: "S10", accuracy: 83.8 },
    { week: "S11", accuracy: 84.1 }, { week: "S12", accuracy: 82.4 },
  ] as ModelAccuracyPoint[],
};

// ── Sector stats ──────────────────────────────────────────────────────────────
export const SECTORS: SectorStats[] = SECTORS_LIST.map(sector => {
  const sectorStocks = STOCKS.filter(s => s.sector === sector);
  const bullish = sectorStocks.filter(s => s.prediction === "Hausse").length;
  const bearish = sectorStocks.filter(s => s.prediction === "Baisse").length;
  const stable = sectorStocks.filter(s => s.prediction === "Stabilité").length;
  const avgConfidence = sectorStocks.length
    ? Math.round(sectorStocks.reduce((a, s) => a + s.confidence, 0) / sectorStocks.length)
    : 0;
  const performance = sectorStocks.length
    ? +(sectorStocks.reduce((a, s) => a + s.quarterChange, 0) / sectorStocks.length).toFixed(2)
    : 0;
  return { sector: sector as Sector, performance, count: sectorStocks.length, bullish, bearish, stable, avgConfidence, color: sectorColor(sector) };
});
