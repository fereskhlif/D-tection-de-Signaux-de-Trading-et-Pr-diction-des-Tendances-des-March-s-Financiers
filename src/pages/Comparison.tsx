import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { X, Loader2, AlertCircle } from "lucide-react";
import { tickerColor } from "../utils/helpers";
import { useComparison } from "../hooks/useComparison";

export default function Comparison() {
  const {
    selected,
    days,
    setDays,
    searchQuery,
    setSearchQuery,
    suggestions,
    isSearching,
    addStock,
    removeStock,
    chartData,
    loading,
    error,
    getCorrelation,
    statistics,
    MAX_STOCKS,
  } = useComparison();

  const corrColor = (v: number) => {
    if (v >= 0.7) return "bg-success/20 text-success";
    if (v >= 0.3) return "bg-warning/20 text-warning";
    if (v >= -0.3) return "bg-secondary text-muted-foreground";
    return "bg-danger/20 text-danger";
  };

  const PERIOD_OPTIONS = [
    { label: "7J", value: 7 }, { label: "15J", value: 15 },
    { label: "30J", value: 30 }, { label: "60J", value: 60 },
    { label: "90J", value: 90 }, { label: "6M", value: 180 },
    { label: "1A", value: 365 }, { label: "2A", value: 730 },
    { label: "5A", value: 1825 }
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
                <button onClick={() => removeStock(t)} className="text-muted-foreground hover:text-danger ml-0.5"><X size={10} /></button>
              </span>
            ))}
            {selected.length < MAX_STOCKS && (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="+ Ajouter…"
                  className="h-7 text-xs px-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-32"
                />
                {(suggestions.length > 0 || isSearching) && (
                  <div className="absolute top-full mt-1 left-0 z-20 bg-panel border border-border rounded-lg shadow-xl min-w-[200px] max-h-60 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-4 flex justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      suggestions.map(t => (
                        <button key={t.ticker} onClick={() => addStock(t.ticker)} className="w-full text-left px-3 py-2 hover:bg-card-hover transition-colors border-b border-border last:border-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-xs font-mono font-bold">{t.ticker}</span>
                            <span className="text-[9px] text-muted-foreground uppercase">{t.assetType}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{t.name}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Period */}
        <div className="flex gap-1 flex-wrap">
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
      <div className="bg-panel border border-border rounded-xl p-4 relative">
        <h3 className="text-sm font-semibold text-foreground mb-4">Performance relative (base 0%)</h3>

        {loading && (
          <div className="absolute inset-0 z-10 bg-panel/50 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 bg-panel/90 rounded-xl flex flex-col items-center justify-center text-center p-6">
            <AlertCircle className="w-8 h-8 text-danger mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Erreur de chargement</p>
            <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            Aucune donnée disponible pour la période sélectionnée.
          </div>
        )}

        {chartData.length > 0 && (
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
                  <Line key={t} type="monotone" dataKey={t} stroke={tickerColor(t)} strokeWidth={1.5} dot={false} connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Statistics cards */}
      {statistics.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Statistiques par actif</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {statistics.map(stat => (
              <div key={stat.ticker} className="bg-secondary/40 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono font-bold" style={{ color: tickerColor(stat.ticker) }}>{stat.ticker}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${stat.totalReturn >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                    {stat.totalReturn >= 0 ? "+" : ""}{stat.totalReturn.toFixed(2)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">Volatilité</span>
                  <span className="text-right font-mono text-foreground">{stat.volatility.toFixed(1)}%</span>
                  <span className="text-muted-foreground">Sharpe</span>
                  <span className="text-right font-mono text-foreground">{stat.sharpe.toFixed(2)}</span>
                  <span className="text-muted-foreground">Max DD</span>
                  <span className="text-right font-mono text-danger">{stat.maxDrawdown.toFixed(2)}%</span>
                  <span className="text-muted-foreground">Séances</span>
                  <span className="text-right font-mono text-foreground">{stat.sessions}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      const v = getCorrelation(a, b);
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
