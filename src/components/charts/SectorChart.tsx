import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import type { SectorStats } from "../../types";

interface SectorChartProps {
  data: SectorStats[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: SectorStats = payload[0].payload;
  return (
    <div className="bg-panel border border-border rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{d.sector}</p>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-4"><span>Performance</span><span className={`font-mono font-bold ${d.performance >= 0 ? "text-success" : "text-danger"}`}>{d.performance >= 0 ? "+" : ""}{d.performance.toFixed(1)}%</span></div>
        <div className="flex justify-between gap-4"><span>Actions</span><span className="text-foreground">{d.count}</span></div>
        <div className="flex justify-between gap-4"><span>Hausse</span><span className="text-success">{d.bullish}</span></div>
        <div className="flex justify-between gap-4"><span>Baisse</span><span className="text-danger">{d.bearish}</span></div>
        <div className="flex justify-between gap-4"><span>Confiance moy.</span><span className="text-foreground">{d.avgConfidence.toFixed(0)}%</span></div>
      </div>
    </div>
  );
};

export function SectorChart({ data }: SectorChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
        <XAxis
          dataKey="sector"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          tickFormatter={v => v.length > 8 ? v.slice(0, 8) + "…" : v}
        />
        <YAxis
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="3 3" />
        <Bar dataKey="performance" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry) => (
            <Cell
              key={entry.sector}
              fill={entry.performance >= 0 ? "var(--color-success)" : "var(--color-danger)"}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
