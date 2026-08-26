import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ComposedChart
} from "recharts";
import type { StockDetailHistory } from "../../types/stockDetail";

interface IndicatorProps {
  data: StockDetailHistory[];
}

export function RsiChart({ data }: IndicatorProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e1e1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
          formatter={(val: number) => [val.toFixed(1), "RSI(14)"]}
          labelStyle={{ display: "none" }}
        />
        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.5} />
        <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
        <Line type="monotone" dataKey="rsi" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MacdChart({ data }: IndicatorProps) {
  const min = Math.min(...data.map(d => Math.min(d.macd || 0, d.macd_signal || 0, d.macd_histogram || 0)));
  const max = Math.max(...data.map(d => Math.max(d.macd || 0, d.macd_signal || 0, d.macd_histogram || 0)));
  const padding = (max - min) * 0.1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
        <XAxis dataKey="date" hide />
        <YAxis domain={[min - padding, max + padding]} tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e1e1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
          formatter={(val: number, name: string) => [val.toFixed(2), name.replace("macd_", "").toUpperCase()]}
          labelStyle={{ display: "none" }}
        />
        <ReferenceLine y={0} stroke="#666" opacity={0.5} />
        <Bar dataKey="macd_histogram">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={(entry.macd_histogram || 0) >= 0 ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
        <Line type="monotone" dataKey="macd" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="macd_signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


