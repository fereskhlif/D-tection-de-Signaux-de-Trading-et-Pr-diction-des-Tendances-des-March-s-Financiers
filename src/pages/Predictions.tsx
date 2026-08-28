import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { tickerColor } from "../utils/helpers";
import { PriceHistoryChart } from "../components/charts/PredictionChart";
import { getAIPrediction } from "../services/predictionService";
import type { AIPrediction } from "../services/predictionService";

const ALL_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "NFLX"];

const HIST_OPTIONS = [
  { label: "7J", value: 7 }, { label: "15J", value: 15 },
  { label: "30J", value: 30 }, { label: "60J", value: 60 },
];
const FORECAST_OPTIONS = [
  { label: "3J", value: 3 }, { label: "5J", value: 5 },
  { label: "7J", value: 7 }, { label: "10J", value: 10 },
];

interface ChartEntry {
  ticker: string;
  data: AIPrediction;
}

export default function Predictions() {
  const [selected, setSelected] = useState<string[]>(["AAPL"]);
  const [histWindow, setHistWindow] = useState(15);
  const [forecastHorizon, setForecastHorizon] = useState(5);
  const [search, setSearch] = useState("");
  const [charts, setCharts] = useState<ChartEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const add = (ticker: string) => {
    if (selected.includes(ticker) || selected.length >= 4) return;
    setSelected(prev => [...prev, ticker]);
    setSearch("");
  };
  const remove = (ticker: string) => setSelected(prev => prev.filter(t => t !== ticker));

  const suggestions = search
    ? ALL_TICKERS.filter(t => t.toLowerCase().startsWith(search.toLowerCase()) && !selected.includes(t)).slice(0, 8)
    : [];

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reload when selected tickers change
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors({});

    const loadAll = async () => {
      const TIMEOUT_MS = 30_000; // 30s max par ticker

      const results = await Promise.all(
        selected.map(async (ticker) => {
          try {
            // Timeout par ticker pour éviter un blocage infini
            const prediction = await Promise.race([
              getAIPrediction(ticker),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout (30s) pour ${ticker}`)), TIMEOUT_MS)
              ),
            ]);

            if (!prediction) {
              console.warn(`[Prediction] réponse nulle pour ${ticker}`);
              if (active) {
                setErrors(prev => ({ ...prev, [ticker]: `Impossible de récupérer la prédiction pour ${ticker}.` }));
              }
              return null;
            }

            console.log("[Prediction] REAL DATA for", ticker, { signal: prediction.trend_prediction.signal, confidence: prediction.trend_prediction.confidence });
            return { ticker, data: prediction } as ChartEntry;
          } catch (err: any) {
            console.error(`[Prediction] erreur pour ${ticker}:`, err.message);
            if (active) {
              setErrors(prev => ({ ...prev, [ticker]: err.message || `Erreur pour ${ticker}` }));
            }
            return null;
          }
        })
      );

      if (active) {
        setCharts(results.filter(Boolean) as ChartEntry[]);
        setLoading(false);
      }
    };

    loadAll();
    return () => { active = false; };
  }, [selected]);


  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Controls */}
      <div className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-4">
        {/* Stock selector */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Actions à prévoir ({selected.length}/4)</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-secondary border border-border">
                <span style={{ color: tickerColor(t) }}>{t}</span>
                <button onClick={() => remove(t)} className="text-muted-foreground hover:text-danger ml-0.5"><X size={10} /></button>
              </span>
            ))}
            {selected.length < 4 && (
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="+ Ajouter…"
                  className="h-7 text-xs px-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-28"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 z-20 bg-panel border border-border rounded-lg shadow-xl min-w-[110px]">
                    {suggestions.map(t => (
                      <button key={t} onClick={() => add(t)} className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-card-hover transition-colors">{t}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Interval controls */}
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Historique affiché</p>
            <div className="flex gap-1">
              {HIST_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setHistWindow(o.value)}
                  className={[
                    "px-3 py-1.5 text-xs rounded-lg border transition-all",
                    histWindow === o.value
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  ].join(" ")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Horizon de prévision</p>
            <div className="flex gap-1">
              {FORECAST_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setForecastHorizon(o.value)}
                  className={[
                    "px-3 py-1.5 text-xs rounded-lg border transition-all",
                    forecastHorizon === o.value
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  ].join(" ")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <span className="animate-pulse">Calcul de la prédiction en cours…</span>
        </div>
      )}

      {/* Erreurs par ticker */}
      {!loading && Object.keys(errors).length > 0 && (
        <div className="flex flex-col gap-2">
          {Object.entries(errors).map(([ticker, msg]) => (
            <div key={ticker} className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-danger">
              <span className="font-mono font-bold">{ticker}</span>
              <span className="text-muted-foreground">—</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Charts grid */}
      {!loading && (
        <div className={`grid gap-4 ${charts.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {charts.map(({ ticker, data }) => {
            const color = tickerColor(ticker);

            // Zone 1 : historique Yahoo Finance réel (slicé selon histWindow)
            const historySlice = data.historical.slice(-histWindow);

            // Zone 2 : prévision V12.8
            const forecastPoints = data.forecast;

            // PriceHistoryChart expects: history: {date, close, open?, ...} and forecast: {date?, day?, price, ...}
            const histForChart = historySlice.map(h => ({
              date: h.date,
              close: h.close,
              open: h.close,
              high: h.close,
              low: h.close,
              volume: 0,
            }));
            const forecastForChart = forecastPoints.map(f => ({
              date: f.date,
              day: f.date,
              price: f.predicted_close,
              upper: f.predicted_close,
              lower: f.predicted_close,
              changePct: 0,
            }));

            const lastPrice = historySlice[historySlice.length - 1]?.close ?? 0;
            const finalForecast = forecastPoints[forecastPoints.length - 1]?.predicted_close ?? lastPrice;
            const pct = lastPrice > 0 ? ((finalForecast - lastPrice) / lastPrice * 100).toFixed(1) : "0.0";
            const isUp = finalForecast >= lastPrice;

            const { signal, confidence, confidence_level, decision, risk_level, trade_allowed, reason, probabilities, model_prediction } = data.trend_prediction;
            const { take_profit, stop_loss, risk_reward } = data.risk_management;
            const signalClass = signal === "Hausse" ? "text-success"
              : signal === "Baisse" ? "text-danger"
              : "text-warning";

            return (
              <div key={ticker} className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-base" style={{ color }}>{ticker}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Yahoo Finance • AlphaML Live</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Prévision (H5)</p>
                    <p className={`text-sm font-mono font-bold ${isUp ? "text-success" : "text-danger"}`}>
                      {isUp ? "+" : ""}{pct}%
                    </p>
                  </div>
                </div>

                {/* Chart : historique réel + prévision */}
                <div className="h-[220px]">
                  <PriceHistoryChart
                    history={histForChart}
                    forecast={forecastForChart}
                    color={color}
                    ticker={ticker}
                  />
                </div>

                {/* Décision IA + Risk Management */}
                <div className="flex flex-col gap-3 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground mb-1">Direction (V13.5)</span>
                      <span className={`font-bold ${signalClass}`}>{signal}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground mb-1">Force du signal</span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-bold text-foreground">{(confidence * 100).toFixed(1)}%</span>
                        {confidence_level && <span className="text-[10px] font-bold text-muted-foreground">{confidence_level}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground mb-1">Décision Router</span>
                      <span className={`font-bold ${trade_allowed ? 'text-success' : (decision === 'WATCH' ? 'text-warning' : 'text-danger')}`}>{decision}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground mb-1">Risk Level</span>
                      <span className={`font-bold ${risk_level === 'LOW' ? 'text-success' : (risk_level === 'HIGH' ? 'text-danger' : 'text-warning')}`}>{risk_level}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-1 text-[11px] bg-black/20 p-2 rounded-md">
                    <span className="text-muted-foreground">Raison: <span className="text-foreground">{reason}</span></span>
                    <span className="text-muted-foreground">Trade autorisé: <span className={trade_allowed ? "text-success" : "text-danger"}>{trade_allowed ? "OUI" : "NON"}</span></span>
                  </div>
                  
                  {(take_profit || stop_loss || risk_reward) && trade_allowed && (
                    <div className="flex gap-4 text-xs mt-1 border-t border-border/50 pt-2">
                      {take_profit != null && <span>TP: <span className="font-mono text-foreground">${take_profit}</span></span>}
                      {stop_loss != null && <span>SL: <span className="font-mono text-foreground">${stop_loss}</span></span>}
                      {risk_reward != null && <span>R/R: <span className="font-mono text-foreground">{risk_reward}</span></span>}
                    </div>
                  )}
                </div>

                {/* Probabilités détaillées */}
                <div className="flex gap-3 text-[10px] text-muted-foreground border-t border-border pt-1">
                  <span>↑ Hausse: <span className="text-success font-mono">{Math.round((probabilities.Hausse ?? 0) * 100)}%</span></span>
                  <span>↓ Baisse: <span className="text-danger font-mono">{Math.round((probabilities.Baisse ?? 0) * 100)}%</span></span>
                  <span>→ Stabilité: <span className="text-warning font-mono">{Math.round(((probabilities["Stabilité"] ?? probabilities as any["Stabilite"]) ?? 0) * 100)}%</span></span>
                </div>

                {/* V13.2 details removed as they are redundant now */}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
