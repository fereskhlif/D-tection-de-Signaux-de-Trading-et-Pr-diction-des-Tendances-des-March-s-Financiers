import { useState } from "react";
import type { Sector } from "../types";
import { SearchBar } from "../components/dashboard/SearchBar";
import { FilterButtons } from "../components/dashboard/FilterButtons";
import { PredictionTable } from "../components/dashboard/PredictionTable";
import { useStocks } from "../hooks/useStocks";
import { useSearch } from "../hooks/useSearch";
import { useFilter } from "../hooks/useFilter";
import { SECTORS_LIST } from "../utils/data";

interface StocksProps {
  onStockClick: (ticker: string) => void;
}

export default function Stocks({ onStockClick }: StocksProps) {
  const { stocks, toggleFavorite } = useStocks();
  const [sectorFilter, setSectorFilter] = useState<Sector | "Tous">("Tous");
  const { query, setQuery, results: searched } = useSearch(stocks);
  const { activeFilter, setActiveFilter, filtered } = useFilter(searched);

  const bySector = sectorFilter === "Tous"
    ? filtered
    : filtered.filter(s => s.sector === sectorFilter);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Sector pills */}
      <div className="flex flex-wrap gap-1.5">
        {(["Tous", ...SECTORS_LIST] as const).map(s => (
          <button
            key={s}
            onClick={() => setSectorFilter(s)}
            className={[
              "text-xs px-3 py-1.5 rounded-lg border transition-all duration-150",
              sectorFilter === s
                ? "bg-primary/15 border-primary/40 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border">
          <div className="flex-1">
            <SearchBar value={query} onChange={setQuery} />
          </div>
          <FilterButtons active={activeFilter} onChange={setActiveFilter} />
        </div>
        <PredictionTable
          stocks={bySector}
          onRowClick={onStockClick}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  );
}
