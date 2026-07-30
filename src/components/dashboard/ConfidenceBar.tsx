import type { Prediction } from "../../types";

interface ConfidenceBarProps {
  value: number;
  prediction: Prediction;
  showLabel?: boolean;
}

const barColor: Record<Prediction, string> = {
  Hausse:    "bg-success",
  Stabilité: "bg-warning",
  Baisse:    "bg-danger",
};

export function ConfidenceBar({ value, prediction, showLabel = true }: ConfidenceBarProps) {
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-dim overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor[prediction]}`}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-mono text-foreground tabular-nums min-w-[28px] text-right">
          {value}%
        </span>
      )}
    </div>
  );
}
