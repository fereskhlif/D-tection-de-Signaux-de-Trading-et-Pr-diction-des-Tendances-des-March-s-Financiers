import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Rechercher un ticker, une société..." }: SearchBarProps) {
  return (
    <div className="relative flex items-center">
      <Search size={13} className="absolute left-3 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "w-full bg-secondary border border-border rounded-lg",
          "text-sm text-foreground placeholder:text-muted-foreground",
          "pl-9 pr-8 py-2",
          "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
          "transition-all duration-200",
        ].join(" ")}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
