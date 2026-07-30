import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  iconColor?: string;
  accent?: ReactNode;
}

export function StatCard({ label, value, sub, icon, iconColor = "text-primary", accent }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 transition-colors duration-200 hover:border-border-hi">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`w-7 h-7 rounded-md bg-secondary flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground font-mono leading-none">{value}</div>
        {sub && <div className="text-[10.5px] text-muted-foreground mt-1.5">{sub}</div>}
        {accent}
      </div>
    </div>
  );
}
