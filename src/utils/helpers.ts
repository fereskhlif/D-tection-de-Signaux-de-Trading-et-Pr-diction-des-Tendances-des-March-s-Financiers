import type { Prediction } from "../types";

export function formatPrice(value: number): string {
  if (value >= 10000) return value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (value >= 1000) return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toFixed(2);
}

export function formatPct(value: number, showPlus = true): string {
  const sign = value > 0 && showPlus ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

export function predictionColor(p: Prediction): string {
  return p === "Hausse" ? "text-success" : p === "Baisse" ? "text-danger" : "text-warning";
}

export function predictionBg(p: Prediction): string {
  return p === "Hausse" ? "bg-success/10" : p === "Baisse" ? "bg-danger/10" : "bg-warning/10";
}

export function predictionBorderColor(p: Prediction): string {
  return p === "Hausse"
    ? "border-success/30"
    : p === "Baisse"
    ? "border-danger/30"
    : "border-warning/30";
}

export function changeColor(value: number): string {
  return value >= 0 ? "text-success" : "text-danger";
}

export function sectorColor(sector: string): string {
  const map: Record<string, string> = {
    Technologie: "#3b82f6",
    Finance: "#a855f7",
    Santé: "#10b981",
    Industrie: "#f59e0b",
    "Services publics": "#f97316",
    "Crypto-monnaies": "#f97316",
  };
  return map[sector] ?? "#64748b";
}

export function tickerColor(ticker: string): string {
  const map: Record<string, string> = {
    AAPL: "#3b82f6", MSFT: "#10b981", NVDA: "#f59e0b",
    JPM: "#a855f7", GS: "#ef4444", BNP: "#06b6d4",
    JNJ: "#ec4899", UNH: "#84cc16", NVO: "#f97316",
    CAT: "#14b8a6", GE: "#6366f1", NEE: "#eab308",
    DUK: "#8b5cf6", BTC: "#f97316", ETH: "#627eea",
    BNB: "#f3ba2f", SOL: "#9945ff", XRP: "#346aa9",
  };
  return map[ticker] ?? "#64748b";
}

export function correctRate(entries: { predicted: Prediction; actual: Prediction }[]): number {
  if (!entries.length) return 0;
  return Math.round((entries.filter(e => e.predicted === e.actual).length / entries.length) * 100);
}
