import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { STOCKS, generatePriceHistory, generateForecast } from "../utils/data";
import { tickerColor } from "../utils/helpers";
import { PriceHistoryChart } from "../components/charts/PredictionChart";

const ALL_TICKERS = STOCKS.map(s => s.ticker);

const HIST_OPTIONS = [
  { label: "7J", value: 7 }, { label: "15J", value: 15 },
  { label: "30J", value: 30 }, { label: "60J", value: 60 },
];
const FORECAST_OPTIONS = [
  { label: "3J", value: 3 }, { label: "5J", value: 5 },
  { label: "7J", value: 7 }, { label: "10J", value: 10 },
];

export default function Predictions() {
  const [selected, setSelected] = useState<string[]>(["AAPL"]);
  const [histWindow, setHistWindow] = useState(15);
  const [forecastHorizon, setForecastHorizon] = useState(5);
  const [search, setSearch] = useState("");

  const add = (ticker: string) => {
    if (selected.includes(ticker) || selected.length >= 4) return;
    setSelected(prev => [...prev, ticker]);
    setSearch("");
  };
  const remove = (ticker: string) => setSelected(prev => prev.filter(t => t !== ticker));

  const suggestions = search
    ? ALL_TICKERS.filter(t => t.toLowerCase().startsWith(search.toLowerCase()) && !selected.includes(t)).slice(0, 8)
    : [];

  const charts = useMemo(() => {
    return selected.map(ticker => {
      const stock = STOCKS.find(s => s.ticker === ticker);
      if (!stock) return null;
      const history = generatePriceHistory(stock.price, histWindow + 1, stock.seed).slice(1);
      const forecast = generateForecast(stock, forecastHorizon);
      return { ticker, stock, history, forecast };
    }).filter(Boolean) as { ticker: string; stock: typeof STOCKS[0]; history: any[]; forecast: any[] }[];
  }, [selected, histWindow, forecastHorizon]);

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
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Historique</p>
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

      {/* Charts grid */}
      <div className={`grid gap-4 ${charts.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        {charts.map(({ ticker, stock, history, forecast }) => {
          const color = tickerColor(ticker);
          const lastPrice = history[history.length - 1]?.price ?? stock.price;
          const finalForecast = forecast[forecast.length - 1]?.price ?? lastPrice;
          const pct = ((finalForecast - lastPrice) / lastPrice * 100).toFixed(1);
          const isUp = finalForecast >= lastPrice;
          return (
            <div key={ticker} className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono font-bold text-base" style={{ color }}>{ticker}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{stock.company}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Dans {forecastHorizon}J</p>
                  <p className={`text-sm font-mono font-bold ${isUp ? "text-success" : "text-danger"}`}>
                    {isUp ? "+" : ""}{pct}%
                  </p>
                </div>
              </div>
              <div className="h-[220px]">
                <PriceHistoryChart
                  history={history}
                  forecast={forecast}
                  color={color}
                  ticker={ticker}
                />
              </div>
              <div className="flex items-center gap-4 text-[10.5px] text-muted-foreground pt-1 border-t border-border">
                <span>Prévision ML: <span className={`font-semibold ${stock.prediction === "Hausse" ? "text-success" : stock.prediction === "Baisse" ? "text-danger" : "text-warning"}`}>{stock.prediction}</span></span>
                <span>Confiance: <span className="text-foreground font-mono">{stock.confidence}%</span></span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <span className="inline-block w-6 border-t-2 border-dashed border-current opacity-50" />
                  Prévision
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
