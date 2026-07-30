import { useState } from "react";
import { Star, ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown } from "lucide-react";
import type { Stock } from "../../types";
import { formatPrice, formatPct } from "../../utils/helpers";
import { PredictionBadge } from "./PredictionBadge";
import { ConfidenceBar } from "./ConfidenceBar";

type SortKey = "ticker" | "price" | "dayChange" | "quarterChange" | "rsi" | "confidence";
type SortDir = "asc" | "desc";

interface PredictionTableProps {
  stocks: Stock[];
  onRowClick?: (ticker: string) => void;
  onToggleFavorite: (id: string) => void;
  itemsPerPage?: number;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="w-3 h-3 inline-block opacity-0 group-hover:opacity-40"><ChevronUp size={10} /></span>;
  return dir === "asc" ? <ChevronUp size={10} className="text-primary" /> : <ChevronDown size={10} className="text-primary" />;
}

const TH = ({ children, sortKey, current, dir, onSort, align = "left" }: {
  children: React.ReactNode; sortKey?: SortKey; current?: SortKey; dir?: SortDir;
  onSort?: (k: SortKey) => void; align?: "left" | "center" | "right";
}) => (
  <th
    onClick={() => sortKey && onSort?.(sortKey)}
    className={[
      "px-3 py-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground",
      "whitespace-nowrap select-none",
      sortKey ? "cursor-pointer hover:text-foreground group" : "",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
    ].join(" ")}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey && <SortIcon active={current === sortKey} dir={dir ?? "asc"} />}
    </span>
  </th>
);

export function PredictionTable({
  stocks,
  onRowClick,
  onToggleFavorite,
  itemsPerPage = 10,
}: PredictionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  };

  const sorted = [...stocks].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mult;
    return ((av as number) - (bv as number)) * mult;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage));
  const pageData = sorted.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-panel z-10 border-b border-border">
            <tr>
              <TH>☆</TH>
              <TH sortKey="ticker" current={sortKey} dir={sortDir} onSort={handleSort}>Ticker</TH>
              <th className="px-3 py-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground text-left whitespace-nowrap">Société</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground text-left whitespace-nowrap">Secteur</th>
              <TH sortKey="price" current={sortKey} dir={sortDir} onSort={handleSort} align="right">Prix</TH>
              <TH sortKey="dayChange" current={sortKey} dir={sortDir} onSort={handleSort} align="right">1J</TH>
              <TH sortKey="quarterChange" current={sortKey} dir={sortDir} onSort={handleSort} align="right">90J</TH>
              <TH sortKey="rsi" current={sortKey} dir={sortDir} onSort={handleSort} align="right">RSI</TH>
              <th className="px-3 py-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground text-left whitespace-nowrap">Prédiction</th>
              <TH sortKey="confidence" current={sortKey} dir={sortDir} onSort={handleSort}>Confiance</TH>
            </tr>
          </thead>

          <tbody>
            {pageData.map((stock, idx) => {
              const isSelected = selected.has(stock.id);
              return (
                <tr
                  key={stock.id}
                  onClick={() => onRowClick?.(stock.ticker)}
                  className={[
                    "border-b border-border cursor-pointer",
                    "transition-colors duration-150",
                    isSelected ? "bg-primary/5" : idx % 2 === 0 ? "hover:bg-card-hover" : "bg-card/30 hover:bg-card-hover",
                  ].join(" ")}
                >
                  {/* Favorite */}
                  <td className="px-3 py-2.5 w-8">
                    <button
                      onClick={e => { e.stopPropagation(); onToggleFavorite(stock.id); }}
                      className="flex items-center justify-center transition-transform duration-150 hover:scale-110"
                    >
                      <Star
                        size={13}
                        fill={stock.isFavorite ? "#f59e0b" : "none"}
                        className={stock.isFavorite ? "text-warning" : "text-dim hover:text-muted-foreground"}
                      />
                    </button>
                  </td>

                  {/* Ticker */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={e => toggleSelect(stock.id, e)}
                        onChange={() => {}}
                        className="w-3 h-3 accent-primary rounded cursor-pointer"
                      />
                      <span className="font-mono font-bold text-foreground text-[13px]">{stock.ticker}</span>
                    </div>
                  </td>

                  {/* Company */}
                  <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">{stock.company}</td>

                  {/* Sector */}
                  <td className="px-3 py-2.5">
                    <span className="text-[10.5px] px-2 py-0.5 rounded bg-dim text-foreground">{stock.sector}</span>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2.5 font-mono text-right text-foreground text-[12px]">
                    ${formatPrice(stock.price)}
                  </td>

                  {/* Day change */}
                  <td className="px-3 py-2.5 text-right text-[11px] font-mono">
                    <span className={`inline-flex items-center gap-0.5 ${stock.dayChange >= 0 ? "text-success" : "text-danger"}`}>
                      {stock.dayChange >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {formatPct(stock.dayChange)}
                    </span>
                  </td>

                  {/* Quarter change */}
                  <td className="px-3 py-2.5 text-right text-[11px] font-mono">
                    <span className={stock.quarterChange >= 0 ? "text-success" : "text-danger"}>
                      {formatPct(stock.quarterChange)}
                    </span>
                  </td>

                  {/* RSI */}
                  <td className="px-3 py-2.5 text-right font-mono text-[11px]">
                    <span className={stock.rsi > 70 ? "text-danger" : stock.rsi < 30 ? "text-success" : "text-muted-foreground"}>
                      {stock.rsi}
                    </span>
                  </td>

                  {/* Prediction */}
                  <td className="px-3 py-2.5">
                    <PredictionBadge prediction={stock.prediction} />
                  </td>

                  {/* Confidence */}
                  <td className="px-3 py-2.5 min-w-[120px]">
                    <ConfidenceBar value={stock.confidence} prediction={stock.prediction} />
                  </td>
                </tr>
              );
            })}

            {pageData.length === 0 && (
              <tr><td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">Aucune action trouvée</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {stocks.length} action{stocks.length !== 1 ? "s" : ""}
            {selected.size > 0 && ` · ${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={[
                  "w-7 h-7 text-xs rounded flex items-center justify-center transition-colors",
                  page === i
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                ].join(" ")}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
