import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPrice } from "../../utils/helpers";
import type { StockDetailHistory } from "../../types/stockDetail";

const Candlestick = (props: any) => {
  const {
    x,
    y,
    width,
    height,
    open,
    close,
    high,
    low,
  } = props;
  
  if (!x || !y) return null;

  const isUp = close >= open;
  const color = isUp ? "#22c55e" : "#ef4444"; // success or danger
  
  // y is the top of the bar (max of open/close in SVG coordinates, because Y grows downwards)
  // height is the absolute difference between open and close in SVG coords.
  const barTop = Math.min(props.yOpen, props.yClose);
  const barBottom = Math.max(props.yOpen, props.yClose);
  const barHeight = Math.max(barBottom - barTop, 2); // min 2px height
  
  // Wick coordinates
  const xCenter = x + width / 2;
  
  return (
    <g>
      {/* Wick */}
      <line
        x1={xCenter}
        y1={props.yHigh}
        x2={xCenter}
        y2={props.yLow}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Body */}
      <rect
        x={x}
        y={barTop}
        width={width}
        height={barHeight}
        fill={isUp ? color : "transparent"}
        stroke={color}
        strokeWidth={1.5}
      />
    </g>
  );
};

interface Props {
  data: StockDetailHistory[];
  showSma20?: boolean;
  showSma50?: boolean;
  showBollinger?: boolean;
}

export function CandlestickChart({ data, showSma20 = true, showSma50 = true, showBollinger = true }: Props) {
  // Pre-process data for the custom shape
  const processed = data.map(d => ({
    ...d,
    candle: [d.low, d.high], // Just needed to force Y-axis range
    // We pass raw values to be transformed by Recharts internals
  }));

  const min = Math.min(...data.map(d => Math.min(d.low, d.bb_lower || d.low)));
  const max = Math.max(...data.map(d => Math.max(d.high, d.bb_upper || d.high)));
  const padding = (max - min) * 0.05;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={processed} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#888" }}
          tickMargin={10}
          minTickGap={30}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
        />
        <YAxis
          domain={[min - padding, max + padding]}
          tick={{ fontSize: 10, fill: "#888" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${formatPrice(v)}`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e1e1e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
          itemStyle={{ color: "#eee" }}
          labelStyle={{ color: "#aaa", marginBottom: 5 }}
          formatter={(value: any, name: string) => {
            if (name === "candle") return null;
            return [`$${formatPrice(Number(value))}`, name.toUpperCase()];
          }}
        />
        
        {showBollinger && <Line type="monotone" dataKey="bb_upper" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 4" />}
        {showBollinger && <Line type="monotone" dataKey="bb_lower" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 4" />}
        {showSma50 && <Line type="monotone" dataKey="sma50" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
        {showSma20 && <Line type="monotone" dataKey="sma20" stroke="#a855f7" strokeWidth={1.5} dot={false} />}

        {/* The bar represents the candlestick */}
        <Bar
          dataKey="candle"
          shape={(props: any) => {
            // Recharts gives us the payload inside props.payload
            const d = props.payload;
            // But we need the y-coordinates for open, close, high, low.
            // Since Bar only automatically computes y for its dataKey (which is an array [low, high] here), 
            // we have to manually map the other values using the yAxis scale.
            const yAxis = props.yAxis;
            return (
              <Candlestick
                {...props}
                open={d.open}
                close={d.close}
                yOpen={yAxis.scale(d.open)}
                yClose={yAxis.scale(d.close)}
                yHigh={yAxis.scale(d.high)}
                yLow={yAxis.scale(d.low)}
              />
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
