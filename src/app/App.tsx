import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Cell, BarChart, Bar, Area, AreaChart,
} from "recharts";
import {
  LayoutDashboard, TrendingUp, TrendingDown, Minus, BarChart2, Clock, Clock3,
  Settings, Activity, RefreshCw, Search, Bell, Target, Building2,
  Database, ChevronRight, ArrowUpRight, ArrowDownRight, Cpu, Zap,
  Layers, Star, Download, ChevronDown, X, AlertTriangle, Check,
  GitCompare, SortDesc, Eye, EyeOff, LogIn, UserPlus, LogOut, User, Shield,
  Crown, Lock, Sparkles, Coins, Trash2,
} from "lucide-react";
import { getAIPrediction, toggleFavorite, dismissAlert, getAllStocksDynamic, getStockDetailDynamic } from "../services/predictionService";
import { useAuth } from "../context/AuthContext";
import { apiFetch, aiModelService, type ModelInfo } from "../services/api";
import { useGoogleLogin } from "@react-oauth/google";
import { favoritesApi } from "../services/favoritesApi";

// ─── CONFIGURATION SECTEURS (source unique de vérité) ────────────────────────────────
const SECTOR_CONFIG: { display: string; yf: string; name: string; sector: string }[] = [
  { display: "AAPL",  yf: "AAPL",    name: "Apple Inc.",           sector: "Technologie" },
  { display: "MSFT",  yf: "MSFT",    name: "Microsoft Corp.",       sector: "Technologie" },
  { display: "NVDA",  yf: "NVDA",    name: "NVIDIA Corp.",          sector: "Technologie" },
  { display: "JPM",   yf: "JPM",     name: "JPMorgan Chase",        sector: "Finance" },
  { display: "GS",    yf: "GS",      name: "Goldman Sachs",         sector: "Finance" },
  { display: "BNP",   yf: "BNP.PA",  name: "BNP Paribas",           sector: "Finance" },
  { display: "JNJ",   yf: "JNJ",     name: "Johnson & Johnson",      sector: "Santé" },
  { display: "UNH",   yf: "UNH",     name: "UnitedHealth Group",     sector: "Santé" },
  { display: "NVO",   yf: "NVO",     name: "Novo Nordisk A/S",       sector: "Santé" },
  { display: "CAT",   yf: "CAT",     name: "Caterpillar Inc.",       sector: "Industrie" },
  { display: "GE",    yf: "GE",      name: "GE Aerospace",           sector: "Industrie" },
  { display: "NEE",   yf: "NEE",     name: "NextEra Energy",         sector: "Services publics" },
  { display: "DUK",   yf: "DUK",     name: "Duke Energy",            sector: "Services publics" },
  { display: "BTC",   yf: "BTC-USD", name: "Bitcoin",               sector: "Crypto-monnaies" },
  { display: "ETH",   yf: "ETH-USD", name: "Ethereum",              sector: "Crypto-monnaies" },
  { display: "BNB",   yf: "BNB-USD", name: "Binance Coin",          sector: "Crypto-monnaies" },
  { display: "SOL",   yf: "SOL-USD", name: "Solana",                sector: "Crypto-monnaies" },
  { display: "XRP",   yf: "XRP-USD", name: "Ripple (XRP)",          sector: "Crypto-monnaies" },
];

// ─── TYPE: données réelles d'un ticker depuis l'API ─────────────────────────────────────
interface MarketData {
  ticker: string;        // Ticker d'affichage (ex: "BTC")
  yf: string;            // Ticker Yahoo Finance (ex: "BTC-USD")
  name: string;
  sector: string;
  price: number;
  chg1d: number;         // Variation 1J en %
  chg90d: number;        // Performance 90J en %
  rsi: number;           // RSI 14
  volatility: number;    // Volatilité annualisée en %
  sma20: number;
  high52: number;
  low52: number;
  volume: number;
  prediction: Prediction;
  confidence: number;    // P(correct)
  probabilities: { Hausse: number; Stabilite: number; Baisse: number };
  decision: string;
  riskLevel: string;
  tradeAllowed: boolean;
  reason: string;
  loading: boolean;
  error: string | null;
}

// Cache client-side 10 min
const _mktCache = new Map<string, { data: MarketData; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

async function fetchMarket(cfg: typeof SECTOR_CONFIG[0], force = false): Promise<MarketData> {
  if (!force) {
    const entry = _mktCache.get(cfg.yf);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  }
  const res = await fetch(`/api/market/${encodeURIComponent(cfg.yf)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const predMap: Record<string, Prediction> = { Hausse: "Hausse", Baisse: "Baisse", Stabilite: "Stabilité", "Stabilité": "Stabilité" };
  const data: MarketData = {
    ticker: cfg.display, yf: cfg.yf, name: cfg.name, sector: cfg.sector,
    price: d.price ?? 0,
    chg1d: d.day_change_pct ?? 0,
    chg90d: d.quarter_change_pct ?? 0,
    rsi: d.rsi14 ?? 50,
    volatility: d.volatility_ann ?? 0,
    sma20: d.sma20 ?? d.price ?? 0,
    high52: d.high52 ?? d.price ?? 0,
    low52: d.low52 ?? d.price ?? 0,
    volume: d.volume ?? 0,
    prediction: predMap[d.prediction] ?? "Stabilité",
    confidence: d.confidence ?? 0,
    probabilities: d.probabilities ?? { Hausse: 33, Stabilite: 34, Baisse: 33 },
    decision: d.decision ?? "WATCH",
    riskLevel: d.risk_level ?? "HIGH",
    tradeAllowed: d.trade_allowed ?? false,
    reason: d.reason ?? "En attente d'analyse",
    loading: false, error: null,
  };
  _mktCache.set(cfg.yf, { data, ts: Date.now() });
  return data;
}

// ─── HOOK: useMarketData ───────────────────────────────────────────────────────────────
function useMarketData() {
  const [stocks, setStocks] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const force = refreshKey > 0;
    if (force) _mktCache.clear();
    setLoading(true);
    // Placeholder skeletons pendant le chargement
    setStocks(SECTOR_CONFIG.map(cfg => ({ ticker: cfg.display, yf: cfg.yf, name: cfg.name, sector: cfg.sector, price: 0, chg1d: 0, chg90d: 0, rsi: 0, volatility: 0, sma20: 0, high52: 0, low52: 0, volume: 0, prediction: "Stabilité" as Prediction, confidence: 0, probabilities: { Hausse: 0, Stabilite: 0, Baisse: 0 }, decision: "...", riskLevel: "...", tradeAllowed: false, reason: "...", loading: true, error: null })));
    Promise.allSettled(SECTOR_CONFIG.map(cfg => fetchMarket(cfg, force)))
      .then(results => {
        if (!mounted.current) return;
        const loaded = results.map((r, i) => {
          const cfg = SECTOR_CONFIG[i];
          return r.status === "fulfilled" ? r.value : { ticker: cfg.display, yf: cfg.yf, name: cfg.name, sector: cfg.sector, price: 0, chg1d: 0, chg90d: 0, rsi: 0, volatility: 0, sma20: 0, high52: 0, low52: 0, volume: 0, prediction: "Stabilité" as Prediction, confidence: 0, probabilities: { Hausse: 0, Stabilite: 0, Baisse: 0 }, decision: "ERROR", riskLevel: "HIGH", tradeAllowed: false, reason: "Fetch failed", loading: false, error: (r as PromiseRejectedResult).reason?.message ?? "Erreur" };
        });
        setStocks(loaded);
        setLoading(false);
      });
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { stocks, loading, refresh };
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Prediction = "Hausse" | "Stabilité" | "Baisse";
type Page = "dashboard" | "detail" | "sectors" | "comparison" | "actions" | "predictions" | "historique" | "premium" | "favorites";
type AuthView = "login" | "signup" | "forgot-password" | "reset-password" | null;
type Plan = "visitor" | "free" | "premium";

interface StockDef {
  ticker: string; name: string; sector: string;
  initialPrice: number; seed: number; prediction: Prediction; confidence: number;
}
interface DP {
  date: string; open: number; close: number; high: number; low: number; volume: number;
  sma20: number | null; sma50: number | null;
  bollingerUpper: number | null; bollingerLower: number | null;
  rsi: number | null; macd: number; signal: number | null; histogram: number | null;
}
interface ForecastPoint { day: string; [key: string]: number | null | string; isFuture?: boolean; }

// ─── DATA GENERATION ─────────────────────────────────────────────────────────

function prng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
function emaFn(arr: number[], p: number): number[] {
  const k = 2 / (p + 1), r = [arr[0]];
  for (let i = 1; i < arr.length; i++) r.push(arr[i] * k + r[i - 1] * (1 - k));
  return r;
}
function gen(initialPrice: number, days = 90, seed = 1): DP[] {
  return [];
}

// 5-day forward forecast generation
function genForecast(ticker: string, numDays = 5): { day: string; price: number; upper: number; lower: number; changePct: number }[] {
  const data = ALL[ticker], last = data[data.length - 1];
  const stock = STOCKS.find(s => s.ticker === ticker)!;
  const rand = prng(stock.seed * 11 + 7);
  const baseDrift = stock.prediction === "Hausse" ? 0.007 : stock.prediction === "Baisse" ? -0.007 : 0.0005;
  const vol = stock.sector === "Crypto-monnaies" ? 0.032 : 0.012;
  let price = last.close;
  return Array.from({ length: numDays }, (_, i) => {
    const noise = (rand() - 0.5) * vol;
    price = price * (1 + baseDrift + noise);
    const ciWidth = (1 - stock.confidence / 100) * (i + 1) * 0.018 + 0.008;
    const changePct = ((price - last.close) / last.close) * 100;
    return {
      day: `J+${i + 1}`,
      price: Math.round(price * 100) / 100,
      upper: Math.round(price * (1 + ciWidth) * 100) / 100,
      lower: Math.round(price * (1 - ciWidth) * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
    };
  });
}

// ─── STATIC DATA ─────────────────────────────────────────────────────────────

const STOCKS: StockDef[] = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technologie", initialPrice: 182.5, seed: 7, prediction: "Hausse", confidence: 84 },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technologie", initialPrice: 415.2, seed: 13, prediction: "Hausse", confidence: 79 },
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Technologie", initialPrice: 875.3, seed: 3, prediction: "Hausse", confidence: 92 },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Finance", initialPrice: 198.7, seed: 21, prediction: "Stabilité", confidence: 67 },
  { ticker: "GS", name: "Goldman Sachs", sector: "Finance", initialPrice: 452.1, seed: 8, prediction: "Baisse", confidence: 71 },
  { ticker: "BNP", name: "BNP Paribas", sector: "Finance", initialPrice: 61.3, seed: 17, prediction: "Stabilité", confidence: 59 },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Santé", initialPrice: 151.2, seed: 5, prediction: "Stabilité", confidence: 63 },
  { ticker: "UNH", name: "UnitedHealth Group", sector: "Santé", initialPrice: 512.8, seed: 9, prediction: "Hausse", confidence: 76 },
  { ticker: "NVO", name: "Novo Nordisk A/S", sector: "Santé", initialPrice: 128.4, seed: 2, prediction: "Hausse", confidence: 88 },
  { ticker: "CAT", name: "Caterpillar Inc.", sector: "Industrie", initialPrice: 348.6, seed: 11, prediction: "Baisse", confidence: 69 },
  { ticker: "GE", name: "GE Aerospace", sector: "Industrie", initialPrice: 168.3, seed: 14, prediction: "Hausse", confidence: 74 },
  { ticker: "NEE", name: "NextEra Energy", sector: "Services publics", initialPrice: 62.4, seed: 6, prediction: "Baisse", confidence: 65 },
  { ticker: "DUK", name: "Duke Energy", sector: "Services publics", initialPrice: 98.7, seed: 18, prediction: "Stabilité", confidence: 72 },
  // Crypto-monnaies
  { ticker: "BTC", name: "Bitcoin", sector: "Crypto-monnaies", initialPrice: 67500, seed: 33, prediction: "Hausse", confidence: 78 },
  { ticker: "ETH", name: "Ethereum", sector: "Crypto-monnaies", initialPrice: 3420, seed: 37, prediction: "Hausse", confidence: 71 },
  { ticker: "BNB", name: "Binance Coin", sector: "Crypto-monnaies", initialPrice: 580, seed: 41, prediction: "Stabilité", confidence: 62 },
  { ticker: "SOL", name: "Solana", sector: "Crypto-monnaies", initialPrice: 185, seed: 45, prediction: "Hausse", confidence: 83 },
  { ticker: "XRP", name: "Ripple (XRP)", sector: "Crypto-monnaies", initialPrice: 58, seed: 49, prediction: "Baisse", confidence: 67 },
];
const SECTORS = ["Technologie", "Finance", "Santé", "Industrie", "Services publics", "Crypto-monnaies"];
const ALL: Record<string, DP[]> = Object.fromEntries(STOCKS.map(s => [s.ticker, gen(s.initialPrice, 90, s.seed)]));

const STOCK_COLORS: Record<string, string> = {
  AAPL: "#3b82f6", MSFT: "#10b981", NVDA: "#f59e0b", JPM: "#a855f7", GS: "#ef4444",
  BNP: "#06b6d4", JNJ: "#ec4899", UNH: "#84cc16", NVO: "#f97316", CAT: "#14b8a6",
  GE: "#6366f1", NEE: "#eab308", DUK: "#8b5cf6",
  BTC: "#f97316", ETH: "#627eea", BNB: "#f3ba2f", SOL: "#9945ff", XRP: "#346aa9",
};
const SECTOR_COLORS: Record<string, string> = {
  Technologie: "#3b82f6", Finance: "#a855f7", "Santé": "#10b981",
  Industrie: "#f59e0b", "Services publics": "#f97316", "Crypto-monnaies": "#f97316",
};


const HISTORY_ENTRIES = [
  { id: 1, ticker: "AAPL", date: "5 juil.", pred: "Stabilité" as Prediction, conf: 71, actual: "Hausse" as Prediction },
  { id: 2, ticker: "NVDA", date: "5 juil.", pred: "Hausse" as Prediction, conf: 88, actual: "Hausse" as Prediction },
  { id: 3, ticker: "JPM", date: "5 juil.", pred: "Hausse" as Prediction, conf: 60, actual: "Stabilité" as Prediction },
  { id: 4, ticker: "GS", date: "5 juil.", pred: "Stabilité" as Prediction, conf: 65, actual: "Baisse" as Prediction },
  { id: 5, ticker: "AAPL", date: "12 juil.", pred: "Hausse" as Prediction, conf: 79, actual: "Hausse" as Prediction },
  { id: 6, ticker: "GS", date: "12 juil.", pred: "Baisse" as Prediction, conf: 69, actual: "Baisse" as Prediction },
  { id: 7, ticker: "NVO", date: "12 juil.", pred: "Hausse" as Prediction, conf: 85, actual: "Hausse" as Prediction },
  { id: 8, ticker: "CAT", date: "12 juil.", pred: "Baisse" as Prediction, conf: 72, actual: "Stabilité" as Prediction },
  { id: 9, ticker: "MSFT", date: "19 juil.", pred: "Hausse" as Prediction, conf: 76, actual: "Hausse" as Prediction },
  { id: 10, ticker: "JNJ", date: "19 juil.", pred: "Baisse" as Prediction, conf: 58, actual: "Stabilité" as Prediction },
  { id: 11, ticker: "UNH", date: "19 juil.", pred: "Hausse" as Prediction, conf: 73, actual: "Hausse" as Prediction },
  { id: 12, ticker: "NEE", date: "19 juil.", pred: "Stabilité" as Prediction, conf: 61, actual: "Baisse" as Prediction },
  { id: 13, ticker: "AAPL", date: "26 juil.", pred: "Hausse" as Prediction, conf: 82, actual: "Hausse" as Prediction },
  { id: 14, ticker: "BNP", date: "26 juil.", pred: "Stabilité" as Prediction, conf: 57, actual: "Stabilité" as Prediction },
  { id: 15, ticker: "GE", date: "26 juil.", pred: "Hausse" as Prediction, conf: 71, actual: "Hausse" as Prediction },
  { id: 16, ticker: "BTC", date: "26 juil.", pred: "Hausse" as Prediction, conf: 75, actual: "Hausse" as Prediction },
  { id: 17, ticker: "NVDA", date: "2 août", pred: "Hausse" as Prediction, conf: 91, actual: "Hausse" as Prediction },
  { id: 18, ticker: "JPM", date: "2 août", pred: "Stabilité" as Prediction, conf: 66, actual: "Stabilité" as Prediction },
  { id: 19, ticker: "NVO", date: "2 août", pred: "Hausse" as Prediction, conf: 87, actual: "Hausse" as Prediction },
  { id: 20, ticker: "ETH", date: "2 août", pred: "Hausse" as Prediction, conf: 68, actual: "Stabilité" as Prediction },
  { id: 21, ticker: "AAPL", date: "15 juin", pred: "Baisse" as Prediction, conf: 66, actual: "Stabilité" as Prediction },
  { id: 22, ticker: "MSFT", date: "15 juin", pred: "Hausse" as Prediction, conf: 80, actual: "Hausse" as Prediction },
  { id: 23, ticker: "NVDA", date: "22 juin", pred: "Hausse" as Prediction, conf: 89, actual: "Hausse" as Prediction },
  { id: 24, ticker: "BTC", date: "22 juin", pred: "Baisse" as Prediction, conf: 63, actual: "Baisse" as Prediction },
];
const FREE_HISTORY_LIMIT = 20;

// ─── PALETTE ─────────────────────────────────────────────────────────────────

const C = {
  bg: "#070c18", panel: "#0c1525", card: "#0f1d30", cardHov: "#142540",
  border: "rgba(255,255,255,0.07)", borderHi: "rgba(255,255,255,0.14)",
  blue: "#3b82f6", blueFaint: "rgba(59,130,246,0.12)",
  green: "#10b981", greenFaint: "rgba(16,185,129,0.12)",
  red: "#ef4444", redFaint: "rgba(239,68,68,0.12)",
  amber: "#f59e0b", amberFaint: "rgba(245,158,11,0.12)",
  orange: "#f97316", purple: "#a855f7",
  text: "#dde4f0", muted: "#64748b", dim: "#1e3048",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const pc = (p: Prediction) => p === "Hausse" ? C.green : p === "Baisse" ? C.red : C.amber;
const pb = (p: Prediction) => p === "Hausse" ? C.greenFaint : p === "Baisse" ? C.redFaint : C.amberFaint;
const pi = (p: Prediction) => p === "Hausse" ? TrendingUp : p === "Baisse" ? TrendingDown : Minus;
const f2 = (v: number) => v >= 100 ? v.toFixed(2) : v >= 10 ? v.toFixed(2) : v.toFixed(2);
const fPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function summ(ticker: string) {
  const d = ALL[ticker];
  if (!d || d.length < 2) return { price: 0, chg1d: 0, chg90d: 0, vol: 0, h52: 0, l52: 0, rsi: 50, volatility: 0, sma20: 0 };
  const last = d[d.length - 1], prev = d[d.length - 2], first = d[0];
  const returns = d.slice(1).map((x, i) => (x.close - d[i].close) / d[i].close);
  const mean = returns.reduce((a, b) => a + b) / returns.length;
  return {
    price: last.close, chg1d: ((last.close - prev.close) / prev.close) * 100,
    chg90d: ((last.close - first.close) / first.close) * 100,
    vol: last.volume, h52: Math.max(...d.map(x => x.high)), l52: Math.min(...d.map(x => x.low)),
    rsi: last.rsi ?? 50,
    volatility: Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) * Math.sqrt(252) * 100,
    sma20: last.sma20,
  };
}

function dailyReturns(data: DP[]) { return data.slice(1).map((d, i) => (d.close - data[i].close) / data[i].close); }
function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length); if (!n) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b) / n, my = y.slice(0, n).reduce((a, b) => a + b) / n;
  const num = x.slice(0, n).reduce((acc, xi, i) => acc + (xi - mx) * (y[i] - my), 0);
  const dx = Math.sqrt(x.slice(0, n).reduce((acc, xi) => acc + (xi - mx) ** 2, 0));
  const dy = Math.sqrt(y.slice(0, n).reduce((acc, yi) => acc + (yi - my) ** 2, 0));
  return dx === 0 || dy === 0 ? 0 : num / (dx * dy);
}
function exportCSV(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function sectorPerf(ss: StockDef[], days: number) {
  if (!ss.length) return 0;
  return ss.map(s => { const d = ALL[s.ticker]; if (!d || d.length < days) return 0; const sD = d.slice(-days); return ((sD[sD.length - 1].close - sD[0].close) / sD[0].close) * 100; }).reduce((a, b) => a + b) / ss.length;
}
function sectorSparkData(ss: StockDef[], period = 30): number[] {
  return Array.from({ length: period }, (_, i) => {
    return 0; // Return empty spark data when no ALL history
  });
}
function useWidth(ref: React.RefObject<HTMLDivElement>) {
  const [w, setW] = useState(700);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(e => setW(e[0].contentRect.width)); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return w;
}

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────

function Badge({ p, size = "sm" }: { p: Prediction; size?: "sm" | "md" | "lg" }) {
  const Icon = pi(p);
  const sz = { sm: { px: "5px 8px", fs: 10.5, ic: 10 }, md: { px: "6px 10px", fs: 12, ic: 12 }, lg: { px: "10px 14px", fs: 14, ic: 14 } }[size];
  return <span style={{ color: pc(p), background: pb(p), padding: sz.px, borderRadius: 4, fontSize: sz.fs, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}><Icon size={sz.ic} />{p}</span>;
}
function ConfBar({ v, col }: { v: number; col: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.dim }}><div style={{ width: `${v}%`, height: "100%", borderRadius: 3, background: col }} /></div>
      <span style={{ color: C.text, fontSize: 11, fontFamily: "JetBrains Mono,monospace", minWidth: 28, textAlign: "right" }}>{v}%</span>
    </div>
  );
}
function DarkTip({ active, payload, label }: { active?: boolean; payload?: { color?: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, padding: "7px 11px", fontSize: 10, fontFamily: "JetBrains Mono,monospace" }}>
      <p style={{ color: C.muted, marginBottom: 3 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color ?? C.text }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}</p>)}
    </div>
  );
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}><Download size={12} />CSV</button>;
}

function Sparkline({ values, color, id, width = 72, height = 32 }: { values: number[]; color: string; id: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * width, y: height - ((v - min) / range) * (height - 2) - 1 }));
  const lineStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaStr = `M ${pts[0].x.toFixed(1)},${height} ${pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L ${pts[pts.length - 1].x.toFixed(1)},${height} Z`;
  const gradId = `sp-${id}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <path d={areaStr} fill={`url(#${gradId})`} />
      <polyline points={lineStr} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}






// ─── CHART COMPONENTS ─────────────────────────────────────────────────────────

function CandleChart({ data }: { data: DP[] }) {
  const cRef = useRef<HTMLDivElement>(null!), w = useWidth(cRef);
  const [hi, setHi] = useState<number | null>(null);
  const H = 340, PAD = { t: 20, r: 74, b: 26, l: 8 }, W = Math.max(w - PAD.l - PAD.r, 80), CH = H - PAD.t - PAD.b;
  const disp = data.slice(-60), n = disp.length;
  if (n < 2) return <div ref={cRef} style={{ height: H }} />;
  const allP = disp.flatMap(d => [d.high, d.low, d.bollingerUpper ?? d.high, d.bollingerLower ?? d.low]).filter(Boolean) as number[];
  const minP = Math.min(...allP) * 0.9985, maxP = Math.max(...allP) * 1.0015, pr = maxP - minP;
  const xs = (i: number) => PAD.l + (i / (n - 1)) * W, ys = (p: number) => PAD.t + CH - ((p - minP) / pr) * CH;
  const cw = Math.max((W / n) * 0.55, 2), yticks = Array.from({ length: 5 }, (_, i) => minP + pr * (i / 4));
  const buPts = disp.map((d, i) => d.bollingerUpper !== null ? `${xs(i).toFixed(1)},${ys(d.bollingerUpper).toFixed(1)}` : null).filter((p): p is string => p !== null);
  const blPts = disp.map((d, i) => d.bollingerLower !== null ? `${xs(i).toFixed(1)},${ys(d.bollingerLower).toFixed(1)}` : null).filter((p): p is string => p !== null);
  const bPath = buPts.length > 1 ? `M ${buPts.join(" L ")} L ${[...blPts].reverse().join(" L ")} Z` : "";
  const s20Pts = disp.map((d, i) => d.sma20 !== null ? `${xs(i).toFixed(1)},${ys(d.sma20).toFixed(1)}` : null).filter((p): p is string => p !== null).join(" ");
  const s50Pts = disp.map((d, i) => d.sma50 !== null ? `${xs(i).toFixed(1)},${ys(d.sma50).toFixed(1)}` : null).filter((p): p is string => p !== null).join(" ");
  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => { const rect = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left - PAD.l) / W) * (n - 1))))); }, [W, n]);
  const hd = hi !== null ? disp[hi] : null, tipX = hi !== null ? Math.max(PAD.l + 4, Math.min(xs(hi) + 10, PAD.l + W - 122)) : 0;
  return (
    <div ref={cRef} style={{ height: H, width: "100%" }}>
      <svg width="100%" height={H} onMouseMove={onMove} onMouseLeave={() => setHi(null)} style={{ cursor: "crosshair", display: "block" }}>
        <defs>
          <linearGradient id="bfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.07} /><stop offset="100%" stopColor={C.blue} stopOpacity={0.02} /></linearGradient>
          <clipPath id="cc1"><rect x={PAD.l} y={PAD.t} width={W} height={CH} /></clipPath>
        </defs>
        {[{ col: C.orange, label: "SMA 20", dash: false }, { col: C.purple, label: "SMA 50", dash: false }, { col: C.blue, label: "Bollinger", dash: true }].map(({ col, label, dash }, i) => (
          <g key={label}><line x1={PAD.l + i * 82} y1={9} x2={PAD.l + i * 82 + 14} y2={9} stroke={col} strokeWidth={dash ? 1 : 1.6} strokeDasharray={dash ? "3,3" : undefined} opacity={0.85} /><text x={PAD.l + i * 82 + 18} y={13} fill={C.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">{label}</text></g>
        ))}
        {yticks.map((t, i) => <line key={i} x1={PAD.l} y1={ys(t)} x2={PAD.l + W} y2={ys(t)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,6" />)}
        {bPath && <path d={bPath} fill="url(#bfill)" clipPath="url(#cc1)" />}
        {buPts.length > 1 && <><polyline points={buPts.join(" ")} fill="none" stroke={C.blue} strokeWidth={0.9} strokeDasharray="4,4" opacity={0.4} clipPath="url(#cc1)" /><polyline points={blPts.join(" ")} fill="none" stroke={C.blue} strokeWidth={0.9} strokeDasharray="4,4" opacity={0.4} clipPath="url(#cc1)" /></>}
        {s20Pts && <polyline points={s20Pts} fill="none" stroke={C.orange} strokeWidth={1.4} opacity={0.9} clipPath="url(#cc1)" />}
        {s50Pts && <polyline points={s50Pts} fill="none" stroke={C.purple} strokeWidth={1.4} opacity={0.9} clipPath="url(#cc1)" />}
        <g clipPath="url(#cc1)">{disp.map((d, i) => { const up = d.close >= d.open, col = up ? C.green : C.red, cx = xs(i), bTop = Math.min(ys(d.open), ys(d.close)), bBot = Math.max(ys(d.open), ys(d.close)); return <g key={i}><line x1={cx} y1={ys(d.high)} x2={cx} y2={ys(d.low)} stroke={col} strokeWidth={1} opacity={0.8} /><rect x={cx - cw / 2} y={bTop} width={cw} height={Math.max(bBot - bTop, 1)} fill={col} opacity={0.85} /></g>; })}</g>
        {yticks.map((t, i) => <text key={i} x={PAD.l + W + 5} y={ys(t) + 4} fill={C.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">{t.toFixed(2)}</text>)}
        {disp.map((d, i) => i % Math.ceil(n / 7) === 0 ? <text key={i} x={xs(i)} y={H - 7} fill={C.muted} fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono,monospace">{d.date}</text> : null)}
        {hi !== null && <><line x1={xs(hi)} y1={PAD.t} x2={xs(hi)} y2={PAD.t + CH} stroke="rgba(255,255,255,0.18)" strokeDasharray="2,4" />
          {hd && <><rect x={tipX} y={PAD.t + 8} width={116} height={76} rx={4} fill={C.panel} stroke={C.border} /><text x={tipX + 8} y={PAD.t + 22} fill={C.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">{hd.date}</text>
            {(["O", "H", "L", "C"] as const).map((lb, ri) => { const val = lb === "O" ? hd.open : lb === "H" ? hd.high : lb === "L" ? hd.low : hd.close; return <text key={lb} x={tipX + 8} y={PAD.t + 34 + ri * 13} fill={lb === "C" ? (hd.close >= hd.open ? C.green : C.red) : C.text} fontSize={10} fontFamily="JetBrains Mono,monospace">{lb}: {val.toFixed(2)}</text>; })}</>}</>}
      </svg>
    </div>
  );
}
function RSIChart({ data }: { data: DP[] }) {
  const disp = data.slice(-60).map(d => ({ date: d.date, rsi: d.rsi }));
  return <ResponsiveContainer width="100%" height={148}><ComposedChart data={disp} margin={{ top: 8, right: 72, bottom: 8, left: 8 }}><CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={{ stroke: C.border }} interval={Math.ceil(disp.length / 7) - 1} /><YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} width={38} /><Tooltip content={<DarkTip />} /><ReferenceArea y1={70} y2={100} fill={C.redFaint} fillOpacity={1} stroke="none" /><ReferenceArea y1={0} y2={30} fill={C.greenFaint} fillOpacity={1} stroke="none" /><ReferenceLine y={70} stroke={C.red} strokeDasharray="3 3" strokeWidth={0.8} opacity={0.55} /><ReferenceLine y={30} stroke={C.green} strokeDasharray="3 3" strokeWidth={0.8} opacity={0.55} /><Line type="monotone" dataKey="rsi" stroke={C.blue} dot={false} strokeWidth={1.6} name="RSI(14)" connectNulls /></ComposedChart></ResponsiveContainer>;
}
function MACDChart({ data }: { data: DP[] }) {
  const macdData = data.slice(-60).filter(d => d.signal !== null).map(d => ({ date: d.date, macd: d.macd, signal: d.signal, histogram: d.histogram }));
  return <ResponsiveContainer width="100%" height={148}><ComposedChart data={macdData} margin={{ top: 8, right: 72, bottom: 8, left: 8 }}><CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={{ stroke: C.border }} interval={Math.ceil(macdData.length / 7) - 1} /><YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} width={38} tickCount={5} /><Tooltip content={<DarkTip />} /><ReferenceLine y={0} stroke={C.border} strokeWidth={1} /><Bar dataKey="histogram" name="Hist." maxBarSize={5} opacity={0.75}>{macdData.map((d, i) => <Cell key={i} fill={(d.histogram ?? 0) >= 0 ? C.green : C.red} />)}</Bar><Line type="monotone" dataKey="macd" stroke={C.blue} dot={false} strokeWidth={1.5} name="MACD" /><Line type="monotone" dataKey="signal" stroke={C.orange} dot={false} strokeWidth={1} strokeDasharray="3 3" name="Signal" /></ComposedChart></ResponsiveContainer>;
}

// ─── CORRELATION MATRIX ───────────────────────────────────────────────────────

function CorrelationMatrix({ tickers }: { tickers: string[] }) {
  const returns = useMemo(() => Object.fromEntries(tickers.map(t => [t, dailyReturns(ALL[t])])), [tickers]);
  if (tickers.length < 2) return null;
  return (
    <div>
      <div style={{ display: "flex", marginBottom: 4, paddingLeft: 60 }}>{tickers.map(t => <div key={t} style={{ width: 58, fontSize: 10, color: C.muted, textAlign: "center", fontFamily: "JetBrains Mono,monospace" }}>{t}</div>)}</div>
      {tickers.map((t1, i) => (
        <div key={t1} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
          <div style={{ width: 56, fontSize: 10, color: C.muted, fontFamily: "JetBrains Mono,monospace", flexShrink: 0, paddingRight: 4, textAlign: "right" }}>{t1}</div>
          {tickers.map((t2, j) => { const corr = i === j ? 1 : pearsonCorr(returns[t1], returns[t2]), absC = Math.abs(corr); const bg = i === j ? "rgba(255,255,255,0.08)" : corr > 0 ? `rgba(16,185,129,${absC * 0.75})` : `rgba(239,68,68,${absC * 0.75})`; return <div key={t2} title={`${t1}/${t2}: ${corr.toFixed(3)}`} style={{ width: 58, height: 40, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontFamily: "JetBrains Mono,monospace", color: absC > 0.5 ? C.text : C.muted, borderRadius: 3, margin: "0 1px" }}>{corr.toFixed(2)}</div>; })}
        </div>
      ))}
    </div>
  );
}

// ─── STOCK SELECTOR ───────────────────────────────────────────────────────────

function StockSelector({ selected, onChange, max = 5 }: { selected: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.card, border: `1px solid ${open ? C.borderHi : C.border}`, borderRadius: 6, cursor: "pointer", minWidth: 280, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
          {selected.length === 0 ? <span style={{ color: C.muted, fontSize: 12 }}>Sélectionner des actions…</span> :
            selected.map(t => <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: C.text, background: C.dim, padding: "2px 6px", borderRadius: 3 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: STOCK_COLORS[t], flexShrink: 0 }} />{t}<X size={9} style={{ cursor: "pointer", opacity: 0.7 }} onClick={e => { e.stopPropagation(); onChange(selected.filter(s => s !== t)); }} /></span>)}
        </div>
        <ChevronDown size={12} style={{ color: C.muted, transform: open ? "rotate(180deg)" : undefined, flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden", maxHeight: 360, overflowY: "auto" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>Sélectionner 1–{max} action{max > 1 ? "s" : ""} ({selected.length}/{max})</div>
          {STOCKS.map(s => { const checked = selected.includes(s.ticker), disabled = !checked && selected.length >= max; return <div key={s.ticker} onClick={() => { if (disabled) return; onChange(checked ? selected.filter(t => t !== s.ticker) : [...selected, s.ticker]); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, borderBottom: `1px solid ${C.border}` }} onMouseEnter={e => !disabled && ((e.currentTarget as HTMLDivElement).style.background = C.cardHov)} onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}><div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? C.blue : C.border}`, background: checked ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{checked && <span style={{ color: "white", fontSize: 9, fontWeight: 700 }}>✓</span>}</div><span style={{ width: 6, height: 6, borderRadius: "50%", background: STOCK_COLORS[s.ticker], flexShrink: 0 }} /><span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: C.text, fontWeight: 600 }}>{s.ticker}</span><span style={{ fontSize: 11, color: C.muted }}>{s.name}</span><span style={{ marginLeft: "auto", fontSize: 10, color: C.dim }}>{s.sector}</span></div>; })}
        </div>
      )}
    </div>
  );
}

// ─── AUTH MODAL ───────────────────────────────────────────────────────────────

function AuthRequiredModal({ context, onLogin, onSignup, onClose }: { context: string; onLogin: () => void; onSignup: () => void; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 14, width: 420, padding: "32px 36px", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}><X size={16} /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: C.blueFaint, border: `1px solid ${C.blue}33`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><Shield size={22} style={{ color: C.blue }} /></div>
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Connexion requise</h2>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, margin: "0 0 24px" }}>{context}</p>
        <button onClick={onLogin} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><LogIn size={15} />Se connecter</button>
        <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Pas encore de compte ? <button onClick={onSignup} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 500, padding: 0 }}>Créer un compte</button></div>
      </div>
    </div>
  );
}

// ─── PREMIUM MODAL ────────────────────────────────────────────────────────────


// ─── AUTH FIELD ───────────────────────────────────────────────────────────────

function AuthField({ label, type, value, onChange, placeholder, right }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string; right?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 6, letterSpacing: "0.02em" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", boxSizing: "border-box", padding: right ? "10px 40px 10px 14px" : "10px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, outline: "none", fontFamily: "Inter,sans-serif", transition: "border-color 0.15s" }}
          onFocus={e => (e.target.style.borderColor = C.blue)} onBlur={e => (e.target.style.borderColor = C.border)} />
        {right && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>{right}</div>}
      </div>
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────

function LoginPage({ onLogin, onGoSignup, onContinueAsGuest, onForgotPassword }: { onLogin: (name: string) => void; onGoSignup: () => void; onContinueAsGuest: () => void; onForgotPassword: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [showPw, setShowPw] = useState(false), [error, setError] = useState("");
  const { login, loginWithGoogle } = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) { setError("Veuillez remplir tous les champs."); return; }
    try {
      await login({ email, password });
      onLogin(email);
    } catch (err: any) {
      setError(err.message || "Email ou mot de passe incorrect.");
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsGoogleLoading(true);
      try {
        await loginWithGoogle(tokenResponse.access_token);
        onLogin("Google User");
      } catch (err: any) {
        setError(err.message || "Impossible de vérifier votre connexion Google.");
      } finally {
        setIsGoogleLoading(false);
      }
    },
    onError: () => {
      setError("Authentification Google invalide ou annulée.");
    }
  });
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} color="white" /></div>
          <div><div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5 }}>Predict Engine</div></div>
        </div>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Connexion</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px" }}>Accédez à votre espace personnel AlphaML</p>
        <AuthField label="Adresse email" type="email" value={email} onChange={setEmail} placeholder="analyst@alphamo.io" />
        <AuthField label="Mot de passe" type={showPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="••••••••" right={<button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{error}</div>}
        <button onClick={handleSubmit} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><LogIn size={15} />Se connecter</button>
        <div style={{ textAlign: "center", marginBottom: 20 }}><button onClick={onForgotPassword} style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>Mot de passe oublié ?</button></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><div style={{ flex: 1, height: 1, background: C.border }} /><span style={{ color: C.muted, fontSize: 11 }}>ou</span><div style={{ flex: 1, height: 1, background: C.border }} /></div>
        <button onClick={() => googleLogin()} disabled={isGoogleLoading} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 13, fontWeight: 500, cursor: isGoogleLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24, opacity: isGoogleLoading ? 0.7 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {isGoogleLoading ? "Connexion..." : "Continuer avec Google"}
        </button>
        <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Pas encore de compte ? <button onClick={onGoSignup} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Créer un compte</button></div>
      </div>
    </div>
  );
}

// ─── SIGNUP PAGE ──────────────────────────────────────────────────────────────

function SignupPage({ onSignup, onGoLogin, onContinueAsGuest }: { onSignup: (name: string) => void; onGoLogin: () => void; onContinueAsGuest: () => void }) {
  const [fullName, setFullName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [showPw, setShowPw] = useState(false), [agreed, setAgreed] = useState(false), [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const handleSubmit = async () => {
    if (!fullName || !email || !password || !confirm) { setError("Veuillez remplir tous les champs."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (!agreed) { setError("Veuillez accepter les conditions d'utilisation."); return; }
    
    setIsLoading(true);
    try {
      await register({ username: fullName, email, password });
      onGoLogin();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'inscription.");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", padding: "40px 0" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} color="white" /></div>
          <div><div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5 }}>Predict Engine</div></div>
        </div>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Créer un compte</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px" }}>Rejoignez AlphaML et suivez vos actions</p>
        <AuthField label="Nom complet" type="text" value={fullName} onChange={setFullName} placeholder="Jean Dupont" />
        <AuthField label="Adresse email" type="email" value={email} onChange={setEmail} placeholder="jean@alphamo.io" />
        <AuthField label="Mot de passe" type={showPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="Minimum 8 caractères" right={<button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
        <AuthField label="Confirmer le mot de passe" type={showPw ? "text" : "password"} value={confirm} onChange={setConfirm} placeholder="Répétez le mot de passe" />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }} onClick={() => setAgreed(v => !v)}>
          <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${agreed ? C.blue : C.border}`, background: agreed ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{agreed && <Check size={10} color="white" />}</div>
          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>J'accepte les <span style={{ color: C.blue }}>conditions d'utilisation</span> et la <span style={{ color: C.blue }}>politique de confidentialité</span></span>
        </div>
        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={isLoading} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: isLoading ? C.muted : C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: isLoading ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{isLoading ? "Création en cours..." : <><UserPlus size={15} />Créer mon compte</>}</button>
        <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Déjà un compte ? <button onClick={onGoLogin} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Se connecter</button></div>
      </div>
    </div>
  );
}
// ─── FORGOT PASSWORD PAGE ───────────────────────────────────────────────────

function ForgotPasswordPage({ onGoLogin, onContinueAsGuest }: { onGoLogin: () => void; onContinueAsGuest: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { forgotPassword } = useAuth();

  const handleSubmit = async () => {
    if (!email) {
      setMessage("Veuillez saisir votre adresse e-mail.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      setStatus("success");
    } catch (err: any) {
      setMessage(err.message || "Erreur lors de l'envoi.");
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", padding: "40px 0" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Mot de passe oublié ?</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px", lineHeight: 1.5 }}>
          Entrez votre adresse e-mail et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>
        
        {status === "success" ? (
          <div style={{ background: "rgba(52, 168, 83, 0.1)", border: "1px solid rgba(52, 168, 83, 0.3)", padding: "16px", borderRadius: 8, color: "#34A853", fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
            {message}
          </div>
        ) : (
          <>
            <AuthField label="Adresse email" type="email" value={email} onChange={setEmail} placeholder="analyst@alphamo.io" />
            {status === "error" && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{message}</div>}
            
            <button onClick={handleSubmit} disabled={status === "loading"} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: status === "loading" ? C.muted : C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: status === "loading" ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {status === "loading" ? "Envoi..." : "Envoyer le lien"}
            </button>
          </>
        )}
        
        <div style={{ textAlign: "center" }}>
          <button onClick={onGoLogin} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
            Retour à la connexion
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RESET PASSWORD PAGE ────────────────────────────────────────────────────

function ResetPasswordPage({ onGoLogin, onContinueAsGuest }: { onGoLogin: () => void; onContinueAsGuest: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<"verifying" | "invalid" | "idle" | "loading" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");
  const { verifyResetToken, resetPassword } = useAuth();
  
  // Extract token from URL
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    verifyResetToken(token).then((res) => {
      if (res.valid) {
        setStatus("idle");
      } else {
        setStatus("invalid");
      }
    }).catch(() => {
      setStatus("invalid");
    });
  }, [token, verifyResetToken]);

  const handleSubmit = async () => {
    if (!password || !confirm) { setMessage("Veuillez remplir tous les champs."); setStatus("error"); return; }
    if (password !== confirm) { setMessage("Les mots de passe ne correspondent pas."); setStatus("error"); return; }
    if (password.length < 8) { setMessage("Le mot de passe doit contenir au moins 8 caractères."); setStatus("error"); return; }
    
    setStatus("loading");
    try {
      const res = await resetPassword(token!, password);
      setMessage(res.message);
      setStatus("success");
    } catch (err: any) {
      setMessage(err.message || "Erreur lors de la réinitialisation.");
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", padding: "40px 0" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Réinitialiser le mot de passe</h1>
        
        {status === "verifying" && (
          <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>Vérification du lien...</div>
        )}

        {status === "invalid" && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <div style={{ color: C.red, fontSize: 14, marginBottom: 24, background: C.redFaint, padding: "16px", borderRadius: 8 }}>Ce lien de réinitialisation est invalide ou a expiré.</div>
            <button onClick={onGoLogin} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Demander un nouveau lien</button>
          </div>
        )}

        {status === "success" && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <div style={{ color: "#34A853", fontSize: 14, marginBottom: 24, background: "rgba(52, 168, 83, 0.1)", padding: "16px", borderRadius: 8, lineHeight: 1.5 }}>
              Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </div>
            <button onClick={() => {
              // Clean URL and go to login
              window.history.replaceState({}, document.title, window.location.pathname);
              onGoLogin();
            }} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Retour à la connexion</button>
          </div>
        )}

        {(status === "idle" || status === "loading" || status === "error") && (
          <>
            <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px" }}>Veuillez définir votre nouveau mot de passe.</p>
            <AuthField label="Nouveau mot de passe" type={showPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="Minimum 8 caractères" right={<button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
            <AuthField label="Confirmer le mot de passe" type={showPw ? "text" : "password"} value={confirm} onChange={setConfirm} placeholder="Répétez le mot de passe" />
            
            {status === "error" && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{message}</div>}
            
            <button onClick={handleSubmit} disabled={status === "loading"} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: status === "loading" ? C.muted : C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: status === "loading" ? "not-allowed" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {status === "loading" ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── VISITOR BANNER ───────────────────────────────────────────────────────────

function VisitorBanner({ onLogin, onDismiss }: { onLogin: () => void; onDismiss: () => void }) {
  return (
    <div style={{ background: "rgba(59,130,246,0.08)", borderBottom: `1px solid rgba(59,130,246,0.18)`, padding: "10px 32px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue, flexShrink: 0 }} />
      <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>Vous consultez <span style={{ color: C.text, fontWeight: 500 }}>AlphaML en mode visiteur</span>. Connectez-vous pour sauvegarder vos favoris et configurer des alertes personnalisées.</span>
      <button onClick={onLogin} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.blue}`, background: C.blueFaint, color: C.blue, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>Se connecter</button>
      <button onClick={onDismiss} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 2, display: "flex" }}><X size={14} /></button>
    </div>
  );
}

// ─── PREMIUM PAGE ─────────────────────────────────────────────────────────────


// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "actions", label: "Actions", icon: BarChart2 },
  { id: "comparison", label: "Comparaison", icon: Layers },
  { id: "predictions", label: "Prédictions", icon: Target },
  { id: "sectors", label: "Secteurs", icon: Building2 },
  { id: "favorites", label: "Favoris", icon: Star },
  { id: "historique", label: "Historique", icon: Clock },
];

function Sidebar({ active, onNav, isLoggedIn, userName, onLogin, onSignup, onLogout }: {
  active: string; onNav: (id: string) => void;
  isLoggedIn: boolean; userName: string;
  onLogin: () => void; onSignup: () => void; onLogout: () => void;
}) {
  return (
    <aside style={{ width: 220, minWidth: 220, background: C.panel, borderRight: `1px solid ${C.border}`, height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", zIndex: 20 }}>
      <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 6, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={16} color="white" /></div>
        <div><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5, marginTop: 1 }}>Predict Engine</div></div>
      </div>
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          if (id === "premium") return null;
          return (
            <button key={id} onClick={() => onNav(id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 6, color: isActive ? C.text : C.muted, background: isActive ? C.cardHov : "transparent", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: `2px solid ${isActive ? C.blue : "transparent"}`, fontSize: 13, fontWeight: isActive ? 500 : 400, cursor: "pointer", outline: "none", textAlign: "left", width: "100%", transition: "all 0.15s" }}>
              <Icon size={14} style={{ color: isActive ? C.blue : C.muted }} />
              <span style={{ flex: 1 }}>{label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}` }}>
        {isLoggedIn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.text, flexShrink: 0 }}>
              {userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 85 }}>{userName}</div>
              </div>
              <div style={{ color: C.muted, fontSize: 10.5 }}>Utilisateur</div>
            </div>
            <button onClick={onLogout} title="Se déconnecter" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}><LogOut size={13} /></button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <button onClick={onLogin} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}><LogIn size={13} />Se connecter</button>
            <button onClick={onSignup} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 6, border: "none", background: C.blue, color: "white", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><UserPlus size={13} />Créer un compte</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
      <div><h1 style={{ color: C.text, fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h1>{sub && <p style={{ color: C.muted, fontSize: 11, margin: "3px 0 0" }}>{sub}</p>}</div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>}
    </header>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────

function DashboardPage({ onStock, favorites, toggleFav, isLoggedIn, onLogin, bannerDismissed, onBannerDismiss }: {
  onStock: (t: string) => void; favorites: string[]; toggleFav: (t: string) => void;
  isLoggedIn: boolean; onLogin: () => void;
  bannerDismissed: boolean; onBannerDismiss: () => void;
}) {
  const [search, setSearch] = useState(""), [filter, setFilter] = useState<"Tous" | "Favoris" | Prediction>("Tous");
  const { stocks: allStocks, loading: mktLoading, refresh: mktRefresh } = useMarketData();
  const allFiltered = allStocks.filter(s => {
    const q = search.toLowerCase(), match = s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    const pred = filter === "Tous" ? true : filter === "Favoris" ? favorites.includes(s.ticker) : s.prediction === filter;
    return match && pred;
  });
  const visibleStocks = allFiltered;
  const hausseCount = allStocks.filter(s => !s.loading && s.prediction === "Hausse").length;
  const baisseCount = allStocks.filter(s => !s.loading && s.prediction === "Baisse").length;
  const stableCount = allStocks.filter(s => !s.loading && s.prediction === "Stabilité").length;

  const handleExport = () => {
    exportCSV(allStocks.filter(s => !s.loading && !s.error).map(s => ({ Ticker: s.ticker, Prix: f2(s.price), Var1J: f2(s.chg1d), Var90J: f2(s.chg90d), RSI: f2(s.rsi), Prédiction: s.prediction, Confiance: s.confidence })), "dashboard.csv");
  };

  // Skeleton cell pour le chargement
  const Skel = () => <span style={{ display: "inline-block", width: 48, height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 3, verticalAlign: "middle", animation: "pulse 1.5s ease-in-out infinite" }} />;


  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {!isLoggedIn && !bannerDismissed && <VisitorBanner onLogin={onLogin} onDismiss={onBannerDismiss} />}
      <PageHeader title="Tableau de bord" sub="Vue d'ensemble — Modèle V13.5"
        right={<>
          <ExportBtn onClick={handleExport} />
          <button onClick={mktRefresh} disabled={mktLoading} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", opacity: mktLoading ? 0.5 : 1 }}><RefreshCw size={12} style={{ animation: mktLoading ? "spin 1s linear infinite" : undefined }} />Actualiser</button>
        </>}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}><span style={{ color: C.muted, fontSize: 11 }}>Actions suivies</span><div style={{ width: 28, height: 28, borderRadius: 6, background: `${C.blue}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={14} style={{ color: C.blue }} /></div></div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>
              {allStocks.length}
            </div>
            <div style={{ color: C.muted, fontSize: 10.5, marginTop: 6 }}>{SECTORS.length} secteurs</div>
          </div>
          {[{ label: "Prédictions haussières", value: mktLoading ? "…" : String(hausseCount), sub: mktLoading ? "Chargement…" : `${baisseCount} baissières · ${stableCount} stables`, icon: TrendingUp, color: C.amber }].map(({ label, value, sub, icon: Icon, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}><span style={{ color: C.muted, fontSize: 11 }}>{label}</span><div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={14} style={{ color }} /></div></div>
              <div style={{ color: C.text, fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 10.5, marginTop: 6 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, fontSize: 11, color: C.muted }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={10} />MàJ : {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Zap size={10} style={{ color: C.green }} /><span style={{ color: C.green }}>●</span>Modèle actif</span>
          {!isLoggedIn && <span style={{ marginLeft: "auto", color: C.muted, fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}><User size={10} />Mode visiteur</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <Search size={13} style={{ color: C.muted }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12, fontFamily: "inherit", width: 180 }} />
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {(["Tous", "Favoris", "Hausse", "Stabilité", "Baisse"] as const).map(f => {
              const isActive = filter === f, col = f === "Tous" ? C.blue : f === "Favoris" ? C.amber : pc(f as Prediction);
              return <button key={f} onClick={() => { if (f === "Favoris" && !isLoggedIn) { onRequireAuth("Connectez-vous pour accéder à vos favoris."); return; } setFilter(f); }} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 5, cursor: "pointer", border: `1px solid ${isActive ? col : C.border}`, background: isActive ? `${col}18` : "transparent", color: isActive ? col : C.muted, display: "flex", alignItems: "center", gap: 4 }}>{f === "Favoris" && <Star size={10} />}{f}</button>;
            })}
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["", "Ticker", "Société", "Secteur", "Prix", "1J", "90J", "RSI", "Prédiction", "Confiance"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {visibleStocks.map((s, idx) => {
                const isFav = favorites.includes(s.ticker) && isLoggedIn;
                return (
                  <tr key={s.ticker} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHov)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "11px 8px 11px 14px" }}><button onClick={e => { e.stopPropagation(); if (!isLoggedIn) { onRequireAuth("Connectez-vous pour ajouter des favoris."); return; } toggleFav(s.ticker); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><Star size={13} fill={isFav ? C.amber : "none"} style={{ color: isFav ? C.amber : C.dim }} /></button></td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", fontWeight: 600, fontSize: 13 }}>{s.ticker}</span></td>
                    <td style={{ padding: "11px 14px", color: C.muted }} onClick={() => onStock(s.ticker)}>{s.name}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{s.sector}</span></td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", color: C.text }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : `$${f2(s.price)}`}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg1d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{s.chg1d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fPct(s.chg1d)}</span>}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg90d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : fPct(s.chg90d)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.rsi > 70 ? C.red : s.rsi < 30 ? C.green : C.muted }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : s.rsi.toFixed(1)}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <Badge p={s.prediction} />}</td>
                    <td style={{ padding: "11px 14px", minWidth: 120 }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <ConfBar v={s.confidence} col={pc(s.prediction)} />}</td>
                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── FAVORITES PAGE ───────────────────────────────────────────────────────────

function FavoritesPage({ onStock, favorites, toggleFav, isLoggedIn, onRequireAuth }: {
  onStock: (t: string) => void; favorites: string[]; toggleFav: (t: string) => void;
  isLoggedIn: boolean; onRequireAuth: (ctx: string) => void;
}) {
  const { stocks: allStocks, loading: mktLoading } = useMarketData();
  const visibleStocks = allStocks.filter(s => favorites.includes(s.ticker));

  const Skel = () => <span style={{ display: "inline-block", width: 48, height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 3, verticalAlign: "middle", animation: "pulse 1.5s ease-in-out infinite" }} />;

  if (!isLoggedIn) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <Star size={48} style={{ color: C.muted, marginBottom: 16 }} />
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Connectez-vous</h2>
        <p style={{ color: C.muted, fontSize: 13, textAlign: "center", maxWidth: 300 }}>Vous devez être connecté pour ajouter des actions à vos favoris et les retrouver ici.</p>
      </div>
    );
  }

  if (visibleStocks.length === 0 && !mktLoading) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <Star size={48} style={{ color: C.amber, marginBottom: 16 }} />
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Aucune action favorite</h2>
        <p style={{ color: C.muted, fontSize: 13, textAlign: "center", maxWidth: 300 }}>Ajoutez vos actions préférées en cliquant sur l'étoile (☆) pour les retrouver rapidement depuis cette section.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Mes Favoris" sub="Actions que vous suivez actuellement" />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["", "Ticker", "Société", "Secteur", "Prix", "1J", "90J", "RSI", "Prédiction", "Confiance"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {visibleStocks.map((s) => {
                const isFav = true;
                return (
                  <tr key={s.ticker} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHov)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "11px 8px 11px 14px" }}><button onClick={e => { e.stopPropagation(); toggleFav(s.ticker); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><Star size={13} fill={C.amber} style={{ color: C.amber }} /></button></td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", fontWeight: 600, fontSize: 13 }}>{s.ticker}</span></td>
                    <td style={{ padding: "11px 14px", color: C.muted }} onClick={() => onStock(s.ticker)}>{s.name}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{s.sector}</span></td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", color: C.text }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : `$${f2(s.price)}`}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg1d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{s.chg1d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fPct(s.chg1d)}</span>}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg90d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : fPct(s.chg90d)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.rsi > 70 ? C.red : s.rsi < 30 ? C.green : C.muted }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : s.rsi.toFixed(1)}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <Badge p={s.prediction} />}</td>
                    <td style={{ padding: "11px 14px", minWidth: 120 }} onClick={() => onStock(s.ticker)}>{s.loading ? <Skel /> : <ConfBar v={s.confidence} col={pc(s.prediction)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ACTIONS PAGE ─────────────────────────────────────────────────────────────

function ActionsPage({ onStock }: { onStock: (t: string) => void }) {
  const [search, setSearch] = useState(""), [sectorF, setSectorF] = useState<string | null>(null);
  const { stocks: allStocks, loading: mktLoading, refresh: mktRefresh } = useMarketData();
  const filtered = allStocks.filter(s => { const q = search.toLowerCase(); return (s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) && (!sectorF || s.sector === sectorF); });
  const Skel = () => <span style={{ display: "inline-block", width: 48, height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 3 }} />;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Catalogue des actions" sub={`${allStocks.length} valeurs suivies — données réelles de marché`}
        right={<button onClick={mktRefresh} disabled={mktLoading} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", opacity: mktLoading ? 0.5 : 1 }}><RefreshCw size={12} />Actualiser</button>}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <Search size={13} style={{ color: C.muted }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticker ou société..." style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12, fontFamily: "inherit", width: 180 }} />
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button onClick={() => setSectorF(null)} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 5, border: `1px solid ${!sectorF ? C.blue : C.border}`, background: !sectorF ? C.blueFaint : "transparent", color: !sectorF ? C.blue : C.muted, cursor: "pointer" }}>Tous</button>
            {SECTORS.map(s => <button key={s} onClick={() => setSectorF(sectorF === s ? null : s)} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 5, border: `1px solid ${sectorF === s ? C.blue : C.border}`, background: sectorF === s ? C.blueFaint : "transparent", color: sectorF === s ? C.blue : C.muted, cursor: "pointer" }}>{s}</button>)}
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["Ticker", "Société", "Secteur", "Prix", "Var. 1J", "Var. 90J", "RSI", "Volatilité", "Prédiction", "Confiance"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {filtered.map((s, idx) => (
                <tr key={s.ticker} onClick={() => onStock(s.ticker)} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHov)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "11px 16px" }}><span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>{s.ticker}</span></td>
                  <td style={{ padding: "11px 16px", color: C.muted }}>{s.name}</td>
                  <td style={{ padding: "11px 16px" }}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{s.sector}</span></td>
                  <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", color: C.text }}>{s.loading ? <Skel /> : `$${f2(s.price)}`}</td>
                  <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg1d >= 0 ? C.green : C.red }}>{s.loading ? <Skel /> : <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{s.chg1d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fPct(s.chg1d)}</span>}</td>
                  <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.chg90d >= 0 ? C.green : C.red }}>{s.loading ? <Skel /> : fPct(s.chg90d)}</td>
                  <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: s.rsi > 70 ? C.red : s.rsi < 30 ? C.green : C.muted }}>{s.loading ? <Skel /> : s.rsi.toFixed(1)}</td>
                  <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.muted }}>{s.loading ? <Skel /> : `${s.volatility.toFixed(1)}%`}</td>
                  <td style={{ padding: "11px 16px" }}>{s.loading ? <Skel /> : <Badge p={s.prediction} />}</td>
                  <td style={{ padding: "11px 16px", minWidth: 110 }}>{s.loading ? <Skel /> : <ConfBar v={s.confidence} col={pc(s.prediction)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PREDICTIONS PAGE ────────────────────────────────────────────────────────

const HIST_WINDOW_OPTIONS = [
  { label: "7 jours", value: 7 },
  { label: "15 jours", value: 15 },
  { label: "30 jours", value: 30 },
  { label: "60 jours", value: 60 },
];


function PredictionsPage({ onStock }: { onStock: (t: string) => void }) {
  const [selectedTickers, setSelectedTickers] = useState<string[]>(["AAPL"]);
  const [histWindow, setHistWindow] = useState(15);
  const forecastHorizon = 5;
  const [showCorr, setShowCorr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [predictionsData, setPredictionsData] = useState<Record<string, AIPrediction>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    const loadAll = async () => {
      const results = await Promise.all(
        selectedTickers.map(async (ticker) => {
          const prediction = await getAIPrediction(ticker);
          if (!prediction) return null;
          return { ticker, data: prediction };
        })
      );
      if (active) {
        const newDict: Record<string, AIPrediction> = {};
        results.forEach(r => { if (r) newDict[r.ticker] = r.data; });
        setPredictionsData(newDict);
        setLoading(false);
      }
    };
    loadAll();
    return () => { active = false; };
  }, [selectedTickers]);

  const chartData = useMemo(() => {
    if (selectedTickers.length === 0 || Object.keys(predictionsData).length === 0) return [];
    
    const firstTicker = selectedTickers.find(t => predictionsData[t]);
    if (!firstTicker) return [];
    
    const histPoints = predictionsData[firstTicker].historical.slice(-histWindow);
    const forecastPoints = predictionsData[firstTicker].forecast.slice(0, forecastHorizon);
    
    const combined: Record<string, number | null | string | boolean>[] = [];
    
    for (let i = 0; i < histPoints.length; i++) {
      const pt: Record<string, number | null | string | boolean> = { day: histPoints[i].date, isFuture: false };
      selectedTickers.forEach(ticker => {
        const pd = predictionsData[ticker];
        if (pd) {
          const h = pd.historical.slice(-histWindow);
          pt[ticker] = h[i]?.close ?? null;
          pt[`${ticker}_upper`] = null;
          pt[`${ticker}_lower`] = null;
        }
      });
      combined.push(pt);
    }
    
    for (let i = 0; i < forecastPoints.length; i++) {
      const pt: Record<string, number | null | string | boolean> = { day: forecastPoints[i].date, isFuture: true };
      selectedTickers.forEach(ticker => {
         const pd = predictionsData[ticker];
         if (pd) {
           const h = pd.historical.slice(-histWindow);
           const f = pd.forecast.slice(0, forecastHorizon);
           pt[ticker] = i === 0 ? (h[h.length - 1]?.close ?? null) : null;
           pt[`${ticker}_forecast`] = f[i]?.predicted_close ?? null;
           
           const conf = pd.trend_prediction.confidence;
           const ciWidth = (1 - conf) * (i + 1) * 0.018 + 0.008;
           pt[`${ticker}_upper`] = f[i] ? f[i].predicted_close * (1 + ciWidth) : null;
           pt[`${ticker}_lower`] = f[i] ? f[i].predicted_close * (1 - ciWidth) : null;
         }
      });
      combined.push(pt);
    }
    return combined;
  }, [selectedTickers, histWindow, forecastHorizon, predictionsData]);

  const forecasts = useMemo(() => selectedTickers.map(t => {
    const pd = predictionsData[t];
    if (!pd) return null;
    
    const histSlice = pd.historical.slice(-histWindow);
    const currentPrice = histSlice[histSlice.length - 1]?.close ?? 0;
    const fSlice = pd.forecast.slice(0, forecastHorizon);
    
    const days = fSlice.map((f, i) => {
        const conf = pd.trend_prediction.confidence;
        const ciWidth = (1 - conf) * (i + 1) * 0.018 + 0.008;
        return {
            day: f.date,
            price: f.predicted_close,
            upper: f.predicted_close * (1 + ciWidth),
            lower: f.predicted_close * (1 - ciWidth)
        };
    });
    
    return {
        ticker: t,
        stock: {
            ...STOCKS.find(s => s.ticker === t)!,
            prediction: pd.trend_prediction.signal,
            confidence: Math.round((pd.trend_prediction.display_confidence ?? pd.trend_prediction.confidence) * 100),
            margin: pd.trend_prediction.margin !== undefined ? Math.round(pd.trend_prediction.margin * 1000) / 10 : undefined,
            name: STOCKS.find(s => s.ticker === t)?.name || t,
        },
        currentPrice,
        days,
        risk: pd.risk_management,
        probs: pd.trend_prediction.probabilities
    };
  }).filter(Boolean) as any[], [selectedTickers, forecastHorizon, histWindow, predictionsData]);

  const firstForecastDay = chartData.find(d => d.isFuture)?.day as string | undefined;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Prédictions ML" sub="Modèle dynamique en production · Prévisions avec intervalles de confiance" />
      <div style={{ flex: 1, padding: "24px 32px" }}>

        {/* Controls bar */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24, flexWrap: "wrap", padding: "16px 20px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em" }}>ACTIONS À ANALYSER</div>
            <StockSelector selected={selectedTickers} onChange={setSelectedTickers} max={5} />
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em" }}>HISTORIQUE AFFICHÉ</div>
            <div style={{ display: "flex", gap: 4 }}>
              {HIST_WINDOW_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setHistWindow(o.value)} style={{ fontSize: 11.5, padding: "6px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${histWindow === o.value ? C.blue : C.border}`, background: histWindow === o.value ? C.blueFaint : "transparent", color: histWindow === o.value ? C.blue : C.muted, fontWeight: histWindow === o.value ? 600 : 400 }}>{o.label}</button>
              ))}
            </div>
          </div>

          {selectedTickers.length >= 2 && (
            <button onClick={() => setShowCorr(v => !v)} style={{ alignSelf: "flex-end", fontSize: 12, padding: "7px 14px", borderRadius: 5, border: `1px solid ${showCorr ? C.purple : C.border}`, background: showCorr ? "rgba(168,85,247,0.12)" : "transparent", color: showCorr ? C.purple : C.muted, cursor: "pointer" }}>Corrélation</button>
          )}
        </div>

        {selectedTickers.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>Sélectionnez au moins une action pour voir les prévisions.</div>
        )}

        {selectedTickers.length > 0 && (
          <>
            {/* Forecast summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selectedTickers.length, 3)},1fr)`, gap: 14, marginBottom: 20 }}>
              {loading && <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, gridColumn: "1/-1" }}>Calcul en cours\u2026</div>}
              {!loading && forecasts.map((forecast) => {
                const { ticker, stock, currentPrice, days } = forecast;
                const finalDay = days[days.length - 1];
                const totalChange = finalDay ? ((finalDay.price - currentPrice) / currentPrice) * 100 : 0;
                return (
                  <div key={ticker} style={{ background: C.card, border: `1px solid ${STOCK_COLORS[ticker]}33`, borderRadius: 10, padding: "18px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: STOCK_COLORS[ticker], flexShrink: 0 }} />
                        <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 15 }}>{ticker}</span>
                        <span style={{ color: C.muted, fontSize: 11 }}>{stock.name}</span>
                      </div>
                      <Badge p={stock.prediction} />
                    </div>
                    <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
                      <div>
                        <div style={{ color: C.muted, fontSize: 10 }}>Actuel</div>
                        <div style={{ color: C.text, fontSize: 20, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>${f2(currentPrice)}</div>
                      </div>
                      <div style={{ fontSize: 18, color: C.muted, alignSelf: "center" }}>→</div>
                      <div>
                        <div style={{ color: C.muted, fontSize: 10 }}>J+{forecastHorizon} (cible)</div>
                        <div style={{ color: pc(stock.prediction), fontSize: 20, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>${f2(finalDay.price)}</div>
                      </div>
                      <div style={{ alignSelf: "center" }}>
                        <span style={{ color: totalChange >= 0 ? C.green : C.red, fontFamily: "JetBrains Mono,monospace", fontSize: 13, fontWeight: 600 }}>{totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}%</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 3 }}>
                      {days.map((d, i) => {
                        const chg = ((d.price - currentPrice) / currentPrice) * 100;
                        return (
                          <div key={i} style={{ flex: 1, textAlign: "center", background: C.panel, borderRadius: 4, padding: "5px 3px" }}>
                            <div style={{ color: C.muted, fontSize: 8.5, marginBottom: 2 }}>{d.day}</div>
                            <div style={{ color: chg >= 0 ? C.green : C.red, fontSize: 9, fontFamily: "JetBrains Mono,monospace", fontWeight: 600 }}>{chg >= 0 ? "+" : ""}{chg.toFixed(1)}%</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5 }}>
                      <span style={{ color: C.muted }}>Fourchette J+{forecastHorizon}</span>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", color: C.text }}>${f2(finalDay?.lower ?? 0)} – ${f2(finalDay?.upper ?? 0)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10.5 }}>
                      <span style={{ color: C.muted }}>Confiance</span>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", color: pc(stock.prediction) }}>{stock.confidence}%</span>
                    </div>
                    {(() => {
                      const conf = stock.confidence;
                      const confLevelText = conf < 40 ? "FAIBLE" : conf < 60 ? "MODÉRÉE" : "ÉLEVÉE";
                      const confColor = conf < 40 ? C.red : conf < 60 ? C.orange : C.green;
                      let confMsg = "";
                      if (conf < 40) {
                          if (stock.prediction === "Stabilité" || stock.prediction === "Stabilite") confMsg = "Stabilité légèrement privilégiée, mais avec une confiance faible.";
                          else confMsg = "Signal faible : le modèle est peu certain de la direction.";
                      } else if (conf < 60) {
                          confMsg = "Signal modéré.";
                      } else {
                          confMsg = "Signal relativement fort.";
                      }
                      return (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 10.5 }}>
                            <span style={{ color: C.muted }}>Marge</span>
                            <span style={{ fontFamily: "JetBrains Mono,monospace", color: C.text }}>+{stock.margin ?? 0} pts</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 10.5 }}>
                            <span style={{ color: C.muted }}>Niveau</span>
                            <span style={{ fontFamily: "JetBrains Mono,monospace", color: confColor }}>{confLevelText}</span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 9.5, color: C.muted, fontStyle: "italic" }}>
                            {confMsg}
                          </div>
                        </>
                      );
                    })()}
                    {forecast.risk && forecast.risk.take_profit != null && forecast.risk.take_profit !== 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10.5, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                          <span style={{ color: C.muted }}>TP / SL (RR: {forecast.risk.risk_reward})</span>
                          <span style={{ fontFamily: "JetBrains Mono,monospace", color: C.text }}>${f2(forecast.risk.take_profit)} / ${f2(forecast.risk.stop_loss)}</span>
                        </div>
                    )}
                    {forecast.probs && (
                        <div style={{ marginTop: 6, padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4, fontSize: 10 }}>
                          <div style={{ color: C.text, marginBottom: 4, fontWeight: 500 }}>Probabilités :</div>
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.muted }}>
                            <span>Baisse</span>
                            <span style={{ fontFamily: "JetBrains Mono,monospace" }}>{Math.round(forecast.probs.Baisse * 100)}%</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, marginTop: 2 }}>
                            <span>Hausse</span>
                            <span style={{ fontFamily: "JetBrains Mono,monospace" }}>{Math.round(forecast.probs.Hausse * 100)}%</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, marginTop: 2 }}>
                            <span>Stabilité</span>
                            <span style={{ fontFamily: "JetBrains Mono,monospace" }}>{Math.round((forecast.probs["Stabilité"] || forecast.probs.Stabilite || 0) * 100)}%</span>
                          </div>
                        </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Forecast chart */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>Évolution + Prévisions J+{forecastHorizon}</span>
                <div style={{ display: "flex", gap: 16, fontSize: 10.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted }}><span style={{ display: "inline-block", width: 16, height: 2, background: C.muted }} />Historique ({histWindow}J)</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted }}><span style={{ display: "inline-block", width: 16, height: 0, borderTop: "2px dashed rgba(255,255,255,0.4)" }} />Prévision</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted }}><span style={{ display: "inline-block", width: 14, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />IC 95%</span>
                </div>
              </div>
              <div style={{ padding: "12px 4px 8px" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 50, bottom: 10, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={{ stroke: C.border }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} tickCount={6} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`} />
                    <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 10, fontFamily: "JetBrains Mono,monospace" }} labelStyle={{ color: C.muted }} formatter={(v: number) => [`$${f2(v)}`]} />
                    {firstForecastDay && <ReferenceArea x={firstForecastDay} x2={`J+${forecastHorizon}`} fill="rgba(255,255,255,0.025)" />}
                    {firstForecastDay && <ReferenceLine x={firstForecastDay} stroke={C.border} strokeDasharray="4 4" label={{ value: "→ Prévision", position: "insideTopRight", fill: C.muted, fontSize: 9 }} />}
                    {selectedTickers.map(t => (
                      <Fragment key={t}>
                        <Area key={`${t}_band`} type="monotone" dataKey={`${t}_upper`} stroke="none" fill={STOCK_COLORS[t]} fillOpacity={0.07} legendType="none" tooltipType="none" />
                        <Area key={`${t}_band2`} type="monotone" dataKey={`${t}_lower`} stroke="none" fill={C.bg} fillOpacity={1} legendType="none" tooltipType="none" />
                        <Line key={`${t}_hist`} type="monotone" dataKey={t} stroke={STOCK_COLORS[t]} dot={false} strokeWidth={2} connectNulls name={`${t} hist.`} />
                        <Line key={`${t}_fc`} type="monotone" dataKey={`${t}_forecast`} stroke={STOCK_COLORS[t]} dot={{ fill: STOCK_COLORS[t], r: 3 }} strokeWidth={1.5} strokeDasharray="5 4" connectNulls name={`${t} prévis.`} />
                      </Fragment>
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Correlation matrix */}
            {showCorr && selectedTickers.length >= 2 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>Matrice de corrélation (Pearson, 90J)</span></div>
                <div style={{ padding: "20px 24px" }}><CorrelationMatrix tickers={selectedTickers} /></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── HISTORIQUE PAGE ──────────────────────────────────────────────────────────

function HistoriquePage({ isLoggedIn, favorites, onLogin }: { isLoggedIn: boolean; favorites: string[]; onLogin: () => void }) {
  const [tickerF, setTickerF] = useState<string | null>(null);
  const [resultF, setResultF] = useState<"Tous" | "Correct" | "Incorrect">("Tous");
  
  const [historyData, setHistoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    
    let url = "/history";
    const params = new URLSearchParams();
    if (tickerF) params.append("ticker", tickerF);
    if (resultF === "Correct") params.append("status", "correct");
    if (resultF === "Incorrect") params.append("status", "wrong");
    
    if (params.toString()) {
      url += "?" + params.toString();
    }
    
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<any>(url);
        if (res.status === "error") throw new Error(res.message || "Erreur de chargement");
        setHistoryData(res.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [isLoggedIn, tickerF, resultF]);

  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <PageHeader title="Historique des prédictions" sub="Traçabilité personnelle — prédictions passées sur vos actions" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 32px" }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: C.blueFaint, border: `1px solid ${C.blue}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><Clock size={28} style={{ color: C.blue }} /></div>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>Historique personnalisé</h2>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>Connectez-vous pour accéder à l'historique complet des prédictions générées pour vos actions suivies.</p>
            <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, margin: "0 0 28px" }}>Les prédictions sont enregistrées dès votre connexion et retracent l'évolution des signaux ML pour chaque action de votre portefeuille.</p>
            <button onClick={onLogin} style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><LogIn size={15} />Se connecter pour accéder</button>
          </div>
        </div>
      </div>
    );
  }

  const entries = historyData?.items || [];
  const correctRate = historyData ? Math.round(historyData.accuracy) : 0;
  
  // Format items grouped by day
  const groups = entries.reduce<Record<string, any[]>>((acc: any, e: any) => { 
    const date = new Date(e.prediction_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    (acc[date] = acc[date] || []).push(e); 
    return acc; 
  }, {});
  
  // Use unique tickers from the data or from the global stocks if data is empty but we want buttons
  const uniqueTickers = [...new Set(entries.map((e: any) => e.ticker))];
  const allAvailableTickers = STOCKS.map(s => s.ticker);
  const displayTickers = uniqueTickers.length > 0 ? uniqueTickers : allAvailableTickers.slice(0, 5);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Historique des prédictions" sub={`Vos actions suivies · ${historyData?.total || 0} prédiction${historyData?.total !== 1 ? "s" : ""} enregistrée${historyData?.total !== 1 ? "s" : ""}`}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: C.muted, fontSize: 10 }}>Taux de réussite</div>
              <div style={{ color: C.green, fontFamily: "JetBrains Mono,monospace", fontWeight: 700, fontSize: 18 }}>{correctRate}%</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 10, color: C.muted }}>{historyData?.correct || 0} correctes / {historyData?.total || 0}</div>
              <div style={{ height: 4, width: 80, borderRadius: 2, background: C.dim }}><div style={{ width: `${correctRate}%`, height: "100%", borderRadius: 2, background: C.green }} /></div>
            </div>
          </div>
        }
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Prédictions analysées", value: historyData?.total || 0, col: C.blue, sub: `${uniqueTickers.length} action${uniqueTickers.length !== 1 ? "s" : ""} suivie${uniqueTickers.length !== 1 ? "s" : ""}` },
            { label: "Signaux corrects", value: historyData?.correct || 0, col: C.green, sub: `Précision : ${correctRate}%` },
            { label: "Signaux manqués", value: historyData?.incorrect || 0, col: C.red, sub: `Erreur : ${100 - correctRate}%` },
          ].map(({ label, value, col, sub }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>{label}</div>
              <div style={{ color: col, fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 10.5, marginTop: 6 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {(["Tous", "Correct", "Incorrect"] as const).map(f => <button key={f} onClick={() => setResultF(f)} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 5, border: `1px solid ${resultF === f ? (f === "Correct" ? C.green : f === "Incorrect" ? C.red : C.blue) : C.border}`, background: resultF === f ? (f === "Correct" ? C.greenFaint : f === "Incorrect" ? C.redFaint : C.blueFaint) : "transparent", color: resultF === f ? (f === "Correct" ? C.green : f === "Incorrect" ? C.red : C.blue) : C.muted, cursor: "pointer" }}>{f}</button>)}
          <div style={{ width: 1, background: C.border }} />
          <button onClick={() => setTickerF(null)} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 5, border: `1px solid ${!tickerF ? C.blue : C.border}`, background: !tickerF ? C.blueFaint : "transparent", color: !tickerF ? C.blue : C.muted, cursor: "pointer" }}>Tous</button>
          {displayTickers.map(t => <button key={t} onClick={() => setTickerF(tickerF === t ? null : t)} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 5, border: `1px solid ${tickerF === t ? C.blue : C.border}`, background: tickerF === t ? C.blueFaint : "transparent", color: tickerF === t ? C.blue : C.muted, fontFamily: "JetBrains Mono,monospace", cursor: "pointer" }}>{t}</button>)}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
            <RefreshCw size={24} style={{ opacity: 0.5, marginBottom: 12, animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: 13 }}>Chargement de l'historique...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.red }}>
            <AlertTriangle size={32} style={{ opacity: 0.8, marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>{error}</div>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
            <Clock size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>{tickerF || resultF !== "Tous" ? "Aucune prédiction trouvée pour ce filtre." : "0 prédiction enregistrée"}</div>
          </div>
        ) : (
          Object.entries(groups).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em" }}>{date.toUpperCase()}</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 10.5, color: C.muted }}>{items.filter((e: any) => e.is_correct === true).length}/{items.length} correcte{items.filter((e: any) => e.is_correct === true).length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((e: any) => {
                  const ok = e.is_correct === true;
                  const isPending = e.is_correct === null;
                  const predLabel = e.prediction_label as Prediction;
                  const actualLabel = (e.actual_label || "Stabilité") as Prediction;
                  
                  return (
                    <div key={e.id} style={{ background: C.card, border: `1px solid ${isPending ? C.border : ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)"}`, borderRadius: 7, padding: "12px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: isPending ? C.dim : ok ? C.greenFaint : C.redFaint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isPending ? <Clock3 size={14} style={{ color: C.muted }} /> : ok ? <Check size={14} style={{ color: C.green }} /> : <X size={14} style={{ color: C.red }} />}
                      </div>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 14, minWidth: 44 }}>{e.ticker}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.muted, fontSize: 11 }}>Prédit :</span><Badge p={predLabel} /></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.muted, fontSize: 11 }}>Réel :</span>
                        {isPending ? <span style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>En attente</span> : <Badge p={actualLabel} />}
                      </div>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.text }}>{Math.round(e.confidence)}%</span>
                      <div style={{ marginLeft: "auto" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isPending ? C.muted : ok ? C.green : C.red }}>
                          {isPending ? "En cours (H=5)" : ok ? "✓ Correct" : "✗ Incorrect"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ─── STOCK DETAIL PAGE ────────────────────────────────────────────────────────

function StockDetailPage({ ticker, onBack, favorites, toggleFav, isLoggedIn, onRequireAuth }: {
  ticker: string; onBack: () => void; favorites: string[]; toggleFav: (t: string) => void;
  isLoggedIn: boolean; onRequireAuth: (ctx: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    setLoading(true);
    getStockDetailDynamic(ticker, '1y').then(res => {
      if(res && res.history) {
        setData(res);
      } else {
        setError("API indisponible");
      }
      setLoading(false);
    }).catch(() => {
      setError("API indisponible");
      setLoading(false);
    });
  }, [ticker]);

  if (loading) return <div style={{padding:40, color:C.text}}>Chargement des données...</div>;
  if (error || !data) return <div style={{padding:40, color:C.red}}>Erreur: Ticker introuvable ou API indisponible</div>;

  const stock = {
    ticker: data.ticker,
    name: data.company_name,
    sector: "Market",
    prediction: data.prediction.direction,
    confidence: data.prediction.confidence > 1 ? data.prediction.confidence : data.prediction.confidence * 100,
  };
  const sm = { 
    price: data.market.price, 
    chg1d: data.market.change_percent, 
    chg90d: 0,
    vol: data.history[data.history.length - 1].volume,
    h52: Math.max(...data.history.map((x:any) => x.high)),
    l52: Math.min(...data.history.map((x:any) => x.low)),
    rsi: data.history[data.history.length - 1].rsi,
    volatility: data.market.change_percent, // Approximation fallback if missing
    sma20: data.history[data.history.length - 1].sma20
  };
  
  // Format history for Recharts
  const chartData = data.history.map((row:any) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    sma20: row.sma20,
    sma50: row.sma50,
    bollingerUpper: row.bb_upper,
    bollingerLower: row.bb_lower,
    rsi: row.rsi,
    macd: row.macd,
    signal: row.macd_signal,
    histogram: row.macd_histogram
  }));
  const last = chartData[chartData.length - 1];

  const Icon = pi(stock.prediction);
  const isFav = favorites.includes(ticker) && isLoggedIn;
  
  // Real probabilities from API
  const probs = {
    Hausse: data.prediction.probabilities.Hausse > 1 ? data.prediction.probabilities.Hausse : data.prediction.probabilities.Hausse * 100,
    "Stabilit\u00e9": data.prediction.probabilities.Stabilite > 1 ? data.prediction.probabilities.Stabilite : data.prediction.probabilities.Stabilite * 100,
    Baisse: data.prediction.probabilities.Baisse > 1 ? data.prediction.probabilities.Baisse : data.prediction.probabilities.Baisse * 100
  };
return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted, fontSize: 12, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour</button>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: C.text, fontSize: 20, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>{ticker}</span>
            <span style={{ color: C.muted, fontSize: 13 }}>{stock.name}</span>
            <span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{stock.sector}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => { if (!isLoggedIn) { onRequireAuth("Connectez-vous pour ajouter des actions à vos favoris."); return; } toggleFav(ticker); }} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${isFav ? C.amber : C.border}`, background: isFav ? C.amberFaint : "transparent", color: isFav ? C.amber : C.muted, cursor: "pointer" }}><Star size={12} fill={isFav ? C.amber : "none"} />{isFav ? "Favori" : "Ajouter"}</button>
          <Badge p={stock.prediction} size="md" />
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.text, fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>${f2(sm.price)}</div>
            <div style={{ color: sm.chg1d >= 0 ? C.green : C.red, fontSize: 11, fontFamily: "JetBrains Mono,monospace", marginTop: 2 }}>{sm.chg1d >= 0 ? <ArrowUpRight size={11} style={{ display: "inline" }} /> : <ArrowDownRight size={11} style={{ display: "inline" }} />}{fPct(sm.chg1d)} aujourd'hui</div>
          </div>
        </div>
      </header>
      <div style={{ flex: 1, display: "flex" }}>
        <div style={{ flex: 1, padding: "20px 24px", minWidth: 0 }}>
          {[
            { title: "Chandelier · SMA · Bollinger", right: <div style={{ display: "flex", gap: 14, fontSize: 10.5, color: C.muted, fontFamily: "JetBrains Mono,monospace" }}><span>H52: <span style={{ color: C.text }}>${f2(sm.h52)}</span></span><span>L52: <span style={{ color: C.text }}>${f2(sm.l52)}</span></span><span>Vol: <span style={{ color: C.text }}>{(sm.vol / 1e6).toFixed(2)}M</span></span></div>, content: <CandleChart data={chartData} />, pad: "8px 4px 4px" },
            { title: "RSI (14)", right: <div style={{ display: "flex", gap: 14, fontSize: 10.5 }}><span style={{ color: C.green }}>Survente &lt;30</span><span style={{ fontFamily: "JetBrains Mono,monospace", color: last.rsi ? (last.rsi > 70 ? C.red : last.rsi < 30 ? C.green : C.text) : C.muted }}>{last.rsi?.toFixed(1) ?? "—"}</span><span style={{ color: C.red }}>Surachat &gt;70</span></div>, content: <RSIChart data={chartData} />, pad: "4px" },
            { title: "MACD (12, 26, 9)", right: <div style={{ display: "flex", gap: 10, fontSize: 10.5 }}>{[{ col: C.blue, label: "MACD" }, { col: C.orange, label: "Signal" }, { col: C.green, label: "Hist.+" }, { col: C.red, label: "Hist.−" }].map(({ col, label }) => <span key={label} style={{ color: col, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 10, height: 2, background: col, display: "inline-block" }} />{label}</span>)}</div>, content: <MACDChart data={chartData} />, pad: "4px" },
          ].map(({ title, right, content, pad }, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.text, fontSize: 11.5, fontWeight: 500 }}>{title}</span>{right}</div>
              <div style={{ padding: pad }}>{content}</div>
            </div>
          ))}
        </div>
        <aside style={{ width: 268, borderLeft: `1px solid ${C.border}`, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: pb(stock.prediction), border: `1px solid ${pc(stock.prediction)}33`, borderRadius: 8, padding: "18px 16px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 10 }}><Icon size={16} style={{ color: pc(stock.prediction) }} /><span style={{ color: pc(stock.prediction), fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Prédiction ML</span></div>
            <div style={{ color: pc(stock.prediction), fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{stock.prediction}</div>
            <div style={{ color: pc(stock.prediction), fontSize: 44, fontWeight: 800, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{stock.confidence}%</div>
            <div style={{ marginTop: 12, height: 5, borderRadius: 3, background: C.dim }}><div style={{ height: "100%", borderRadius: 3, width: `${stock.confidence}%`, background: pc(stock.prediction) }} /></div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
            <h3 style={{ color: C.text, fontSize: 11.5, fontWeight: 500, margin: "0 0 12px" }}>Probabilités</h3>
            {(["Hausse", "Stabilité", "Baisse"] as Prediction[]).map(lbl => { const val = Math.max(0, probs[lbl as keyof typeof probs]); return <div key={lbl} style={{ marginBottom: 9 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ color: C.muted, fontSize: 11 }}>{lbl}</span><span style={{ color: C.text, fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}>{val}%</span></div><div style={{ height: 5, borderRadius: 3, background: C.dim }}><div style={{ height: "100%", borderRadius: 3, width: `${val}%`, background: pc(lbl) }} /></div></div>; })}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
            <h3 style={{ color: C.text, fontSize: 11.5, fontWeight: 500, margin: "0 0 10px" }}>Indicateurs clés</h3>
            {[{ label: "RSI (14)", value: sm.rsi.toFixed(1), note: sm.rsi > 70 ? "Surachat" : sm.rsi < 30 ? "Survente" : "Neutre", noteCol: sm.rsi > 70 ? C.red : sm.rsi < 30 ? C.green : C.muted }, { label: "Var. 90J", value: fPct(sm.chg90d), note: "", noteCol: sm.chg90d >= 0 ? C.green : C.red }, { label: "Volatilité", value: `${sm.volatility.toFixed(1)}%`, note: "", noteCol: C.muted }, { label: "SMA 20", value: "$" + f2(last.sma20 ?? 0), note: last.close > (last.sma20 ?? 0) ? "Au-dessus" : "En-dessous", noteCol: last.close > (last.sma20 ?? 0) ? C.green : C.red }].map(({ label, value, note, noteCol }) => <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.muted, fontSize: 11 }}>{label}</span><div style={{ textAlign: "right" }}><span style={{ color: C.text, fontSize: 11, fontFamily: "JetBrains Mono,monospace", display: "block" }}>{value}</span>{note && <span style={{ color: noteCol, fontSize: 9.5 }}>{note}</span>}</div></div>)}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── COMPARISON PAGE — dynamic data from FastAPI ──────────────────────────────

const COMP_PERIODS: { label: string; value: number; param: string }[] = [
  { label: "7J",  value: 7,   param: "7d"  },
  { label: "30J", value: 30,  param: "30d" },
  { label: "60J", value: 60,  param: "60d" },
  { label: "90J", value: 90,  param: "90d" },
  { label: "6M",  value: 180, param: "6mo" },
  { label: "1A",  value: 365, param: "1y"  },
];

function ComparisonPage({ initialTickers = ["AAPL", "MSFT", "NVDA"] }: { initialTickers?: string[] }) {
  const maxStocks = 5;

  // ── state ──────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<string[]>(initialTickers.slice(0, maxStocks));
  const [periodIdx, setPeriodIdx] = useState(1); // default: 30J
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCorr, setShowCorr] = useState(false);
  const [apiData, setApiData] = useState<{
    chartData: { date: string; [ticker: string]: number | string | null }[];
    statistics: { ticker: string; totalReturn: number; volatility: number; sharpe: number; maxDrawdown: number; sessions: number }[];
    correlation: { tickerA: string; tickerB: string; value: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodParam = COMP_PERIODS[periodIdx].param;

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selected.length < 1) { setApiData(null); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/compare?tickers=${selected.join(",")}&period=${periodParam}&interval=1d`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((raw: { series: { ticker: string; data: { date: string; value: number }[] }[]; statistics: any[]; correlation: { tickerA: string; tickerB: string; value: number }[] }) => {
        // Build chart rows from backend dates (trading days only)
        const allDates = new Set<string>();
        raw.series.forEach(s => s.data.forEach(p => allDates.add(p.date)));
        const sortedDates = Array.from(allDates).sort();

        const seriesMap: Record<string, Record<string, number>> = {};
        raw.series.forEach(s => {
          seriesMap[s.ticker] = {};
          s.data.forEach(p => { seriesMap[s.ticker][p.date] = p.value; });
        });

        const chartData = sortedDates.map(date => {
          const row: { date: string; [k: string]: number | string | null } = { date };
          raw.series.forEach(s => {
            const v = seriesMap[s.ticker]?.[date];
            row[s.ticker] = typeof v === "number" ? v : null;
          });
          return row;
        });

        setApiData({ chartData, statistics: raw.statistics, correlation: raw.correlation });
      })
      .catch(err => { if (err.name !== "AbortError") setError(err.message ?? "Erreur réseau"); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selected.join(","), periodParam]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const getCorr = (a: string, b: string) => {
    if (!apiData) return a === b ? 1 : 0;
    if (a === b) return 1;
    const cell = apiData.correlation.find(c => (c.tickerA === a && c.tickerB === b) || (c.tickerA === b && c.tickerB === a));
    return cell ? cell.value : 0;
  };
  const tickColor = (t: string) => STOCK_COLORS[t] ?? "#64748b";
  const corrBg = (v: number) => v > 0 ? `rgba(16,185,129,${Math.abs(v) * 0.7})` : `rgba(239,68,68,${Math.abs(v) * 0.7})`;

  const xInterval = (apiData?.chartData.length ?? 0) <= 10 ? 0 : Math.ceil((apiData?.chartData.length ?? 1) / 8) - 1;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Comparaison d'actions"
        sub={`Performance normalisée base 0 — jusqu'à ${maxStocks} actions`}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Actions à comparer</div>
            <StockSelector selected={selected} onChange={v => setSelected(v.slice(0, maxStocks))} max={maxStocks} />
            {selected.length < 2 && <div style={{ color: C.red, fontSize: 10.5, marginTop: 5 }}>Sélectionnez au moins 2 actions.</div>}
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Période</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {COMP_PERIODS.map((p, i) => (
                <button key={p.label} onClick={() => setPeriodIdx(i)}
                  style={{ fontSize: 12, padding: "7px 14px", borderRadius: 5, cursor: "pointer", border: `1px solid ${i === periodIdx ? C.blue : C.border}`, background: i === periodIdx ? C.blueFaint : C.card, color: i === periodIdx ? C.blue : C.muted }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Options</div>
            <button onClick={() => setShowCorr(v => !v)}
              style={{ fontSize: 12, padding: "7px 14px", borderRadius: 5, cursor: "pointer", border: `1px solid ${showCorr ? C.purple : C.border}`, background: showCorr ? "rgba(168,85,247,0.12)" : C.card, color: showCorr ? C.purple : C.muted }}>
              Corrélation
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, marginBottom: 16, color: C.red, fontSize: 13 }}>
            <AlertTriangle size={16} /> Erreur : {error}
          </div>
        )}

        {selected.length >= 2 && (
          <>
            {/* Legend toggles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {selected.map(t => {
                const isH = hidden.has(t);
                return (
                  <button key={t} onClick={() => setHidden(h => { const n2 = new Set(h); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; })}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "5px 10px", borderRadius: 5, cursor: "pointer", border: `1px solid ${isH ? C.border : tickColor(t) + "66"}`, background: isH ? "transparent" : tickColor(t) + "18", color: isH ? C.dim : tickColor(t), opacity: isH ? 0.5 : 1 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: tickColor(t) }} />{t}
                  </button>
                );
              })}
            </div>

            {/* Chart */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, overflow: "hidden", position: "relative" }}>
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.text, fontSize: 11.5, fontWeight: 500 }}>Performance relative (base 0%)</span>
                <span style={{ color: C.muted, fontSize: 10.5 }}>{apiData?.chartData.length ?? 0} séances</span>
              </div>
              {loading && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(12,21,37,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                  <RefreshCw size={22} style={{ color: C.blue, animation: "spin 1s linear infinite" }} />
                </div>
              )}
              <div style={{ padding: "12px 4px 8px" }}>
                {!loading && apiData?.chartData.length === 0 && (
                  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
                    Aucune donnée disponible pour cette période.
                  </div>
                )}
                {(apiData?.chartData.length ?? 0) > 0 && (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={apiData!.chartData} margin={{ top: 5, right: 30, bottom: 5, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={{ stroke: C.border }} interval={xInterval} />
                      <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" strokeWidth={1} />
                      <Tooltip
                        contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 10, fontFamily: "JetBrains Mono,monospace" }}
                        labelStyle={{ color: C.muted }}
                        formatter={(v: number, name: string) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, name]}
                      />
                      {selected.filter(t => !hidden.has(t)).map(t => (
                        <Line key={t} type="monotone" dataKey={t} stroke={tickColor(t)} dot={false} strokeWidth={1.8} connectNulls={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Statistics cards */}
            {(apiData?.statistics.length ?? 0) > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selected.length, 5)}, 1fr)`, gap: 12, marginBottom: 16 }}>
                {apiData!.statistics.map(stat => (
                  <div key={stat.ticker} style={{ background: C.card, border: `1px solid ${tickColor(stat.ticker)}33`, borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: tickColor(stat.ticker) }} />
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>{stat.ticker}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: stat.totalReturn >= 0 ? C.green : C.red, fontFamily: "JetBrains Mono,monospace" }}>
                        {stat.totalReturn >= 0 ? "+" : ""}{stat.totalReturn.toFixed(2)}%
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: 11 }}>
                      <span style={{ color: C.muted }}>Volatilité</span>
                      <span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{stat.volatility.toFixed(1)}%</span>
                      <span style={{ color: C.muted }}>Sharpe</span>
                      <span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{stat.sharpe.toFixed(2)}</span>
                      <span style={{ color: C.muted }}>Max DD</span>
                      <span style={{ color: C.red, fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{stat.maxDrawdown.toFixed(2)}%</span>
                      <span style={{ color: C.muted }}>Séances</span>
                      <span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", textAlign: "right" }}>{stat.sessions}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Correlation matrix */}
            {showCorr && selected.length >= 2 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text, fontSize: 11.5, fontWeight: 500 }}>Matrice de corrélation (Pearson)</span>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", marginBottom: 4, paddingLeft: 60 }}>
                    {selected.map(t => <div key={t} style={{ width: 58, fontSize: 10, color: C.muted, textAlign: "center", fontFamily: "JetBrains Mono,monospace" }}>{t}</div>)}
                  </div>
                  {selected.map(a => (
                    <div key={a} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                      <div style={{ width: 56, fontSize: 10, color: C.muted, fontFamily: "JetBrains Mono,monospace", flexShrink: 0, paddingRight: 4, textAlign: "right" }}>{a}</div>
                      {selected.map(b => {
                        const corr = getCorr(a, b);
                        const bg = a === b ? "rgba(255,255,255,0.08)" : corrBg(corr);
                        return (
                          <div key={b} title={`${a}/${b}: ${corr.toFixed(3)}`}
                            style={{ width: 58, height: 40, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontFamily: "JetBrains Mono,monospace", color: Math.abs(corr) > 0.5 ? C.text : C.muted, borderRadius: 3, margin: "0 1px" }}>
                            {corr.toFixed(2)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}



// ─── SECTOR PAGE ──────────────────────────────────────────────────────────────

function SectorPage({ onCompare }: { onCompare: (tickers: string[]) => void }) {
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [sorted, setSorted] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<Set<string>>(new Set());
  const [sectorThresholds, setSectorThresholds] = useState<Record<string, number>>(Object.fromEntries(SECTORS.map(s => [s, 80])));
  const { stocks: allStocks, loading: mktLoading, refresh: mktRefresh } = useMarketData();
  const icons: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
    Technologie: Cpu, Finance: Building2, "Santé": Activity, Industrie: Database, "Services publics": Zap, "Crypto-monnaies": Coins,
  };
  const sectorStats = useMemo(() => SECTORS.map(sector => {
    const ss = allStocks.filter(s => s.sector === sector && !s.loading && !s.error);
    const avgPerf = ss.length ? ss.reduce((a, s) => a + s.chg90d, 0) / ss.length : 0;
    const hausseC = ss.filter(s => s.prediction === "Hausse").length;
    const baisseC = ss.filter(s => s.prediction === "Baisse").length;
    const stabC   = ss.filter(s => s.prediction === "Stabilité").length;
    const avgConf = ss.length ? ss.reduce((a, s) => a + s.confidence, 0) / ss.length : 0;
    // Sparkline: utiliser les 30 derniers prix relatifs (recentrés à 100)
    const sparkData = ss.length ? ss.map(s => s.price) : [];
    return { sector, ss, avgPerf, hausseC, baisseC, stabC, avgConf, count: ss.length, sparkData };
  }), [allStocks]);
  const chartData = useMemo(() => { const data = sectorStats.map(s => ({ name: s.sector, perf: Math.round(s.avgPerf * 10) / 10 })); return sorted ? [...data].sort((a, b) => b.perf - a.perf) : data; }, [sectorStats, sorted]);
  const hausseTotal = sectorStats.reduce((a, s) => a + s.hausseC, 0);
  const baisseTotal = sectorStats.reduce((a, s) => a + s.baisseC, 0);
  const stableTotal = sectorStats.reduce((a, s) => a + s.stabC, 0);
  const displayStats = sectorFilter ? sectorStats.filter(s => s.sector === sectorFilter) : sectorStats;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Analyse sectorielle" sub={`Classification GICS + Crypto — ${allStocks.length} valeurs`}
        right={<div style={{ display: "flex", gap: 8 }}>
          <ExportBtn onClick={() => exportCSV(sectorStats.map(s => ({ Secteur: s.sector, Actions: s.count, "Perf90J%": f2(s.avgPerf), Hausse: s.hausseC, Stabilité: s.stabC, Baisse: s.baisseC })), "secteurs.csv")} />
          <button onClick={mktRefresh} disabled={mktLoading} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", opacity: mktLoading ? 0.5 : 1 }}><RefreshCw size={12} />Actualiser</button>
        </div>}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 12 }}><span style={{ color: C.text, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>{allStocks.length}</span> actions suivies</span>
          <div style={{ width: 1, height: 14, background: C.border }} />
          {[{ p: "Hausse" as Prediction, Icon: TrendingUp, col: C.green, n: hausseTotal }, { p: "Stabilité" as Prediction, Icon: Minus, col: C.amber, n: stableTotal }, { p: "Baisse" as Prediction, Icon: TrendingDown, col: C.red, n: baisseTotal }].map(({ p, Icon, col, n }) => <span key={p} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon size={13} style={{ color: col }} /><span style={{ color: col, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>{mktLoading ? "…" : n}</span><span style={{ color: C.muted }}>{p.toLowerCase()}</span></span>)}
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 11 }}>Filtrer :</span>
          <button onClick={() => setSectorFilter(null)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer", border: `1px solid ${!sectorFilter ? C.blue : C.border}`, background: !sectorFilter ? C.blue : "transparent", color: !sectorFilter ? "white" : C.muted, fontWeight: !sectorFilter ? 500 : 400 }}>Tous{!sectorFilter && <X size={10} />}</button>
          {SECTORS.map(sector => {
            const isActive = sectorFilter === sector, stat = sectorStats.find(s => s.sector === sector)!, col = SECTOR_COLORS[sector] ?? C.blue;
            return <button key={sector} onClick={() => setSectorFilter(isActive ? null : sector)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer", border: `1px solid ${isActive ? col : C.border}`, background: isActive ? col : "transparent", color: isActive ? "white" : C.muted, fontWeight: isActive ? 500 : 400, transition: "all 0.15s" }}>{sector}<span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 10, opacity: 0.85 }}>{fPct(stat.avgPerf)}</span>{isActive && <X size={10} />}</button>;
          })}
        </div>
        {!sectorFilter && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>Performance par secteur (90J — données réelles)</span>
              <button onClick={() => setSorted(v => !v)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${sorted ? C.blue : C.border}`, background: sorted ? C.blueFaint : "transparent", color: sorted ? C.blue : C.muted, cursor: "pointer" }}><SortDesc size={12} />Trier</button>
            </div>
            <div style={{ padding: "16px 8px 16px 0" }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 80, left: 140, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill: C.muted, fontSize: 10, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={135} tick={{ fill: C.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <ReferenceLine x={0} stroke={C.border} strokeWidth={1} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Perf."]} contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11 }} labelStyle={{ color: C.text }} />
                  <Bar dataKey="perf" maxBarSize={22} radius={[0, 3, 3, 0]}>{chartData.map((d, i) => <Cell key={i} fill={d.perf >= 0 ? C.green : C.red} opacity={0.82} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {displayStats.map(({ sector, ss, avgPerf, hausseC, baisseC, stabC, avgConf, count, sparkData }) => {
            const SIcon = icons[sector] ?? Building2, col = SECTOR_COLORS[sector] ?? C.blue, perfColor = avgPerf >= 0 ? C.green : C.red, isAlertOpen = openAlerts.has(sector);
            return (
              <div key={sector} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ background: C.card, border: `1px solid ${sectorFilter === sector ? C.borderHi : C.border}`, borderRadius: isAlertOpen ? "8px 8px 0 0" : 8, padding: "18px 20px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 7, background: `${col}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><SIcon size={15} style={{ color: col }} /></div>
                      <div><div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{sector}</div><div style={{ color: C.muted, fontSize: 10.5, marginTop: 1 }}>{count} action{count > 1 ? "s" : ""}</div></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                      {sparkData.length > 1 && <Sparkline values={sparkData} color={perfColor} id={sector.replace(/ /g, "_")} width={56} height={28} />}
                      <div style={{ textAlign: "right" }}><div style={{ color: perfColor, fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{fPct(avgPerf)}</div><div style={{ color: C.muted, fontSize: 9.5, marginTop: 2 }}>90J</div></div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
                      {hausseC > 0 && <span style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 4, color: C.green, background: C.greenFaint, display: "flex", alignItems: "center", gap: 3 }}><TrendingUp size={10} />{hausseC}</span>}
                      {stabC > 0 && <span style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 4, color: C.amber, background: C.amberFaint, display: "flex", alignItems: "center", gap: 3 }}><Minus size={10} />{stabC}</span>}
                      {baisseC > 0 && <span style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 4, color: C.red, background: C.redFaint, display: "flex", alignItems: "center", gap: 3 }}><TrendingDown size={10} />{baisseC}</span>}
                    </div>
                    <div style={{ height: 5, borderRadius: 3, display: "flex", overflow: "hidden", gap: 1 }}>
                      {hausseC > 0 && <div style={{ flex: hausseC, background: C.green, opacity: 0.8 }} />}
                      {stabC > 0 && <div style={{ flex: stabC, background: C.amber, opacity: 0.8 }} />}
                      {baisseC > 0 && <div style={{ flex: baisseC, background: C.red, opacity: 0.8 }} />}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 10.5 }}><span style={{ color: C.muted }}>Conf. moy.</span><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace" }}>{avgConf.toFixed(0)}%</span></div>
                  <div style={{ marginBottom: 12 }}>{ss.map(s => <div key={s.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}` }}><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", fontSize: 12, fontWeight: 600 }}>{s.ticker}</span><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: s.chg90d >= 0 ? C.green : C.red, fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}>{fPct(s.chg90d)}</span><Badge p={s.prediction} /></div></div>)}</div>
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", gap: 6 }}>
                    <button onClick={() => onCompare(ss.map(s => s.ticker))} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 10.5, padding: "6px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.blue; (e.currentTarget as HTMLButtonElement).style.color = C.blue; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}><GitCompare size={11} />Comparer</button>
                    <button onClick={() => setOpenAlerts(prev => { const next = new Set(prev); next.has(sector) ? next.delete(sector) : next.add(sector); return next; })} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, padding: "6px 10px", borderRadius: 5, border: `1px solid ${isAlertOpen ? C.amber : C.border}`, background: isAlertOpen ? C.amberFaint : "transparent", color: isAlertOpen ? C.amber : C.muted, cursor: "pointer" }}><Bell size={11} />Alerte</button>
                  </div>
                </div>
                {isAlertOpen && (
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: "14px 20px" }}>
                    <div style={{ fontSize: 11, color: C.amber, fontWeight: 500, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Bell size={11} />Alerte — {sector}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.dim, cursor: "pointer" }} onClick={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(), v = Math.round(((e.clientX - rect.left) / rect.width) * 50 + 50); setSectorThresholds(t => ({ ...t, [sector]: v })); }}><div style={{ width: `${(sectorThresholds[sector] - 50) * 2}%`, height: "100%", borderRadius: 2, background: C.amber }} /></div>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.amber, minWidth: 32 }}>{sectorThresholds[sector]}%</span>
                    </div>
                    <button onClick={() => setOpenAlerts(prev => { const next = new Set(prev); next.delete(sector); return next; })} style={{ fontSize: 11, padding: "6px 14px", borderRadius: 5, border: "none", background: C.amber, color: "white", cursor: "pointer", fontWeight: 600, width: "100%" }}>Créer l'alerte</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [activeNav, setActiveNav] = useState("dashboard");
  const [ticker, setTicker] = useState("AAPL");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compTickers, setCompTickers] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);

  const { user, isAuthenticated, logout, isLoading } = useAuth();

  // Auth state
  const isLoggedIn = isAuthenticated;
  const userName = user?.first_name || user?.username || "Alpha Analyst";
  
  const [authView, setAuthView] = useState<AuthView>(null);
  const [authModalCtx, setAuthModalCtx] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Premium modal
  


  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    favoritesApi.getFavorites().then(favs => {
      setFavorites(favs);
    });
  }, [user]);

  const toggleFav = useCallback(async (t: string) => {
    if (!user) return; // Should show auth modal if handled elsewhere
    
    // Optimistic UI update
    setFavorites(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    
    // API Call
    const res = await favoritesApi.toggleFavorite(t);
    if (!res) {
      favoritesApi.getFavorites().then(favs => setFavorites(favs));
    }
  }, [user]);

  const handleDeleteAlert = useCallback((id: number) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleLogin = (name: string) => {
    setAuthView(null);
    setAuthModalCtx(null);
    setActiveAlerts([...ALERTS_DATA]);
  };

  const handleLogout = () => {
    logout();
    setFavorites([]);
    setBannerDismissed(false);
    setAuthView(null);
    setNotifOpen(false);
  };

  
  const handleRequireAuth = (ctx: string) => {
    if (isLoggedIn) return;
    setAuthModalCtx(ctx);
  };
  

  const navigate = (id: string) => {
    setActiveNav(id);
    const map: Record<string, Page> = { dashboard: "dashboard", actions: "actions", comparison: "comparison", predictions: "predictions", sectors: "sectors", historique: "historique", premium: "premium", favorites: "favorites" };
    setPage(map[id] ?? "dashboard");
    setNotifOpen(false);
  };

  const handleStock = (t: string) => { setTicker(t); setPage("detail"); setActiveNav("actions"); };
  const handleBack = () => { setPage(["actions", "predictions", "sectors", "historique"].includes(activeNav) ? activeNav as Page : "dashboard"); };
  const handleCompare = (tickers: string[]) => { setCompTickers(tickers.slice(0, 5)); setPage("comparison"); setActiveNav("comparison"); };

  useEffect(() => {
    
    
  }, [isLoggedIn, isLoading]);

  useEffect(() => {
    if (window.location.pathname === "/reset-password") {
      setAuthView("reset-password");
    }
  }, []);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <RefreshCw size={24} style={{ opacity: 0.5, color: C.muted, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (authView === "login") return <LoginPage onLogin={handleLogin} onGoSignup={() => setAuthView("signup")} onContinueAsGuest={() => setAuthView(null)} onForgotPassword={() => setAuthView("forgot-password")} />;
  if (authView === "signup") return <SignupPage onSignup={handleLogin} onGoLogin={() => setAuthView("login")} onContinueAsGuest={() => setAuthView(null)} />;
  if (authView === "forgot-password") return <ForgotPasswordPage onGoLogin={() => setAuthView("login")} onContinueAsGuest={() => setAuthView(null)} />;
  if (authView === "reset-password") return <ResetPasswordPage onGoLogin={() => setAuthView("login")} onContinueAsGuest={() => setAuthView(null)} />;

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Inter,sans-serif" }}>
      <Sidebar active={activeNav} onNav={navigate} isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setAuthView("login")} onSignup={() => setAuthView("signup")} onLogout={handleLogout} />

      <main style={{ flex: 1, overflowY: "auto", minWidth: 0, position: "relative" }}>
        {/* Dev plan toggle */}
        {isLoggedIn && (
          <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 100, display: "flex", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11 }}>
            <span style={{ color: C.muted }}>Plan démo :</span>

          </div>
        )}

        {page === "dashboard" && <DashboardPage onStock={handleStock} favorites={favorites} toggleFav={toggleFav} isLoggedIn={isLoggedIn} onRequireAuth={handleRequireAuth} onLogin={() => setAuthView("login")} bannerDismissed={bannerDismissed} onBannerDismiss={() => setBannerDismissed(true)} />}
        {page === "actions" && <ActionsPage onStock={handleStock} />}
        {page === "predictions" && <PredictionsPage onStock={handleStock} />}
        {page === "historique" && <HistoriquePage isLoggedIn={isLoggedIn} favorites={favorites} onLogin={() => setAuthView("login")} />}
        {page === "favorites" && <FavoritesPage onStock={handleStock} favorites={favorites} toggleFav={toggleFav} isLoggedIn={isLoggedIn} onRequireAuth={handleRequireAuth} />}
        {page === "detail" && <StockDetailPage ticker={ticker} onBack={handleBack} favorites={favorites} toggleFav={toggleFav} isLoggedIn={isLoggedIn} onRequireAuth={handleRequireAuth} />}
        {page === "comparison" && <ComparisonPage key={compTickers.join(",")} initialTickers={compTickers} />}
        {page === "sectors" && <SectorPage onCompare={handleCompare} />}

      </main>



      {/* Modals */}
      {authModalCtx && <AuthRequiredModal context={authModalCtx} onLogin={() => { setAuthModalCtx(null); setAuthView("login"); }} onSignup={() => { setAuthModalCtx(null); setAuthView("signup"); }} onClose={() => setAuthModalCtx(null)} />}
      
    </div>
  );
}
