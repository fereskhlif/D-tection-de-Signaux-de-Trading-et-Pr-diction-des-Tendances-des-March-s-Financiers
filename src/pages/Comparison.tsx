import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { X } from "lucide-react";
import { STOCKS, generatePriceHistory } from "../utils/data";
import { tickerColor } from "../utils/helpers";

const MAX_STOCKS = 5;
const ALL_TICKERS = STOCKS.map(s => s.ticker);

/* Normalize price to 100-base */
function normalize(prices: number[]): number[] {
  if (!prices.length) return [];
  const base = prices[0];
  return prices.map(p => +(((p / base) * 100) - 100).toFixed(3));
}

export default function Comparison() {
  const [selected, setSelected] = useState<string[]>(["AAPL", "MSFT", "NVDA"]);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");

  const add = (ticker: string) => {
    if (selected.includes(ticker) || selected.length >= MAX_STOCKS) return;
    setSelected(prev => [...prev, ticker]);
    setSearch("");
  };
  const remove = (ticker: string) => setSelected(prev => prev.filter(t => t !== ticker));

  const suggestions = search
    ? ALL_TICKERS.filter(t => t.toLowerCase().startsWith(search.toLowerCase()) && !selected.includes(t)).slice(0, 8)
    : [];

  /* Build chart data */
  const chartData = useMemo(() => {
    if (!selected.length) return [];
    const seriesMap: Record<string, number[]> = {};
    selected.forEach(ticker => {
      const stock = STOCKS.find(s => s.ticker === ticker);
      if (!stock) return;
      const hist = generatePriceHistory(stock.price, days + 1, stock.seed);
      seriesMap[ticker] = normalize(hist.map(p => p.close));
    });
    const len = Math.min(...Object.values(seriesMap).map(a => a.length));
    const hist0 = generatePriceHistory(STOCKS[0].price, days + 1, STOCKS[0].seed);
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, any> = { date: hist0[i]?.date ?? `J${i}` };
      selected.forEach(t => { row[t] = seriesMap[t]?.[i] ?? null; });
      return row;
    });
  }, [selected, days]);

  /* Correlation matrix */
  const rawSeries = useMemo(() => {
    const map: Record<string, number[]> = {};
    selected.forEach(ticker => {
      const stock = STOCKS.find(s => s.ticker === ticker);
      if (!stock) return;
      map[ticker] = generatePriceHistory(stock.price, days + 1, stock.seed).map(p => p.close);
    });
    return map;
  }, [selected, days]);

  function pearson(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const ai = a[i] - meanA, bi = b[i] - meanB;
      num += ai * bi; da += ai * ai; db += bi * bi;
    }
    return da && db ? +(num / Math.sqrt(da * db)).toFixed(2) : 1;
  }

  const corrColor = (v: number) => {
    if (v >= 0.7) return "bg-success/20 text-success";
    if (v >= 0.3) return "bg-warning/20 text-warning";
    if (v >= -0.3) return "bg-secondary text-muted-foreground";
    return "bg-danger/20 text-danger";
  };

  const PERIOD_OPTIONS = [
    { label: "7J", value: 7 }, { label: "15J", value: 15 },
    { label: "30J", value: 30 }, { label: "60J", value: 60 },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Controls */}
      <div className="bg-panel border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Selector */}
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground font-medium">Actions sélectionnées ({selected.length}/{MAX_STOCKS})</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded-lg bg-secondary border border-border">
                <span style={{ color: tickerColor(t) }}>{t}</span>
                <button onClick={() => remove(t)} className="text-muted-foreground hover:text-danger ml-0.5"><X size={10} /></button>
              </span>
            ))}
            {selected.length < MAX_STOCKS && (
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="+ Ajouter…"
                  className="h-7 text-xs px-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-24"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 z-20 bg-panel border border-border rounded-lg shadow-xl min-w-[100px]">
                    {suggestions.map(t => (
                      <button key={t} onClick={() => add(t)} className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-card-hover transition-colors">{t}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Period */}
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={[
                "px-3 py-1.5 text-xs rounded-lg border transition-all",
                days === o.value
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-panel border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Performance relative (base 0)</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
              <Tooltip
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="bg-panel border border-border rounded-lg p-2.5 shadow-xl text-xs min-w-[120px]">
                      <p className="text-muted-foreground mb-1">{label}</p>
                      {payload.map((p: any) => (
                        <div key={p.dataKey} className="flex justify-between gap-3">
                          <span style={{ color: p.stroke }} className="font-mono font-bold">{p.dataKey}</span>
                          <span className={p.value >= 0 ? "text-success" : "text-danger"}>{p.value >= 0 ? "+" : ""}{p.value}%</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selected.map(t => (
                <Line key={t} type="monotone" dataKey={t} stroke={tickerColor(t)} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Correlation matrix */}
      {selected.length >= 2 && (
        <div className="bg-panel border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Matrice de corrélation</h3>
          <div className="overflow-x-auto">
            <table className="text-xs text-center border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-1" />
                  {selected.map(t => (
                    <th key={t} className="px-3 py-1 font-mono text-[11px]" style={{ color: tickerColor(t) }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.map(a => (
                  <tr key={a}>
                    <td className="pr-3 py-1 font-mono text-[11px] font-bold text-left" style={{ color: tickerColor(a) }}>{a}</td>
                    {selected.map(b => {
                      const v = pearson(rawSeries[a] ?? [], rawSeries[b] ?? []);
                      return (
                        <td key={b} className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold ${corrColor(v)}`}>
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
