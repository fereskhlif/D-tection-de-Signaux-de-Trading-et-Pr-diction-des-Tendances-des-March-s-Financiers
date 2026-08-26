import { ArrowLeft, RefreshCw } from "lucide-react";
import { useStockDetail } from "../hooks/useStockDetail";
import { formatPrice, formatPct, tickerColor } from "../utils/helpers";
import { CandlestickChart } from "../components/charts/CandlestickChart";
import { RsiChart, MacdChart } from "../components/charts/IndicatorChart";
import { PredictionBadge } from "../components/dashboard/PredictionBadge";

interface StockDetailsProps {
  ticker: string;
  onBack: () => void;
}

export default function StockDetails({ ticker, onBack }: StockDetailsProps) {
  const { data, loading, error, refresh } = useStockDetail(ticker);

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit mb-6">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw size={24} className="animate-spin text-primary" />
            <p className="text-sm animate-pulse">Chargement des données de {ticker}...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col h-full p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit mb-6">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-6 text-center max-w-md">
            <p className="text-danger font-medium mb-2">Erreur</p>
            <p className="text-sm text-danger/80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const color = tickerColor(data.ticker);
  const mkt = data.market;
  const isUp = mkt.change >= 0;
  
  const probs = data.prediction.probabilities;
  const highestProb = Math.max(probs.Hausse, probs.Baisse, probs.Stabilite);
  
  // Format percentage helper for probabilities
  const fp = (p: number) => `${Math.round(p * 100)}%`;

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold font-mono tracking-tight" style={{ color }}>{data.ticker}</h2>
              <span className="text-sm font-medium px-2 py-0.5 rounded bg-secondary text-muted-foreground">{data.company_name}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Dernière mise à jour: {new Date(mkt.timestamp).toLocaleString("fr-FR")}</p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-3xl font-bold font-mono tracking-tighter">${formatPrice(mkt.price)}</div>
          <div className={`text-sm font-mono font-medium ${isUp ? "text-success" : "text-danger"}`}>
            {isUp ? "+" : ""}{formatPrice(mkt.change)} ({formatPct(mkt.change_percent)})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Charts) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Main Chart */}
          <div className="bg-panel border border-border rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Graphique Historique</h3>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#f59e0b]" /> SMA 50</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#a855f7]" /> SMA 20</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#60a5fa] opacity-60" /> Bollinger</span>
              </div>
            </div>
            <div className="h-[300px]">
              <CandlestickChart data={data.history} />
            </div>
          </div>

          {/* Indicators Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* RSI */}
            <div className="bg-panel border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3">RSI (14)</h3>
              <div className="h-[120px]">
                <RsiChart data={data.history} />
              </div>
            </div>
            {/* MACD */}
            <div className="bg-panel border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3">MACD (12, 26, 9)</h3>
              <div className="h-[120px]">
                <MacdChart data={data.history} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (AI Panel) */}
        <div className="flex flex-col gap-4">
          <div className="bg-panel border border-border rounded-xl p-5 flex flex-col gap-5 sticky top-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Prédiction ML</h3>
              <p className="text-[10px] text-muted-foreground font-mono">Modèle: {data.prediction.model}</p>
            </div>
            
            <div className="bg-secondary rounded-lg p-4 flex flex-col items-center justify-center gap-2">
              <div className="scale-125">
                <PredictionBadge prediction={data.prediction.direction} />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight mt-2">
                {Math.round(data.prediction.confidence * 100)}%
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Niveau de confiance: <span className="font-medium text-foreground">{data.prediction.level}</span>
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-medium text-muted-foreground">Probabilités</h4>
              
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-success">↑ Hausse</span>
                    <span>{fp(probs.Hausse)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: fp(probs.Hausse) }} />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-warning">→ Stabilité</span>
                    <span>{fp(probs.Stabilite)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-warning rounded-full" style={{ width: fp(probs.Stabilite) }} />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-danger">↓ Baisse</span>
                    <span>{fp(probs.Baisse)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-danger rounded-full" style={{ width: fp(probs.Baisse) }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border mt-2">
              <h4 className="text-xs font-medium text-muted-foreground mb-3">Indicateurs Clés</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">RSI</span>
                  <span className="font-mono">{data.history[data.history.length-1]?.rsi?.toFixed(1) || "-"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">Volatilité 1J</span>
                  <span className="font-mono">
                    {(() => {
                       const h = data.history;
                       if (h.length < 2) return "-";
                       const p1 = h[h.length-1].close;
                       const p2 = h[h.length-2].close;
                       return Math.abs((p1-p2)/p2*100).toFixed(2) + "%";
                    })()}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">SMA 20</span>
                  <span className="font-mono">${data.history[data.history.length-1]?.sma20?.toFixed(2) || "-"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">Volume</span>
                  <span className="font-mono">{(data.history[data.history.length-1]?.volume / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
