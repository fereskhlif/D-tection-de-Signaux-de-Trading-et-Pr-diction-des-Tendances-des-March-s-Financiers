import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Cell, BarChart, Bar, Area, AreaChart,
} from "recharts";
import {
  LayoutDashboard, TrendingUp, TrendingDown, Minus, BarChart2, Clock,
  Settings, Activity, RefreshCw, Search, Bell, Target, Building2,
  Database, ChevronRight, ArrowUpRight, ArrowDownRight, Cpu, Zap,
  Layers, Star, Download, ChevronDown, X, AlertTriangle, Check,
  GitCompare, SortDesc, Eye, EyeOff, LogIn, UserPlus, LogOut, User, Shield,
  Crown, Lock, Sparkles, Coins, Trash2,
} from "lucide-react";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Prediction = "Hausse" | "Stabilité" | "Baisse";
type Page = "dashboard" | "detail" | "sectors" | "comparison" | "actions" | "predictions" | "historique" | "premium" | "settings";
type AuthView = "login" | "signup" | null;
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
  const rand = prng(seed);
  const raw: { o: number; h: number; l: number; c: number; v: number; date: string }[] = [];
  const cs: number[] = [];
  let price = initialPrice;
  for (let i = 0; i < days; i++) {
    const drift = (rand() - 0.49) * 0.03, o = price, c = Math.max(o * (1 + drift), 1);
    const wh = rand() * 0.013, wl = rand() * 0.013;
    raw.push({ o, h: Math.max(o, c) * (1 + wh), l: Math.min(o, c) * (1 - wl), c, v: Math.floor(500000 + rand() * 9e6), date: new Date(2024, 2, 1 + i).toLocaleDateString("fr-FR", { month: "short", day: "numeric" }) });
    cs.push(c); price = c;
  }
  const s20 = cs.map((_, i) => i < 19 ? null : cs.slice(i - 19, i + 1).reduce((a, b) => a + b) / 20);
  const s50 = cs.map((_, i) => i < 49 ? null : cs.slice(i - 49, i + 1).reduce((a, b) => a + b) / 50);
  const bu = s20.map((m, i) => { if (!m) return null; const sl = cs.slice(i - 19, i + 1), sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / 20); return m + 2 * sd; });
  const bl = s20.map((m, i) => { if (!m) return null; const sl = cs.slice(i - 19, i + 1), sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / 20); return m - 2 * sd; });
  const rsiArr = cs.map((_, i) => { if (i < 14) return null; const ch = cs.slice(i - 13, i + 1).map((c, j, a) => j === 0 ? 0 : c - a[j - 1]); const ag = ch.filter(x => x > 0).reduce((a, b) => a + b, 0) / 14, al = ch.filter(x => x < 0).reduce((a, b) => a - b, 0) / 14; return al === 0 ? 100 : 100 - 100 / (1 + ag / al); });
  const ema12 = emaFn(cs, 12), ema26 = emaFn(cs, 26), ml = ema12.map((v, i) => v - ema26[i]), sl = emaFn(ml.slice(25), 9);
  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  return raw.map((d, i) => { const si = i >= 25 ? i - 25 : -1, macd = ml[i], signal = si >= 0 ? sl[si] : null; return { date: d.date, open: r(d.o), close: r(d.c), high: r(d.h), low: r(d.l), volume: d.v, sma20: s20[i] !== null ? r(s20[i]!) : null, sma50: s50[i] !== null ? r(s50[i]!) : null, bollingerUpper: bu[i] !== null ? r(bu[i]!) : null, bollingerLower: bl[i] !== null ? r(bl[i]!) : null, rsi: rsiArr[i] !== null ? r(rsiArr[i]!, 1) : null, macd: r(macd, 3), signal: signal !== null ? r(signal, 3) : null, histogram: signal !== null ? r(macd - signal, 3) : null }; });
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
const FREE_STOCK_LIMIT = 5;
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

const MODEL_ACCURACY = [
  { week: "S1", accuracy: 79.2 }, { week: "S2", accuracy: 81.5 }, { week: "S3", accuracy: 80.8 },
  { week: "S4", accuracy: 83.1 }, { week: "S5", accuracy: 82.4 }, { week: "S6", accuracy: 84.7 },
  { week: "S7", accuracy: 83.9 }, { week: "S8", accuracy: 82.6 }, { week: "S9", accuracy: 85.2 },
  { week: "S10", accuracy: 83.8 }, { week: "S11", accuracy: 84.1 }, { week: "S12", accuracy: 82.4 },
];
const ALERTS_DATA = [
  { id: 1, ticker: "AAPL", from: "Stabilité" as Prediction, to: "Hausse" as Prediction, ago: "2h", conf: 84 },
  { id: 2, ticker: "GS", from: "Stabilité" as Prediction, to: "Baisse" as Prediction, ago: "5h", conf: 71 },
  { id: 3, ticker: "NEE", from: "Hausse" as Prediction, to: "Baisse" as Prediction, ago: "1j", conf: 65 },
  { id: 4, ticker: "NVO", from: "Hausse" as Prediction, to: "Hausse" as Prediction, ago: "1j", conf: 88 },
  { id: 5, ticker: "CAT", from: "Stabilité" as Prediction, to: "Baisse" as Prediction, ago: "2j", conf: 69 },
  { id: 6, ticker: "MSFT", from: "Stabilité" as Prediction, to: "Hausse" as Prediction, ago: "3j", conf: 79 },
  { id: 7, ticker: "BTC", from: "Baisse" as Prediction, to: "Hausse" as Prediction, ago: "3j", conf: 78 },
  { id: 8, ticker: "ETH", from: "Stabilité" as Prediction, to: "Hausse" as Prediction, ago: "4j", conf: 71 },
];
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
  const d = ALL[ticker], last = d[d.length - 1], prev = d[d.length - 2], first = d[0];
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
  return ss.map(s => { const d = ALL[s.ticker].slice(-days); return ((d[d.length - 1].close - d[0].close) / d[0].close) * 100; }).reduce((a, b) => a + b) / ss.length;
}
function sectorSparkData(ss: StockDef[], period = 30): number[] {
  return Array.from({ length: period }, (_, i) => {
    const idx = 90 - period + i;
    return ss.reduce((acc, s) => acc + ALL[s.ticker][Math.min(idx, ALL[s.ticker].length - 1)].close, 0) / ss.length;
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

function ExportBtn({ onClick, isPremium, onRequirePremium }: { onClick: () => void; isPremium?: boolean; onRequirePremium?: () => void }) {
  if (isPremium === false && onRequirePremium) {
    return (
      <button onClick={onRequirePremium} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", opacity: 0.6 }}>
        <Lock size={11} /><Download size={12} />CSV
      </button>
    );
  }
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

function PlanBadge({ plan }: { plan: Plan }) {
  if (plan === "visitor") return null;
  if (plan === "premium") {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: C.amber, color: "#1a0f00", letterSpacing: "0.04em" }}><Crown size={9} />PREMIUM</span>;
  }
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: C.muted, letterSpacing: "0.04em" }}>GRATUIT</span>;
}

function LockedOverlay({ onUnlock, label = "Fonctionnalité Premium" }: { onUnlock: () => void; label?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(7,12,24,0.72)", backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 5, borderRadius: "inherit" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: C.amberFaint, border: `1px solid ${C.amber}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={20} style={{ color: C.amber }} />
      </div>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <button onClick={onUnlock} style={{ fontSize: 12, padding: "7px 18px", borderRadius: 6, border: `1px solid ${C.amber}`, background: C.amberFaint, color: C.amber, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <Crown size={13} />Débloquer avec Premium
      </button>
    </div>
  );
}

// ─── NOTIFICATION PANEL ───────────────────────────────────────────────────────

function NotificationPanel({ alerts, onDeleteAlert, onClose }: {
  alerts: typeof ALERTS_DATA;
  onDeleteAlert: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 380, background: C.panel, borderLeft: `1px solid ${C.border}`, zIndex: 500, display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.5)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={16} style={{ color: C.blue }} />
          <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>Notifications</span>
          {alerts.length > 0 && <span style={{ background: C.red, color: "white", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10 }}>{alerts.length}</span>}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex", borderRadius: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Alerts list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {alerts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, opacity: 0.5 }}>
            <Bell size={32} style={{ color: C.muted }} />
            <span style={{ color: C.muted, fontSize: 13 }}>Aucune notification</span>
          </div>
        ) : (
          alerts.map(alert => {
            const isDown = alert.to === "Baisse";
            return (
              <div key={alert.id} style={{ background: C.card, border: `1px solid ${isDown ? C.red + "33" : C.green + "33"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: pb(alert.to), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isDown ? <TrendingDown size={15} style={{ color: C.red }} /> : <TrendingUp size={15} style={{ color: C.green }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>{alert.ticker}</span>
                    <Badge p={alert.from} /><span style={{ color: C.muted, fontSize: 10 }}>→</span><Badge p={alert.to} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.muted, fontSize: 11 }}>Conf. <span style={{ color: pc(alert.to), fontFamily: "JetBrains Mono,monospace" }}>{alert.conf}%</span></span>
                    <span style={{ color: C.dim, fontSize: 10 }}>•</span>
                    <span style={{ color: C.muted, fontSize: 11 }}>Il y a {alert.ago}</span>
                  </div>
                </div>
                <button onClick={() => onDeleteAlert(alert.id)} title="Supprimer" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, padding: "2px", display: "flex", flexShrink: 0, borderRadius: 4 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = C.red)}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = C.dim)}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => alerts.forEach(a => onDeleteAlert(a.id))} style={{ width: "100%", padding: "8px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 12, cursor: "pointer" }}>
            Tout marquer comme lu
          </button>
        </div>
      )}
    </div>
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

function PremiumModal({ context, benefit, onViewOffers, onClose }: { context: string; benefit: string; onViewOffers: () => void; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
      <div style={{ background: C.card, border: `1px solid ${C.amber}44`, borderRadius: 16, width: 480, padding: "36px 40px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}><X size={16} /></button>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.amberFaint, border: `1px solid ${C.amber}55`, display: "flex", alignItems: "center", justifyContent: "center" }}><Crown size={26} style={{ color: C.amber }} /></div>
        </div>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: "0 0 8px", textAlign: "center" }}>{context}</h2>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, margin: "0 0 28px", textAlign: "center" }}>{benefit}</p>
        <div style={{ background: C.panel, borderRadius: 10, padding: "14px 18px", marginBottom: 24 }}>
          {["Toutes les actions sans limite", "Comparaison jusqu'à 5 actions", "Export CSV & PDF illimité", "Alertes illimitées en temps réel", "Historique complet + Backtesting", "Explicabilité du modèle (XAI)"].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: i < 5 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: C.amberFaint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={10} style={{ color: C.amber }} /></div>
              <span style={{ color: C.text, fontSize: 12.5 }}>{f}</span>
            </div>
          ))}
        </div>
        <button onClick={onViewOffers} style={{ width: "100%", padding: "13px 0", borderRadius: 9, border: "none", background: C.amber, color: "#1a0f00", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Sparkles size={16} />Voir les offres Premium</button>
        <div style={{ textAlign: "center" }}><button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>Continuer sans Premium</button></div>
      </div>
    </div>
  );
}

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

function LoginPage({ onLogin, onGoSignup, onContinueAsGuest }: { onLogin: (name: string) => void; onGoSignup: () => void; onContinueAsGuest: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [showPw, setShowPw] = useState(false), [error, setError] = useState("");
  const handleSubmit = () => {
    if (!email || !password) { setError("Veuillez remplir tous les champs."); return; }
    if (password.length < 6) { setError("Mot de passe incorrect."); return; }
    onLogin(email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, l => l.toUpperCase()));
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} color="white" /></div>
          <div><div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5 }}>Predict Engine v3.2</div></div>
        </div>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Connexion</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px" }}>Accédez à votre espace personnel AlphaML</p>
        <AuthField label="Adresse email" type="email" value={email} onChange={setEmail} placeholder="analyst@alphamo.io" />
        <AuthField label="Mot de passe" type={showPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="••••••••" right={<button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{error}</div>}
        <button onClick={handleSubmit} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><LogIn size={15} />Se connecter</button>
        <div style={{ textAlign: "center", marginBottom: 20 }}><button style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>Mot de passe oublié ?</button></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><div style={{ flex: 1, height: 1, background: C.border }} /><span style={{ color: C.muted, fontSize: 11 }}>ou</span><div style={{ flex: 1, height: 1, background: C.border }} /></div>
        <button style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continuer avec Google
        </button>
        <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Pas encore de compte ? <button onClick={onGoSignup} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Créer un compte</button></div>
      </div>
    </div>
  );
}

// ─── SIGNUP PAGE ──────────────────────────────────────────────────────────────

function SignupPage({ onSignup, onGoLogin, onContinueAsGuest }: { onSignup: (name: string) => void; onGoLogin: () => void; onContinueAsGuest: () => void }) {
  const [fullName, setFullName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [showPw, setShowPw] = useState(false), [agreed, setAgreed] = useState(false), [error, setError] = useState("");
  const handleSubmit = () => {
    if (!fullName || !email || !password || !confirm) { setError("Veuillez remplir tous les champs."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (!agreed) { setError("Veuillez accepter les conditions d'utilisation."); return; }
    onSignup(fullName);
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", padding: "40px 0" }}>
      <button onClick={onContinueAsGuest} style={{ position: "fixed", top: 24, left: 28, display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />Retour à l'accueil</button>
      <div style={{ width: 420, background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 16, padding: "40px 40px 36px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={18} color="white" /></div>
          <div><div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5 }}>Predict Engine v3.2</div></div>
        </div>
        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Créer un compte</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 28px" }}>Rejoignez AlphaML et suivez vos actions</p>
        <AuthField label="Nom complet" type="text" value={fullName} onChange={setFullName} placeholder="Jean Dupont" />
        <AuthField label="Adresse email" type="email" value={email} onChange={setEmail} placeholder="jean@alphamo.io" />
        <div style={{ marginBottom: 6 }}><label style={{ display: "block", color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Rôle</label><div style={{ padding: "10px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 14 }}>Analyste <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>(par défaut)</span></div></div>
        <div style={{ marginBottom: 16, fontSize: 10.5, color: C.muted, padding: "6px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>L'accès Administrateur est attribué par votre organisation.</div>
        <AuthField label="Mot de passe" type={showPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="Minimum 8 caractères" right={<button onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
        <AuthField label="Confirmer le mot de passe" type={showPw ? "text" : "password"} value={confirm} onChange={setConfirm} placeholder="Répétez le mot de passe" />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }} onClick={() => setAgreed(v => !v)}>
          <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${agreed ? C.blue : C.border}`, background: agreed ? C.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{agreed && <Check size={10} color="white" />}</div>
          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>J'accepte les <span style={{ color: C.blue }}>conditions d'utilisation</span> et la <span style={{ color: C.blue }}>politique de confidentialité</span></span>
        </div>
        {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 14, padding: "8px 12px", background: C.redFaint, borderRadius: 6 }}>{error}</div>}
        <button onClick={handleSubmit} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><UserPlus size={15} />Créer mon compte</button>
        <div style={{ textAlign: "center", fontSize: 13, color: C.muted }}>Déjà un compte ? <button onClick={onGoLogin} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Se connecter</button></div>
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

function PremiumPage({ onUpgrade, plan }: { onUpgrade: () => void; plan: Plan }) {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const FEATURES = [
    { label: "Actions suivies", free: "5 actions", premium: "Toutes les actions" },
    { label: "Comparaison simultanée", free: "2 actions max", premium: "5 actions max" },
    { label: "Export CSV / PDF", free: false, premium: true },
    { label: "Alertes de prédiction", free: "1 alerte", premium: "Illimitées" },
    { label: "Historique des prédictions", free: "30 derniers jours", premium: "Complet (6 mois+)" },
    { label: "Backtesting", free: false, premium: true },
    { label: "Explicabilité du modèle (XAI)", free: false, premium: true },
    { label: "Support prioritaire", free: false, premium: true },
  ];
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const FAQ = [
    { q: "Puis-je annuler à tout moment ?", a: "Oui, vous pouvez annuler votre abonnement à tout moment depuis vos paramètres. Votre accès Premium reste actif jusqu'à la fin de la période en cours." },
    { q: "Quelle est la différence entre mensuel et annuel ?", a: "L'abonnement annuel vous offre 2 mois offerts par rapport à l'abonnement mensuel, soit une économie de 38€ sur l'année." },
    { q: "Mes données sont-elles sécurisées ?", a: "Toutes vos données sont chiffrées et stockées de manière sécurisée. Nous ne partageons jamais vos informations avec des tiers." },
  ];
  const monthlyPrice = billing === "annual" ? 15.83 : 19;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
        <div><h1 style={{ color: C.text, fontSize: 17, fontWeight: 600, margin: 0 }}>Passer Premium</h1><p style={{ color: C.muted, fontSize: 11, margin: "3px 0 0" }}>Débloquez tout le potentiel d'AlphaML</p></div>
        {plan === "premium" && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.amber }}><Crown size={15} />Vous êtes déjà Premium</div>}
      </header>
      <div style={{ flex: 1, padding: "40px 32px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 20, background: C.amberFaint, border: `1px solid ${C.amber}44`, color: C.amber, fontSize: 12, fontWeight: 600, marginBottom: 16 }}><Crown size={13} />AlphaML Premium</div>
          <h2 style={{ color: C.text, fontSize: 32, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.2 }}>Débloquez tout le potentiel d'AlphaML</h2>
          <p style={{ color: C.muted, fontSize: 15, margin: "0 0 28px", lineHeight: 1.6 }}>Analyses avancées, export illimité, backtesting et IA explicable pour vos décisions d'investissement.</p>
          <div style={{ display: "inline-flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3, gap: 2 }}>
            {(["monthly", "annual"] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding: "7px 20px", borderRadius: 6, border: "none", background: billing === b ? C.panel : "transparent", color: billing === b ? C.text : C.muted, fontSize: 13, fontWeight: billing === b ? 500 : 400, cursor: "pointer", position: "relative" }}>
                {b === "monthly" ? "Mensuel" : "Annuel"}{b === "annual" && <span style={{ position: "absolute", top: -8, right: -2, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: C.green, color: "white" }}>−17%</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 40 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 28px 24px" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>GRATUIT</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={{ color: C.text, fontSize: 36, fontWeight: 800, fontFamily: "JetBrains Mono,monospace" }}>0€</span><span style={{ color: C.muted, fontSize: 13 }}>/mois</span></div>
            </div>
            <button style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, fontWeight: 600, cursor: "default", marginBottom: 20 }}>{plan === "free" ? "Plan actuel" : "Plan de base"}</button>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["5 actions suivies", "2 actions en comparaison", "1 alerte configurée", "Historique 30 jours"].map(f => <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.muted }}><Check size={13} style={{ color: C.muted }} />{f}</div>)}
              {["Export de données", "Backtesting", "Explicabilité XAI"].map(f => <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.dim, textDecoration: "line-through" }}><X size={13} style={{ color: C.dim }} />{f}</div>)}
            </div>
          </div>
          <div style={{ background: C.card, border: `2px solid ${C.amber}`, borderRadius: 14, padding: "28px 28px 24px", position: "relative", boxShadow: `0 0 40px ${C.amber}14` }}>
            <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: C.amber, color: "#1a0f00", fontSize: 10, fontWeight: 800, padding: "3px 14px", borderRadius: 20, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>✦ RECOMMANDÉ</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.amber, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>PREMIUM</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={{ color: C.text, fontSize: 36, fontWeight: 800, fontFamily: "JetBrains Mono,monospace" }}>{monthlyPrice.toFixed(2).replace(".", ",")}€</span><span style={{ color: C.muted, fontSize: 13 }}>/mois</span></div>
              {billing === "annual" && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Facturé 190€/an — 2 mois offerts</div>}
            </div>
            {plan !== "premium" ? (
              <button onClick={onUpgrade} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: C.amber, color: "#1a0f00", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Crown size={15} />Passer Premium maintenant</button>
            ) : (
              <button style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: `1px solid ${C.amber}`, background: C.amberFaint, color: C.amber, fontSize: 14, fontWeight: 700, cursor: "default", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Crown size={15} />Plan actuel ✓</button>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["Toutes les actions", "Comparaison jusqu'à 5 actions", "Alertes illimitées", "Historique complet", "Export CSV & PDF"].map(f => <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.text }}><Check size={13} style={{ color: C.amber }} />{f}</div>)}
              {["Backtesting intégré", "Explicabilité XAI", "Support prioritaire"].map(f => <div key={f} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.text }}><Sparkles size={13} style={{ color: C.amber }} />{f}</div>)}
            </div>
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 40 }}>
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Comparatif des fonctionnalités</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}><th style={{ textAlign: "left", padding: "10px 22px", color: C.muted, fontWeight: 500, fontSize: 11 }}>FONCTIONNALITÉ</th><th style={{ textAlign: "center", padding: "10px 16px", color: C.muted, fontWeight: 500, fontSize: 11, width: 160 }}>GRATUIT</th><th style={{ textAlign: "center", padding: "10px 16px", color: C.amber, fontWeight: 600, fontSize: 11, width: 160 }}>PREMIUM</th></tr></thead>
            <tbody>{FEATURES.map(({ label, free, premium }, i) => (
              <tr key={label} style={{ borderBottom: i < FEATURES.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <td style={{ padding: "11px 22px", color: C.text }}>{label}</td>
                <td style={{ padding: "11px 16px", textAlign: "center" }}>{typeof free === "boolean" ? (free ? <Check size={15} style={{ color: C.green, display: "block", margin: "0 auto" }} /> : <X size={15} style={{ color: C.dim, display: "block", margin: "0 auto" }} />) : <span style={{ color: C.muted, fontSize: 12 }}>{free}</span>}</td>
                <td style={{ padding: "11px 16px", textAlign: "center" }}>{typeof premium === "boolean" ? (premium ? <Check size={15} style={{ color: C.amber, display: "block", margin: "0 auto" }} /> : <X size={15} style={{ color: C.dim, display: "block", margin: "0 auto" }} />) : <span style={{ color: C.amber, fontSize: 12, fontWeight: 500 }}>{premium}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {plan !== "premium" && (
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <button onClick={onUpgrade} style={{ padding: "14px 48px", borderRadius: 10, border: "none", background: C.amber, color: "#1a0f00", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}><Crown size={17} />Passer Premium — {monthlyPrice.toFixed(2).replace(".", ",")}€/mois</button>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>Annulation à tout moment · Paiement sécurisé</div>
          </div>
        )}
        <div>
          <h3 style={{ color: C.text, fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>Questions fréquentes</h3>
          {FAQ.map((item, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{item.q}</span>
                <ChevronRight size={14} style={{ color: C.muted, transform: openFaq === i ? "rotate(90deg)" : undefined, flexShrink: 0 }} />
              </button>
              {openFaq === i && <div style={{ padding: "0 18px 14px", borderTop: `1px solid ${C.border}` }}><p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "10px 0 0" }}>{item.a}</p></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "actions", label: "Actions", icon: BarChart2 },
  { id: "comparison", label: "Comparaison", icon: Layers },
  { id: "predictions", label: "Prédictions", icon: Target },
  { id: "sectors", label: "Secteurs", icon: Building2 },
  { id: "historique", label: "Historique", icon: Clock },
  { id: "settings", label: "Paramètres", icon: Settings },
];

function Sidebar({ active, onNav, isLoggedIn, userName, plan, onLogin, onSignup, onLogout, onPremium }: {
  active: string; onNav: (id: string) => void;
  isLoggedIn: boolean; userName: string; plan: Plan;
  onLogin: () => void; onSignup: () => void; onLogout: () => void; onPremium: () => void;
}) {
  return (
    <aside style={{ width: 220, minWidth: 220, background: C.panel, borderRight: `1px solid ${C.border}`, height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", zIndex: 20 }}>
      <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 6, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={16} color="white" /></div>
        <div><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>AlphaML</div><div style={{ color: C.muted, fontSize: 10.5, marginTop: 1 }}>Predict Engine v3.2</div></div>
      </div>
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button key={id} onClick={() => onNav(id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 6, color: isActive ? C.text : C.muted, background: isActive ? C.cardHov : "transparent", borderLeft: `2px solid ${isActive ? C.blue : "transparent"}`, fontSize: 13, fontWeight: isActive ? 500 : 400, cursor: "pointer", border: "none", outline: "none", textAlign: "left", width: "100%", transition: "all 0.15s" }}>
              <Icon size={14} style={{ color: isActive ? C.blue : C.muted }} />
              <span style={{ flex: 1 }}>{label}</span>
            </button>
          );
        })}
      </nav>
      {isLoggedIn && plan === "free" && (
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={onPremium} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.amber}44`, background: C.amberFaint, cursor: "pointer" }}>
            <Crown size={13} style={{ color: C.amber, flexShrink: 0 }} />
            <div style={{ textAlign: "left" }}><div style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>Passer Premium</div><div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>19€/mois · 2 mois offerts</div></div>
          </button>
        </div>
      )}
      <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}` }}>
        {isLoggedIn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: plan === "premium" ? `${C.amber}22` : C.dim, border: plan === "premium" ? `1.5px solid ${C.amber}66` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: plan === "premium" ? C.amber : C.text, flexShrink: 0 }}>
              {userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 85 }}>{userName}</div>
                <PlanBadge plan={plan} />
              </div>
              <div style={{ color: C.muted, fontSize: 10.5 }}>Analyste</div>
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

function DashboardPage({ onStock, favorites, toggleFav, isLoggedIn, plan, onRequireAuth, onRequirePremium, onLogin, bannerDismissed, onBannerDismiss }: {
  onStock: (t: string) => void; favorites: string[]; toggleFav: (t: string) => void;
  isLoggedIn: boolean; plan: Plan; onRequireAuth: (ctx: string) => void;
  onRequirePremium: (ctx: string, benefit: string) => void; onLogin: () => void;
  bannerDismissed: boolean; onBannerDismiss: () => void;
}) {
  const [search, setSearch] = useState(""), [filter, setFilter] = useState<"Tous" | "Favoris" | Prediction>("Tous");
  const isPremium = plan === "premium", isFree = plan === "free";

  const allFiltered = STOCKS.filter(s => {
    const q = search.toLowerCase(), match = s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    const pred = filter === "Tous" ? true : filter === "Favoris" ? favorites.includes(s.ticker) : s.prediction === filter;
    return match && pred;
  });
  const visibleStocks = isFree && !search && filter === "Tous" ? allFiltered.slice(0, FREE_STOCK_LIMIT) : allFiltered;
  const hiddenCount = isFree && !search && filter === "Tous" ? Math.max(0, allFiltered.length - FREE_STOCK_LIMIT) : 0;
  const hausseCount = STOCKS.filter(s => s.prediction === "Hausse").length, baisseCount = STOCKS.filter(s => s.prediction === "Baisse").length;

  const handleExport = () => {
    if (!isPremium) { onRequirePremium("Débloquez l'export de données", "Exportez vos données en CSV ou PDF."); return; }
    exportCSV(STOCKS.map(s => { const sm = summ(s.ticker); return { Ticker: s.ticker, Prix: f2(sm.price), Var1J: f2(sm.chg1d), Var90J: f2(sm.chg90d), RSI: f2(sm.rsi), Prédiction: s.prediction, Confiance: s.confidence }; }), "dashboard.csv");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {!isLoggedIn && !bannerDismissed && <VisitorBanner onLogin={onLogin} onDismiss={onBannerDismiss} />}
      <PageHeader title="Tableau de bord" sub="Vue d'ensemble — Modèle XGBoost v3.2"
        right={<>
          <ExportBtn onClick={handleExport} isPremium={isPremium} onRequirePremium={() => onRequirePremium("Débloquez l'export de données", "Exportez vos données en CSV ou PDF.")} />
          <button style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}><RefreshCw size={12} />Actualiser</button>
        </>}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}><span style={{ color: C.muted, fontSize: 11 }}>Actions suivies</span><div style={{ width: 28, height: 28, borderRadius: 6, background: `${C.blue}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={14} style={{ color: C.blue }} /></div></div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>
              {isFree ? <><span>{FREE_STOCK_LIMIT}</span><span style={{ color: C.muted, fontSize: 16 }}>/{FREE_STOCK_LIMIT}</span></> : STOCKS.length}
            </div>
            {isFree ? (<div style={{ marginTop: 8 }}><div style={{ height: 4, borderRadius: 2, background: C.dim, marginBottom: 4 }}><div style={{ width: "100%", height: "100%", borderRadius: 2, background: C.amber }} /></div><span style={{ color: C.amber, fontSize: 10, fontWeight: 600 }}>Limite du plan Gratuit</span></div>) : (<div style={{ color: C.muted, fontSize: 10.5, marginTop: 6 }}>{SECTORS.length} secteurs</div>)}
          </div>
          {[{ label: "Précision modèle", value: "82.4%", sub: "±1.3% — validation set", icon: Cpu, color: C.green }, { label: "Prédictions haussières", value: hausseCount, sub: `${baisseCount} baissières · ${STOCKS.length - hausseCount - baisseCount} stables`, icon: TrendingUp, color: C.amber }].map(({ label, value, sub, icon: Icon, color }) => (
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
                const sm = summ(s.ticker), isFav = favorites.includes(s.ticker) && isLoggedIn;
                return (
                  <tr key={s.ticker} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHov)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "11px 8px 11px 14px" }}><button onClick={e => { e.stopPropagation(); if (!isLoggedIn) { onRequireAuth("Connectez-vous pour ajouter des favoris."); return; } toggleFav(s.ticker); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}><Star size={13} fill={isFav ? C.amber : "none"} style={{ color: isFav ? C.amber : C.dim }} /></button></td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", fontWeight: 600, fontSize: 13 }}>{s.ticker}</span></td>
                    <td style={{ padding: "11px 14px", color: C.muted }} onClick={() => onStock(s.ticker)}>{s.name}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{s.sector}</span></td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", color: C.text }} onClick={() => onStock(s.ticker)}>${f2(sm.price)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.chg1d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}><span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{sm.chg1d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fPct(sm.chg1d)}</span></td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.chg90d >= 0 ? C.green : C.red }} onClick={() => onStock(s.ticker)}>{fPct(sm.chg90d)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.rsi > 70 ? C.red : sm.rsi < 30 ? C.green : C.muted }} onClick={() => onStock(s.ticker)}>{sm.rsi.toFixed(1)}</td>
                    <td style={{ padding: "11px 14px" }} onClick={() => onStock(s.ticker)}><Badge p={s.prediction} /></td>
                    <td style={{ padding: "11px 14px", minWidth: 120 }} onClick={() => onStock(s.ticker)}><ConfBar v={s.confidence} col={pc(s.prediction)} /></td>
                  </tr>
                );
              })}
              {hiddenCount > 0 && (
                <tr style={{ background: "rgba(245,158,11,0.04)", borderTop: `1px solid ${C.border}` }}>
                  <td colSpan={10} style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <Lock size={14} style={{ color: C.amber }} />
                      <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}><span style={{ color: C.text, fontWeight: 500 }}>+ {hiddenCount} autres actions</span> masquées — passez Premium pour y accéder</span>
                      <button onClick={() => onRequirePremium("Débloquez toutes les actions", "Accédez aux 18 actions suivies par AlphaML, dont les cryptomonnaies.")} style={{ fontSize: 12, padding: "6px 16px", borderRadius: 6, border: `1px solid ${C.amber}`, background: C.amberFaint, color: C.amber, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Crown size={12} />Débloquer</button>
                    </div>
                  </td>
                </tr>
              )}
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
  const filtered = STOCKS.filter(s => { const q = search.toLowerCase(); return (s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) && (!sectorF || s.sector === sectorF); });
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Catalogue des actions" sub={`${STOCKS.length} valeurs suivies — données de marché`} />
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
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["Ticker", "Société", "Secteur", "Prix", "Var. 1J", "Var. 90J", "RSI", "Volatilité", "Tendance"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: C.muted, fontWeight: 500, fontSize: 10.5, letterSpacing: "0.04em" }}>{h.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {filtered.map((s, idx) => {
                const sm = summ(s.ticker), trend = sm.price > (sm.sma20 ?? 0) ? "Haussier" : "Baissier";
                return (
                  <tr key={s.ticker} onClick={() => onStock(s.ticker)} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = C.cardHov)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "11px 16px" }}><span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>{s.ticker}</span></td>
                    <td style={{ padding: "11px 16px", color: C.muted }}>{s.name}</td>
                    <td style={{ padding: "11px 16px" }}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: C.dim, color: C.text }}>{s.sector}</span></td>
                    <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", color: C.text }}>${f2(sm.price)}</td>
                    <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.chg1d >= 0 ? C.green : C.red }}><span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{sm.chg1d >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fPct(sm.chg1d)}</span></td>
                    <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.chg90d >= 0 ? C.green : C.red }}>{fPct(sm.chg90d)}</td>
                    <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: sm.rsi > 70 ? C.red : sm.rsi < 30 ? C.green : C.muted }}>{sm.rsi.toFixed(1)}</td>
                    <td style={{ padding: "11px 16px", fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.muted }}>{sm.volatility.toFixed(1)}%</td>
                    <td style={{ padding: "11px 16px" }}><span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, color: trend === "Haussier" ? C.green : C.red, background: trend === "Haussier" ? C.greenFaint : C.redFaint }}>{trend}</span></td>
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

// ─── PREDICTIONS PAGE ────────────────────────────────────────────────────────

const HIST_WINDOW_OPTIONS = [
  { label: "7 jours", value: 7 },
  { label: "15 jours", value: 15 },
  { label: "30 jours", value: 30 },
  { label: "60 jours", value: 60 },
];
const FORECAST_HORIZON_OPTIONS = [
  { label: "3 jours", value: 3 },
  { label: "5 jours", value: 5 },
  { label: "7 jours", value: 7 },
  { label: "10 jours", value: 10 },
];

function PredictionsPage({ onStock }: { onStock: (t: string) => void }) {
  const [selectedTickers, setSelectedTickers] = useState<string[]>(["AAPL"]);
  const [histWindow, setHistWindow] = useState(15);
  const [forecastHorizon, setForecastHorizon] = useState(5);
  const [showCorr, setShowCorr] = useState(false);

  const chartData = useMemo(() => {
    if (selectedTickers.length === 0) return [];
    const histData = selectedTickers.map(t => ({
      ticker: t,
      hist: ALL[t].slice(-histWindow),
      forecast: genForecast(t, forecastHorizon),
    }));
    const combined: Record<string, number | null | string | boolean>[] = [];
    for (let i = 0; i < histWindow; i++) {
      const pt: Record<string, number | null | string | boolean> = { day: histData[0].hist[i].date, isFuture: false };
      histData.forEach(({ ticker, hist }) => { pt[ticker] = hist[i].close; pt[`${ticker}_upper`] = null; pt[`${ticker}_lower`] = null; });
      combined.push(pt);
    }
    for (let i = 0; i < forecastHorizon; i++) {
      const pt: Record<string, number | null | string | boolean> = { day: histData[0].forecast[i].day, isFuture: true };
      histData.forEach(({ ticker, hist, forecast }) => { pt[ticker] = i === 0 ? hist[hist.length - 1].close : null; pt[`${ticker}_forecast`] = forecast[i].price; pt[`${ticker}_upper`] = forecast[i].upper; pt[`${ticker}_lower`] = forecast[i].lower; });
      combined.push(pt);
    }
    return combined;
  }, [selectedTickers, histWindow, forecastHorizon]);

  const forecasts = useMemo(() => selectedTickers.map(t => ({
    ticker: t,
    stock: STOCKS.find(s => s.ticker === t)!,
    currentPrice: ALL[t][ALL[t].length - 1].close,
    days: genForecast(t, forecastHorizon),
  })), [selectedTickers, forecastHorizon]);

  const firstForecastDay = chartData.find(d => d.isFuture)?.day as string | undefined;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Prédictions ML" sub="Modèle XGBoost v3.2 · Prévisions avec intervalles de confiance" />
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
          <div>
            <div style={{ color: C.muted, fontSize: 10.5, fontWeight: 500, marginBottom: 6, letterSpacing: "0.05em" }}>HORIZON DE PRÉVISION</div>
            <div style={{ display: "flex", gap: 4 }}>
              {FORECAST_HORIZON_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setForecastHorizon(o.value)} style={{ fontSize: 11.5, padding: "6px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${forecastHorizon === o.value ? C.green : C.border}`, background: forecastHorizon === o.value ? C.greenFaint : "transparent", color: forecastHorizon === o.value ? C.green : C.muted, fontWeight: forecastHorizon === o.value ? 600 : 400 }}>{o.label}</button>
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
              {forecasts.map(({ ticker, stock, currentPrice, days }) => {
                const finalDay = days[days.length - 1];
                const totalChange = ((finalDay.price - currentPrice) / currentPrice) * 100;
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
                      <span style={{ fontFamily: "JetBrains Mono,monospace", color: C.text }}>${f2(finalDay.lower)} – ${f2(finalDay.upper)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10.5 }}>
                      <span style={{ color: C.muted }}>Confiance</span>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", color: pc(stock.prediction) }}>{stock.confidence}%</span>
                    </div>
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
                      <>
                        <Area key={`${t}_band`} type="monotone" dataKey={`${t}_upper`} stroke="none" fill={STOCK_COLORS[t]} fillOpacity={0.07} legendType="none" tooltipType="none" />
                        <Area key={`${t}_band2`} type="monotone" dataKey={`${t}_lower`} stroke="none" fill={C.bg} fillOpacity={1} legendType="none" tooltipType="none" />
                        <Line key={`${t}_hist`} type="monotone" dataKey={t} stroke={STOCK_COLORS[t]} dot={false} strokeWidth={2} connectNulls name={`${t} hist.`} />
                        <Line key={`${t}_fc`} type="monotone" dataKey={`${t}_forecast`} stroke={STOCK_COLORS[t]} dot={{ fill: STOCK_COLORS[t], r: 3 }} strokeWidth={1.5} strokeDasharray="5 4" connectNulls name={`${t} prévis.`} />
                      </>
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

  // Filter history to actions the user follows (favorites) + all if no favorites
  const userTickers = favorites.length > 0 ? favorites : STOCKS.map(s => s.ticker);
  const userEntries = HISTORY_ENTRIES.filter(e => userTickers.includes(e.ticker));
  const entries = userEntries.filter(e => (!tickerF || e.ticker === tickerF) && (resultF === "Tous" || (resultF === "Correct") === (e.pred === e.actual)));
  const correctRate = userEntries.length > 0 ? Math.round(userEntries.filter(e => e.pred === e.actual).length / userEntries.length * 100) : 0;
  const groups = entries.reduce<Record<string, typeof entries>>((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});
  const uniqueTickers = [...new Set(userEntries.map(e => e.ticker))];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Historique des prédictions" sub={`Vos actions suivies · ${userEntries.length} prédiction${userEntries.length !== 1 ? "s" : ""} enregistrée${userEntries.length !== 1 ? "s" : ""}`}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: C.muted, fontSize: 10 }}>Taux de réussite</div>
              <div style={{ color: C.green, fontFamily: "JetBrains Mono,monospace", fontWeight: 700, fontSize: 18 }}>{correctRate}%</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 10, color: C.muted }}>{userEntries.filter(e => e.pred === e.actual).length} correctes / {userEntries.length}</div>
              <div style={{ height: 4, width: 80, borderRadius: 2, background: C.dim }}><div style={{ width: `${correctRate}%`, height: "100%", borderRadius: 2, background: C.green }} /></div>
            </div>
          </div>
        }
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Prédictions analysées", value: userEntries.length, col: C.blue, sub: `${uniqueTickers.length} action${uniqueTickers.length !== 1 ? "s" : ""} suivie${uniqueTickers.length !== 1 ? "s" : ""}` },
            { label: "Signaux corrects", value: userEntries.filter(e => e.pred === e.actual).length, col: C.green, sub: `Précision : ${correctRate}%` },
            { label: "Signaux manqués", value: userEntries.filter(e => e.pred !== e.actual).length, col: C.red, sub: `Erreur : ${100 - correctRate}%` },
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
          {uniqueTickers.map(t => <button key={t} onClick={() => setTickerF(tickerF === t ? null : t)} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 5, border: `1px solid ${tickerF === t ? C.blue : C.border}`, background: tickerF === t ? C.blueFaint : "transparent", color: tickerF === t ? C.blue : C.muted, fontFamily: "JetBrains Mono,monospace", cursor: "pointer" }}>{t}</button>)}
        </div>

        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.muted }}>
            <Clock size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 13 }}>Aucune prédiction trouvée pour ce filtre.</div>
          </div>
        ) : (
          Object.entries(groups).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em" }}>{date.toUpperCase()}</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 10.5, color: C.muted }}>{items.filter(e => e.pred === e.actual).length}/{items.length} correcte{items.filter(e => e.pred === e.actual).length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map(e => {
                  const ok = e.pred === e.actual;
                  return (
                    <div key={e.id} style={{ background: C.card, border: `1px solid ${ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)"}`, borderRadius: 7, padding: "12px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: ok ? C.greenFaint : C.redFaint, display: "flex", alignItems: "center", justifyContent: "center" }}>{ok ? <Check size={14} style={{ color: C.green }} /> : <X size={14} style={{ color: C.red }} />}</div>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 14, minWidth: 44 }}>{e.ticker}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.muted, fontSize: 11 }}>Prédit :</span><Badge p={e.pred} /></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: C.muted, fontSize: 11 }}>Réel :</span><Badge p={e.actual} /></div>
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.text }}>{e.conf}%</span>
                      <div style={{ marginLeft: "auto" }}><span style={{ fontSize: 11, fontWeight: 600, color: ok ? C.green : C.red }}>{ok ? "✓ Correct" : "✗ Incorrect"}</span></div>
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

// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────

function SettingsPage({ isLoggedIn, userName, plan, onLogin, onLogout, onUpgrade }: {
  isLoggedIn: boolean; userName: string; plan: Plan;
  onLogin: () => void; onLogout: () => void; onUpgrade: () => void;
}) {
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [notifThreshold, setNotifThreshold] = useState(75);
  const [refreshInterval, setRefreshInterval] = useState<"1h" | "4h" | "24h">("4h");
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "EUR">("USD");
  const [displayTheme] = useState("Sombre");
  const [saved, setSaved] = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2200); };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? C.blue : C.dim, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
    </div>
  );

  const Section = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ padding: "6px 0" }}>{children}</div>
    </div>
  );

  const Row = ({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 24px", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ color: C.text, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Paramètres" sub="Configuration du compte et des préférences" />
      <div style={{ flex: 1, padding: "28px 32px", maxWidth: 780, margin: "0 auto", width: "100%" }}>

        {/* Account */}
        <Section title="Compte" sub="Informations de connexion et abonnement">
          {isLoggedIn ? (
            <>
              <Row label="Utilisateur" sub="Compte actif" right={
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: plan === "premium" ? `${C.amber}22` : C.dim, border: plan === "premium" ? `1.5px solid ${C.amber}55` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: plan === "premium" ? C.amber : C.text }}>
                    {userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{userName}</div>
                    <div style={{ color: C.muted, fontSize: 10.5 }}>Analyste</div>
                  </div>
                </div>
              } />
              <Row label="Plan" sub="Abonnement en cours" right={
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PlanBadge plan={plan} />
                  {plan !== "premium" && (
                    <button onClick={onUpgrade} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.amber}`, background: C.amberFaint, color: C.amber, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Crown size={12} />Passer Premium
                    </button>
                  )}
                </div>
              } />
              <div style={{ padding: "13px 24px", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.red}44`, background: C.redFaint, color: C.red, cursor: "pointer" }}>
                  <LogOut size={13} />Se déconnecter
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "24px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Non connecté</div>
                <div style={{ color: C.muted, fontSize: 12 }}>Connectez-vous pour sauvegarder vos préférences et accéder à votre historique.</div>
              </div>
              <button onClick={onLogin} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, padding: "9px 20px", borderRadius: 7, border: "none", background: C.blue, color: "white", cursor: "pointer", fontWeight: 600 }}>
                <LogIn size={14} />Se connecter
              </button>
            </div>
          )}
        </Section>

        {/* Notifications */}
        <Section title="Notifications" sub="Alertes et canaux de communication">
          <Row label="Notifications par e-mail" sub="Signaux de prédiction et rapports hebdomadaires" right={<Toggle value={notifEmail} onChange={setNotifEmail} />} />
          <Row label="Notifications push" sub="Alertes en temps réel dans le navigateur" right={<Toggle value={notifPush} onChange={setNotifPush} />} />
          <Row label="Seuil de confiance minimum" sub="Recevoir une alerte uniquement si la confiance dépasse ce seuil" right={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120, height: 4, borderRadius: 2, background: C.dim, cursor: "pointer" }} onClick={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const v = Math.round(((e.clientX - rect.left) / rect.width) * 50 + 50); setNotifThreshold(Math.max(50, Math.min(99, v))); }}>
                <div style={{ width: `${(notifThreshold - 50) * 2}%`, height: "100%", borderRadius: 2, background: C.blue }} />
              </div>
              <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: C.text, minWidth: 32 }}>{notifThreshold}%</span>
            </div>
          } />
        </Section>

        {/* Données & affichage */}
        <Section title="Données et affichage" sub="Personnalisation de l'interface">
          <Row label="Devise d'affichage" sub="Unité monétaire pour les prix" right={
            <div style={{ display: "flex", gap: 5 }}>
              {(["USD", "EUR"] as const).map(c => (
                <button key={c} onClick={() => setDisplayCurrency(c)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 5, border: `1px solid ${displayCurrency === c ? C.blue : C.border}`, background: displayCurrency === c ? C.blueFaint : "transparent", color: displayCurrency === c ? C.blue : C.muted, cursor: "pointer", fontFamily: "JetBrains Mono,monospace" }}>{c}</button>
              ))}
            </div>
          } />
          <Row label="Fréquence d'actualisation" sub="Intervalle de mise à jour du modèle" right={
            <div style={{ display: "flex", gap: 5 }}>
              {(["1h", "4h", "24h"] as const).map(r => (
                <button key={r} onClick={() => setRefreshInterval(r)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 5, border: `1px solid ${refreshInterval === r ? C.blue : C.border}`, background: refreshInterval === r ? C.blueFaint : "transparent", color: refreshInterval === r ? C.blue : C.muted, cursor: "pointer", fontFamily: "JetBrains Mono,monospace" }}>{r}</button>
              ))}
            </div>
          } />
          <Row label="Thème" sub="Apparence de l'interface" right={
            <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 5, border: `1px solid ${C.border}`, color: C.muted, background: C.panel }}>{displayTheme}</span>
          } />
        </Section>

        {/* Modèle */}
        <Section title="Modèle de prédiction" sub="Paramètres du moteur AlphaML">
          <Row label="Version du modèle" sub="XGBoost — dernière mise à jour il y a 2h" right={<span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: C.green }}>v3.2 · actif</span>} />
          <Row label="Précision validée" sub="Calculée sur le jeu de validation (30 jours glissants)" right={<span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: C.text }}>82.4%</span>} />
          <Row label="Features utilisées" sub="Indicateurs techniques inclus dans le modèle" right={<span style={{ color: C.muted, fontSize: 12 }}>RSI · MACD · SMA · Volume · Bollinger</span>} />
        </Section>

        {/* Danger zone */}
        {isLoggedIn && (
          <Section title="Zone sensible" sub="Actions irréversibles sur votre compte">
            <div style={{ padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ color: C.text, fontSize: 13 }}>Réinitialiser les préférences</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Restaurer tous les paramètres par défaut</div>
              </div>
              <button style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}>Réinitialiser</button>
            </div>
            <div style={{ padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: C.red, fontSize: 13 }}>Supprimer mon compte</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Action définitive — toutes vos données seront effacées</div>
              </div>
              <button style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.red}44`, background: C.redFaint, color: C.red, cursor: "pointer" }}>Supprimer</button>
            </div>
          </Section>
        )}

        {/* Save */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
          {saved && <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.green, fontSize: 12 }}><Check size={13} />Préférences sauvegardées</span>}
          <button onClick={handleSave} style={{ padding: "10px 28px", borderRadius: 7, border: "none", background: C.blue, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sauvegarder</button>
        </div>
      </div>
    </div>
  );
}

// ─── STOCK DETAIL PAGE ────────────────────────────────────────────────────────

function StockDetailPage({ ticker, onBack, favorites, toggleFav, isLoggedIn, onRequireAuth }: {
  ticker: string; onBack: () => void; favorites: string[]; toggleFav: (t: string) => void;
  isLoggedIn: boolean; onRequireAuth: (ctx: string) => void;
}) {
  const stock = STOCKS.find(s => s.ticker === ticker)!, data = ALL[ticker], sm = summ(ticker), last = data[data.length - 1];
  const Icon = pi(stock.prediction), isFav = favorites.includes(ticker) && isLoggedIn;
  const rem = 100 - stock.confidence;
  const probs = stock.prediction === "Hausse" ? { Hausse: stock.confidence, Stabilité: Math.round(rem * 0.55), Baisse: rem - Math.round(rem * 0.55) } : stock.prediction === "Baisse" ? { Hausse: rem - Math.round(rem * 0.55), Stabilité: Math.round(rem * 0.55), Baisse: stock.confidence } : { Hausse: Math.round(rem * 0.42), Baisse: rem - Math.round(rem * 0.42), Stabilité: stock.confidence };
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
            { title: "Chandelier · SMA · Bollinger", right: <div style={{ display: "flex", gap: 14, fontSize: 10.5, color: C.muted, fontFamily: "JetBrains Mono,monospace" }}><span>H52: <span style={{ color: C.text }}>${f2(sm.h52)}</span></span><span>L52: <span style={{ color: C.text }}>${f2(sm.l52)}</span></span><span>Vol: <span style={{ color: C.text }}>{(sm.vol / 1e6).toFixed(2)}M</span></span></div>, content: <CandleChart data={data} />, pad: "8px 4px 4px" },
            { title: "RSI (14)", right: <div style={{ display: "flex", gap: 14, fontSize: 10.5 }}><span style={{ color: C.green }}>Survente &lt;30</span><span style={{ fontFamily: "JetBrains Mono,monospace", color: last.rsi ? (last.rsi > 70 ? C.red : last.rsi < 30 ? C.green : C.text) : C.muted }}>{last.rsi?.toFixed(1) ?? "—"}</span><span style={{ color: C.red }}>Surachat &gt;70</span></div>, content: <RSIChart data={data} />, pad: "4px" },
            { title: "MACD (12, 26, 9)", right: <div style={{ display: "flex", gap: 10, fontSize: 10.5 }}>{[{ col: C.blue, label: "MACD" }, { col: C.orange, label: "Signal" }, { col: C.green, label: "Hist.+" }, { col: C.red, label: "Hist.−" }].map(({ col, label }) => <span key={label} style={{ color: col, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 10, height: 2, background: col, display: "inline-block" }} />{label}</span>)}</div>, content: <MACDChart data={data} />, pad: "4px" },
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

// ─── COMPARISON PAGE — no comparison table ────────────────────────────────────

const PERIODS = ["7J", "30J", "90J"] as const;
type Period = typeof PERIODS[number];

function ComparisonPage({ initialTickers = ["AAPL", "MSFT", "NVDA"], plan, onRequirePremium }: { initialTickers?: string[]; plan: Plan; onRequirePremium: (ctx: string, benefit: string) => void }) {
  const isPremium = plan === "premium";
  const maxStocks = isPremium ? 5 : 2;
  const [selected, setSelected] = useState<string[]>(initialTickers.slice(0, maxStocks));
  const [period, setPeriod] = useState<Period>("30J");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCorr, setShowCorr] = useState(false);
  const n = { "7J": 7, "30J": 30, "90J": 90 }[period];

  const compData = useMemo(() => {
    if (selected.length < 2) return [];
    const slices = Object.fromEntries(selected.map(t => [t, ALL[t].slice(-n)]));
    const len = Math.min(...selected.map(t => slices[t].length));
    return Array.from({ length: len }, (_, i) => { const entry: Record<string, number | string> = { date: slices[selected[0]][i].date }; selected.forEach(t => { entry[t] = Math.round((slices[t][i].close / slices[t][0].close) * 100 * 100) / 100; }); return entry; });
  }, [selected, n]);
  const xInterval = compData.length <= 10 ? 0 : Math.ceil(compData.length / 8) - 1;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Comparaison d'actions" sub={`Performance normalisée base 100 — jusqu'à ${maxStocks} actions`}
        right={<ExportBtn onClick={() => exportCSV(compData as Record<string, string | number>[], "comparaison.csv")} isPremium={isPremium} onRequirePremium={() => onRequirePremium("Débloquez l'export", "Exportez vos comparaisons en CSV.")} />}
      />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        {!isPremium && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: C.amberFaint, border: `1px solid ${C.amber}33`, borderRadius: 8, marginBottom: 20 }}>
            <Lock size={14} style={{ color: C.amber }} />
            <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>Comparez jusqu'à <span style={{ color: C.text, fontWeight: 500 }}>5 actions</span> avec Premium — actuellement limité à 2.</span>
            <button onClick={() => onRequirePremium("Débloquez la comparaison avancée", "Comparez jusqu'à 5 actions simultanément.")} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.amber}`, background: "transparent", color: C.amber, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}><Crown size={11} style={{ display: "inline", marginRight: 4 }} />Passer Premium</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Actions à comparer</div>
            <StockSelector selected={selected} onChange={setSelected} max={maxStocks} />
            {selected.length < 2 && <div style={{ color: C.red, fontSize: 10.5, marginTop: 5 }}>Sélectionnez au moins 2 actions.</div>}
          </div>
          <div><div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Période</div><div style={{ display: "flex", gap: 4 }}>{PERIODS.map(p => <button key={p} onClick={() => setPeriod(p)} style={{ fontSize: 12, padding: "7px 14px", borderRadius: 5, cursor: "pointer", border: `1px solid ${period === p ? C.blue : C.border}`, background: period === p ? C.blueFaint : C.card, color: period === p ? C.blue : C.muted }}>{p}</button>)}</div></div>
          <div><div style={{ color: C.muted, fontSize: 10.5, marginBottom: 6 }}>Options</div><button onClick={() => setShowCorr(v => !v)} style={{ fontSize: 12, padding: "7px 14px", borderRadius: 5, cursor: "pointer", border: `1px solid ${showCorr ? C.purple : C.border}`, background: showCorr ? "rgba(168,85,247,0.12)" : C.card, color: showCorr ? C.purple : C.muted }}>Corrélation</button></div>
        </div>
        {selected.length >= 2 && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {selected.map(t => { const isH = hidden.has(t); return <button key={t} onClick={() => setHidden(h => { const n2 = new Set(h); n2.has(t) ? n2.delete(t) : n2.add(t); return n2; })} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "5px 10px", borderRadius: 5, cursor: "pointer", border: `1px solid ${isH ? C.border : STOCK_COLORS[t] + "66"}`, background: isH ? "transparent" : STOCK_COLORS[t] + "18", color: isH ? C.dim : STOCK_COLORS[t], opacity: isH ? 0.5 : 1 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: STOCK_COLORS[t] }} />{t}</button>; })}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}><span style={{ color: C.text, fontSize: 11.5, fontWeight: 500 }}>Prix normalisé en base 100</span><span style={{ color: C.muted, fontSize: 10.5 }}>Base 100 = premier point de la période</span></div>
              <div style={{ padding: "12px 4px 8px" }}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={compData} margin={{ top: 5, right: 30, bottom: 5, left: 50 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={{ stroke: C.border }} interval={xInterval} />
                    <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} axisLine={false} />
                    <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" strokeWidth={1} />
                    <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 10, fontFamily: "JetBrains Mono,monospace" }} labelStyle={{ color: C.muted }} formatter={(v: number, name: string) => [`${v.toFixed(2)}`, name]} />
                    {selected.filter(t => !hidden.has(t)).map(t => <Line key={t} type="monotone" dataKey={t} stroke={STOCK_COLORS[t]} dot={false} strokeWidth={1.8} connectNulls />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Performance summary only (no table) */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selected.length, 5)},1fr)`, gap: 12, marginBottom: 16 }}>
              {selected.map(t => {
                const sm = summ(t), stock = STOCKS.find(s => s.ticker === t)!;
                return (
                  <div key={t} style={{ background: C.card, border: `1px solid ${STOCK_COLORS[t]}33`, borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STOCK_COLORS[t] }} />
                      <span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>{t}</span>
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>${f2(sm.price)}</div>
                    <div style={{ fontSize: 12, color: sm.chg90d >= 0 ? C.green : C.red, fontFamily: "JetBrains Mono,monospace", marginBottom: 8 }}>{fPct(sm.chg90d)} (90J)</div>
                    <Badge p={stock.prediction} />
                  </div>
                );
              })}
            </div>
            {showCorr && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}><div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}><span style={{ color: C.text, fontSize: 11.5, fontWeight: 500 }}>Matrice de corrélation (Pearson, 90J)</span></div><div style={{ padding: "20px 24px" }}><CorrelationMatrix tickers={selected} /></div></div>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ALERTS PAGE ──────────────────────────────────────────────────────────────

function AlertsPage({ isLoggedIn, plan, onLogin, onRequirePremium, activeAlerts, onDeleteAlert }: {
  isLoggedIn: boolean; plan: Plan; onLogin: () => void;
  onRequirePremium: (ctx: string, benefit: string) => void;
  activeAlerts: typeof ALERTS_DATA; onDeleteAlert: (id: number) => void;
}) {
  const [thresholds, setThresholds] = useState<Record<string, number>>(Object.fromEntries(STOCKS.map(s => [s.ticker, 75])));
  const isPremium = plan === "premium";
  const maxAlerts = isPremium ? Infinity : 1;

  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <PageHeader title="Alertes & Notifications" sub="Changements de prédiction récents et seuils configurables" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 32px" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: C.blueFaint, border: `1px solid ${C.blue}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><Bell size={28} style={{ color: C.blue }} /></div>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>Alertes personnalisées</h2>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, margin: "0 0 28px" }}>Connectez-vous pour configurer des alertes et recevoir des notifications en temps réel.</p>
            <button onClick={onLogin} style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: C.blue, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><LogIn size={15} />Se connecter pour continuer</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Alertes & Notifications" sub="Changements de prédiction récents et seuils configurables"
        right={<div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red }} />{activeAlerts.length} notification{activeAlerts.length !== 1 ? "s" : ""}</div>}
      />
      {!isPremium && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 32px", background: C.amberFaint, borderBottom: `1px solid ${C.amber}22` }}>
          <Lock size={14} style={{ color: C.amber }} />
          <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}><span style={{ color: C.text, fontWeight: 500 }}>1 alerte active</span> sur votre plan Gratuit — alertes illimitées avec Premium.</span>
          <button onClick={() => onRequirePremium("Débloquez les alertes illimitées", "Configurez autant d'alertes que vous le souhaitez.")} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.amber}`, background: "transparent", color: C.amber, cursor: "pointer", fontWeight: 600 }}><Crown size={11} style={{ display: "inline", marginRight: 4 }} />Passer Premium</button>
        </div>
      )}
      <div style={{ flex: 1, padding: "24px 32px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div>
          {activeAlerts.map((alert, idx) => {
            const locked = !isPremium && idx >= maxAlerts;
            const isDown = alert.to === "Baisse", isHigh = STOCKS.find(s => s.ticker === alert.ticker)!.confidence >= thresholds[alert.ticker];
            return (
              <div key={alert.id} style={{ background: C.card, border: `1px solid ${locked ? C.border : isHigh ? pc(alert.to) + "44" : C.border}`, borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, marginBottom: 10, opacity: locked ? 0.5 : 1, position: "relative", overflow: "hidden" }}>
                {locked && <div style={{ position: "absolute", inset: 0, background: "rgba(7,12,24,0.6)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", zIndex: 2 }} onClick={() => onRequirePremium("Alertes illimitées", "Configurez autant d'alertes que vous le souhaitez.")}><Lock size={13} style={{ color: C.amber }} /><span style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>Alertes illimitées avec Premium</span></div>}
                <div style={{ width: 36, height: 36, borderRadius: 8, background: pb(alert.to), display: "flex", alignItems: "center", justifyContent: "center" }}>{isDown ? <TrendingDown size={16} style={{ color: C.red }} /> : <TrendingUp size={16} style={{ color: C.green }} />}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ fontFamily: "JetBrains Mono,monospace", fontWeight: 700, color: C.text, fontSize: 14 }}>{alert.ticker}</span><Badge p={alert.from} /><span style={{ color: C.muted, fontSize: 11 }}>→</span><Badge p={alert.to} /></div>
                  <div style={{ fontSize: 11, color: C.muted }}>Conf. : <span style={{ color: pc(alert.to), fontFamily: "JetBrains Mono,monospace" }}>{alert.conf}%</span>{!locked && isHigh && <span style={{ marginLeft: 8, color: C.amber, fontSize: 10.5 }}><AlertTriangle size={10} style={{ display: "inline", verticalAlign: "middle" }} />Seuil dépassé</span>}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 10.5 }}>Il y a {alert.ago}</div>
                <button onClick={() => onDeleteAlert(alert.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.dim, padding: 2, display: "flex", borderRadius: 4 }} onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = C.red)} onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = C.dim)}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 10.5, marginBottom: 10, letterSpacing: "0.08em" }}>SEUILS PAR ACTION</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {STOCKS.slice(0, isPremium ? STOCKS.length : 3).map((s, i, arr) => <div key={s.ticker} style={{ padding: "10px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, color: C.text, fontWeight: 600, minWidth: 42 }}>{s.ticker}</span><div style={{ flex: 1, height: 4, borderRadius: 2, background: C.dim, cursor: "pointer" }} onClick={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(), v = Math.round(((e.clientX - rect.left) / rect.width) * 100); setThresholds(t => ({ ...t, [s.ticker]: Math.max(50, Math.min(99, v)) })); }}><div style={{ width: `${thresholds[s.ticker]}%`, height: "100%", borderRadius: 2, background: C.blue }} /></div><span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11, color: C.text, minWidth: 32, textAlign: "right" }}>{thresholds[s.ticker]}%</span></div>)}
            {!isPremium && <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderTop: `1px solid ${C.border}` }} onClick={() => onRequirePremium("Alertes illimitées", "Configurez des seuils pour toutes les actions.")}><Lock size={12} style={{ color: C.amber }} /><span style={{ color: C.muted, fontSize: 11.5 }}>+ {STOCKS.length - 3} actions avec Premium</span><Crown size={11} style={{ color: C.amber, marginLeft: "auto" }} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SECTOR PAGE ──────────────────────────────────────────────────────────────

function SectorPage({ onCompare }: { onCompare: (tickers: string[]) => void }) {
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<30 | 90>(90);
  const [sorted, setSorted] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<Set<string>>(new Set());
  const [sectorThresholds, setSectorThresholds] = useState<Record<string, number>>(Object.fromEntries(SECTORS.map(s => [s, 80])));
  const icons: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
    Technologie: Cpu, Finance: Building2, "Santé": Activity, Industrie: Database, "Services publics": Zap, "Crypto-monnaies": Coins,
  };
  const sectorStats = useMemo(() => SECTORS.map(sector => {
    const ss = STOCKS.filter(s => s.sector === sector), avgPerf = ss.length ? sectorPerf(ss, chartPeriod) : 0;
    const hausseC = ss.filter(s => s.prediction === "Hausse").length, baisseC = ss.filter(s => s.prediction === "Baisse").length, stabC = ss.filter(s => s.prediction === "Stabilité").length;
    const avgConf = ss.length ? ss.reduce((a, s) => a + s.confidence, 0) / ss.length : 0;
    return { sector, ss, avgPerf, hausseC, baisseC, stabC, avgConf, count: ss.length, sparkData: ss.length ? sectorSparkData(ss, 30) : [] };
  }), [chartPeriod]);
  const chartData = useMemo(() => { const data = sectorStats.map(s => ({ name: s.sector, perf: Math.round(s.avgPerf * 10) / 10 })); return sorted ? [...data].sort((a, b) => b.perf - a.perf) : data; }, [sectorStats, sorted]);
  const displayStats = sectorFilter ? sectorStats.filter(s => s.sector === sectorFilter) : sectorStats;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Analyse sectorielle" sub={`Classification GICS + Crypto — ${STOCKS.length} valeurs`} right={<ExportBtn onClick={() => exportCSV(sectorStats.map(s => ({ Secteur: s.sector, Actions: s.count, "Perf%": f2(s.avgPerf), Hausse: s.hausseC, Stabilité: s.stabC, Baisse: s.baisseC })), "secteurs.csv")} />} />
      <div style={{ flex: 1, padding: "24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 12 }}><span style={{ color: C.text, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>{STOCKS.length}</span> actions suivies</span>
          <div style={{ width: 1, height: 14, background: C.border }} />
          {[{ p: "Hausse" as Prediction, Icon: TrendingUp, col: C.green }, { p: "Stabilité" as Prediction, Icon: Minus, col: C.amber }, { p: "Baisse" as Prediction, Icon: TrendingDown, col: C.red }].map(({ p, Icon, col }) => <span key={p} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon size={13} style={{ color: col }} /><span style={{ color: col, fontWeight: 700, fontFamily: "JetBrains Mono,monospace" }}>{STOCKS.filter(s => s.prediction === p).length}</span><span style={{ color: C.muted }}>{p.toLowerCase()}</span></span>)}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4 }}>{([30, 90] as const).map(p => <button key={p} onClick={() => setChartPeriod(p)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: `1px solid ${chartPeriod === p ? C.blue : C.border}`, background: chartPeriod === p ? C.blueFaint : "transparent", color: chartPeriod === p ? C.blue : C.muted, cursor: "pointer" }}>{p}J</button>)}</div>
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
              <span style={{ color: C.text, fontSize: 12, fontWeight: 500 }}>Performance moyenne par secteur ({chartPeriod}J)</span>
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
                      <div style={{ textAlign: "right" }}><div style={{ color: perfColor, fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{fPct(avgPerf)}</div><div style={{ color: C.muted, fontSize: 9.5, marginTop: 2 }}>{chartPeriod}J</div></div>
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
                  <div style={{ marginBottom: 12 }}>{ss.map(s => { const sm = summ(s.ticker); return <div key={s.ticker} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}` }}><span style={{ color: C.text, fontFamily: "JetBrains Mono,monospace", fontSize: 12, fontWeight: 600 }}>{s.ticker}</span><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: sm.chg90d >= 0 ? C.green : C.red, fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}>{fPct(sm.chg90d)}</span><Badge p={s.prediction} /></div></div>; })}</div>
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
  const [favorites, setFavorites] = useState<string[]>(["AAPL", "NVDA", "NVO"]);
  const [compTickers, setCompTickers] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("Jean Dupont");
  const [plan, setPlan] = useState<Plan>("visitor");
  const [authView, setAuthView] = useState<AuthView>(null);
  const [authModalCtx, setAuthModalCtx] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Premium modal
  const [premiumModal, setPremiumModal] = useState<{ ctx: string; benefit: string } | null>(null);

  // Notifications / alerts
  const [activeAlerts, setActiveAlerts] = useState([...ALERTS_DATA]);
  const [notifOpen, setNotifOpen] = useState(false);

  const toggleFav = useCallback((t: string) => setFavorites(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]), []);

  const handleDeleteAlert = useCallback((id: number) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleLogin = (name: string) => {
    setIsLoggedIn(true);
    setUserName(name);
    setPlan("free");
    setAuthView(null);
    setAuthModalCtx(null);
    setActiveAlerts([...ALERTS_DATA]);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setPlan("visitor");
    setFavorites([]);
    setBannerDismissed(false);
    setAuthView(null);
    setNotifOpen(false);
  };

  const handleUpgrade = () => { setPlan("premium"); setPremiumModal(null); navigate("dashboard"); };
  const handleRequireAuth = (ctx: string) => setAuthModalCtx(ctx);
  const handleRequirePremium = (ctx: string, benefit: string) => { if (plan === "premium") return; setPremiumModal({ ctx, benefit }); };

  const navigate = (id: string) => {
    setActiveNav(id);
    const map: Record<string, Page> = { dashboard: "dashboard", actions: "actions", comparison: "comparison", predictions: "predictions", sectors: "sectors", historique: "historique", premium: "premium", settings: "settings" };
    setPage(map[id] ?? "dashboard");
    setNotifOpen(false);
  };

  const handleStock = (t: string) => { setTicker(t); setPage("detail"); setActiveNav("actions"); };
  const handleBack = () => { setPage(["actions", "predictions", "sectors", "historique"].includes(activeNav) ? activeNav as Page : "dashboard"); };
  const handleCompare = (tickers: string[]) => { setCompTickers(tickers.slice(0, plan === "premium" ? 5 : 2)); setPage("comparison"); setActiveNav("comparison"); };

  if (authView === "login") return <LoginPage onLogin={handleLogin} onGoSignup={() => setAuthView("signup")} onContinueAsGuest={() => setAuthView(null)} />;
  if (authView === "signup") return <SignupPage onSignup={handleLogin} onGoLogin={() => setAuthView("login")} onContinueAsGuest={() => setAuthView(null)} />;

  const unreadCount = activeAlerts.length;

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Inter,sans-serif" }}>
      <Sidebar active={activeNav} onNav={navigate} isLoggedIn={isLoggedIn} userName={userName} plan={plan} onLogin={() => setAuthView("login")} onSignup={() => setAuthView("signup")} onLogout={handleLogout} onPremium={() => navigate("premium")} />

      <main style={{ flex: 1, overflowY: "auto", minWidth: 0, position: "relative" }}>
        {/* Global notification bell — visible when logged in */}
        {isLoggedIn && (
          <button onClick={() => setNotifOpen(v => !v)} style={{ position: "fixed", top: 16, right: 20, zIndex: 400, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: notifOpen ? C.blueFaint : C.panel, border: `1px solid ${notifOpen ? C.blue : C.border}`, borderRadius: 8, cursor: "pointer", transition: "all 0.15s" }}>
            <Bell size={16} style={{ color: notifOpen ? C.blue : C.muted }} />
            {unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: C.red, border: `2px solid ${C.bg}` }} />}
          </button>
        )}

        {/* Dev plan toggle */}
        {isLoggedIn && (
          <div style={{ position: "fixed", bottom: 16, right: notifOpen ? 400 : 16, zIndex: 100, display: "flex", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, transition: "right 0.2s" }}>
            <span style={{ color: C.muted }}>Plan démo :</span>
            {(["free", "premium"] as Plan[]).map(p => (
              <button key={p} onClick={() => setPlan(p)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: `1px solid ${plan === p ? (p === "premium" ? C.amber : C.blue) : C.border}`, background: plan === p ? (p === "premium" ? C.amberFaint : C.blueFaint) : "transparent", color: plan === p ? (p === "premium" ? C.amber : C.blue) : C.muted, cursor: "pointer" }}>
                {p === "premium" ? "👑 Premium" : "Gratuit"}
              </button>
            ))}
          </div>
        )}

        {page === "dashboard" && <DashboardPage onStock={handleStock} favorites={favorites} toggleFav={toggleFav} isLoggedIn={isLoggedIn} plan={plan} onRequireAuth={handleRequireAuth} onRequirePremium={handleRequirePremium} onLogin={() => setAuthView("login")} bannerDismissed={bannerDismissed} onBannerDismiss={() => setBannerDismissed(true)} />}
        {page === "actions" && <ActionsPage onStock={handleStock} />}
        {page === "predictions" && <PredictionsPage onStock={handleStock} />}
        {page === "historique" && <HistoriquePage isLoggedIn={isLoggedIn} favorites={favorites} onLogin={() => setAuthView("login")} />}
        {page === "detail" && <StockDetailPage ticker={ticker} onBack={handleBack} favorites={favorites} toggleFav={toggleFav} isLoggedIn={isLoggedIn} onRequireAuth={handleRequireAuth} />}
        {page === "comparison" && <ComparisonPage key={compTickers.join(",")} initialTickers={compTickers} plan={plan} onRequirePremium={handleRequirePremium} />}
        {page === "sectors" && <SectorPage onCompare={handleCompare} />}
        {page === "settings" && <SettingsPage isLoggedIn={isLoggedIn} userName={userName} plan={plan} onLogin={() => setAuthView("login")} onLogout={handleLogout} onUpgrade={() => navigate("premium")} />}
        {page === "premium" && <PremiumPage onUpgrade={handleUpgrade} plan={plan} />}
      </main>

      {/* Notification slide panel */}
      {isLoggedIn && notifOpen && (
        <NotificationPanel alerts={activeAlerts} onDeleteAlert={handleDeleteAlert} onClose={() => setNotifOpen(false)} />
      )}

      {/* Modals */}
      {authModalCtx && <AuthRequiredModal context={authModalCtx} onLogin={() => { setAuthModalCtx(null); setAuthView("login"); }} onSignup={() => { setAuthModalCtx(null); setAuthView("signup"); }} onClose={() => setAuthModalCtx(null)} />}
      {premiumModal && <PremiumModal context={premiumModal.ctx} benefit={premiumModal.benefit} onViewOffers={() => { setPremiumModal(null); navigate("premium"); }} onClose={() => setPremiumModal(null)} />}
    </div>
  );
}
