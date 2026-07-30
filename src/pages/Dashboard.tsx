import { TrendingUp, TrendingDown, Activity, Brain } from "lucide-react";
import { StatCard } from "../components/dashboard/StatCard";
import { SearchBar } from "../components/dashboard/SearchBar";
import { FilterButtons } from "../components/dashboard/FilterButtons";
import { PredictionTable } from "../components/dashboard/PredictionTable";
import { useStocks } from "../hooks/useStocks";
import { useSearch } from "../hooks/useSearch";
import { useFilter } from "../hooks/useFilter";
import { MODEL_ACCURACY } from "../utils/data";

interface DashboardProps {
  onStockClick: (ticker: string) => void;
}

export default function Dashboard({ onStockClick }: DashboardProps) {
  const { stocks, toggleFavorite } = useStocks();
  const { query, setQuery, results: searched } = useSearch(stocks);
  const { activeFilter, setActiveFilter, filtered } = useFilter(searched);

  const bullish = stocks.filter(s => s.prediction === "Hausse").length;
  const bearish = stocks.filter(s => s.prediction === "Baisse").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Actions suivies"
          value={String(stocks.length)}
          sub="18 secteurs"
          icon={<Activity size={14} />}
          iconColor="text-primary"
        />
        <StatCard
          label="Prévisions Hausse"
          value={String(bullish)}
          sub={`${((bullish / stocks.length) * 100).toFixed(0)}% du portefeuille`}
          icon={<TrendingUp size={14} />}
          iconColor="text-success"
        />
        <StatCard
          label="Prévisions Baisse"
          value={String(bearish)}
          sub={`${((bearish / stocks.length) * 100).toFixed(0)}% du portefeuille`}
          icon={<TrendingDown size={14} />}
          iconColor="text-danger"
        />
        <StatCard
          label="Précision du modèle"
          value={`${MODEL_ACCURACY.overall}%`}
          sub={`↑${MODEL_ACCURACY.weekly}% cette semaine`}
          icon={<Brain size={14} />}
          iconColor="text-primary"
        />
      </div>

      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border">
          <div className="flex-1">
            <SearchBar value={query} onChange={setQuery} />
          </div>
          <FilterButtons active={activeFilter} onChange={setActiveFilter} />
        </div>
        <PredictionTable
          stocks={filtered}
          onRowClick={onStockClick}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  );
}
