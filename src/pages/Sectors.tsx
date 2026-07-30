import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SECTORS } from "../utils/data";
import { SectorChart } from "../components/charts/SectorChart";
import type { SectorStats } from "../types";

export default function Sectors() {
  const [selected, setSelected] = useState<SectorStats | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Bar chart overview */}
      <div className="bg-panel border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Performance par secteur</h3>
        <p className="text-xs text-muted-foreground mb-4">Variation moyenne pondérée sur 30 jours</p>
        <SectorChart data={SECTORS} />
      </div>

      {/* Sector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SECTORS.map(sector => {
          const isSelected = selected?.sector === sector.sector;
          const pctUp = sector.count ? ((sector.bullish / sector.count) * 100).toFixed(0) : "0";
          return (
            <button
              key={sector.sector}
              onClick={() => setSelected(isSelected ? null : sector)}
              className={[
                "text-left bg-panel border rounded-xl p-4 transition-all duration-200",
                isSelected
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-card-hover hover:border-border-hi",
              ].join(" ")}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="w-2.5 h-2.5 rounded-full mb-2" style={{ backgroundColor: sector.color }} />
                  <p className="text-sm font-semibold text-foreground">{sector.sector}</p>
                  <p className="text-xs text-muted-foreground">{sector.count} actions</p>
                </div>
                <span className={`text-sm font-mono font-bold ${sector.performance >= 0 ? "text-success" : "text-danger"}`}>
                  {sector.performance >= 0 ? "+" : ""}{sector.performance.toFixed(1)}%
                </span>
              </div>

              {/* Prediction breakdown */}
              <div className="flex items-center gap-2 text-xs mt-2">
                <span className="flex items-center gap-1 text-success"><TrendingUp size={10} />{sector.bullish}</span>
                <span className="flex items-center gap-1 text-warning"><Minus size={10} />{sector.stable}</span>
                <span className="flex items-center gap-1 text-danger"><TrendingDown size={10} />{sector.bearish}</span>
                <span className="ml-auto text-muted-foreground">{pctUp}% haussier</span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 rounded-full bg-dim overflow-hidden flex">
                <div className="h-full bg-success transition-all" style={{ width: `${sector.count ? (sector.bullish / sector.count) * 100 : 0}%` }} />
                <div className="h-full bg-warning transition-all" style={{ width: `${sector.count ? (sector.stable / sector.count) * 100 : 0}%` }} />
                <div className="h-full bg-danger transition-all" style={{ width: `${sector.count ? (sector.bearish / sector.count) * 100 : 0}%` }} />
              </div>

              <div className="mt-2 text-[10.5px] text-muted-foreground">
                Confiance moy. <span className="text-foreground font-mono">{sector.avgConfidence.toFixed(0)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected sector detail */}
      {selected && (
        <div className="bg-panel border border-primary/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">{selected.sector} — Détails</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-xs underline">Fermer</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Performance", value: `${selected.performance >= 0 ? "+" : ""}${selected.performance.toFixed(2)}%`, color: selected.performance >= 0 ? "text-success" : "text-danger" },
              { label: "Actions totales", value: String(selected.count), color: "text-foreground" },
              { label: "Haussiers", value: String(selected.bullish), color: "text-success" },
              { label: "Confiance moyenne", value: `${selected.avgConfidence.toFixed(1)}%`, color: "text-foreground" },
            ].map(item => (
              <div key={item.label}>
                <p className="text-[10.5px] text-muted-foreground mb-0.5">{item.label}</p>
                <p className={`text-sm font-mono font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
