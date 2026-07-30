import { Star, TrendingUp, TrendingDown, Minus, List } from "lucide-react";
import type { FilterType } from "../../types";

const FILTERS: { value: FilterType; label: string; icon: React.ElementType; activeClass: string }[] = [
  { value: "Tous",       label: "Tous",      icon: List,        activeClass: "border-primary/50 bg-primary/10 text-primary" },
  { value: "Hausse",     label: "Haussiers", icon: TrendingUp,  activeClass: "border-success/50 bg-success/10 text-success" },
  { value: "Stabilité",  label: "Stables",   icon: Minus,       activeClass: "border-warning/50 bg-warning/10 text-warning" },
  { value: "Baisse",     label: "Baissiers", icon: TrendingDown,activeClass: "border-danger/50 bg-danger/10 text-danger" },
  { value: "Favoris",    label: "Favoris",   icon: Star,        activeClass: "border-warning/50 bg-warning/10 text-warning" },
];

interface FilterButtonsProps {
  active: FilterType;
  onChange: (f: FilterType) => void;
}

export function FilterButtons({ active, onChange }: FilterButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map(({ value, label, icon: Icon, activeClass }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={[
              "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border",
              "transition-all duration-200 cursor-pointer",
              isActive
                ? activeClass
                : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
            ].join(" ")}
          >
            <Icon size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
