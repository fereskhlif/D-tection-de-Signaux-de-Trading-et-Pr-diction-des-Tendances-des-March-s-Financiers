import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Prediction } from "../../types";

interface PredictionBadgeProps {
  prediction: Prediction;
  size?: "sm" | "md";
}

const config: Record<Prediction, { color: string; bg: string; border: string; Icon: typeof TrendingUp }> = {
  Hausse:    { color: "text-success",  bg: "bg-success/10",  border: "border-success/30",  Icon: TrendingUp  },
  Stabilité: { color: "text-warning",  bg: "bg-warning/10",  border: "border-warning/30",  Icon: Minus       },
  Baisse:    { color: "text-danger",   bg: "bg-danger/10",   border: "border-danger/30",   Icon: TrendingDown },
};

export function PredictionBadge({ prediction, size = "sm" }: PredictionBadgeProps) {
  const { color, bg, border, Icon } = config[prediction];
  const iconSize = size === "sm" ? 10 : 12;
  const textSize = size === "sm" ? "text-[10.5px]" : "text-xs";
  const px = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <span className={`inline-flex items-center gap-1 ${textSize} font-semibold ${px} rounded border ${color} ${bg} ${border} whitespace-nowrap`}>
      <Icon size={iconSize} />
      {prediction}
    </span>
  );
}
