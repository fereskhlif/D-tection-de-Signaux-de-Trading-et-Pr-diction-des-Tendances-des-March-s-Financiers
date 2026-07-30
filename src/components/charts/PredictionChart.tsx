import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  Area, AreaChart,
} from "recharts";
import type { ForecastPoint, PricePoint } from "../../types";

interface PriceHistoryChartProps {
  history: PricePoint[];
  forecast?: ForecastPoint[];
  color?: string;
  ticker?: string;
}

const CHART_COLOR = "var(--color-primary)";

const TooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-panel border border-border rounded-lg p-2.5 shadow-xl text-xs min-w-[130px]">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-mono font-bold text-foreground">${Number(payload[0].value).toFixed(2)}</p>
      {p?.isForecast && (
        <>
          {p.lower != null && <p className="text-muted-foreground">Low: ${p.lower.toFixed(2)}</p>}
          {p.upper != null && <p className="text-muted-foreground">High: ${p.upper.toFixed(2)}</p>}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary mt-1 inline-block">Prévision</span>
        </>
      )}
    </div>
  );
};

export function PriceHistoryChart({ history, forecast = [], color = CHART_COLOR, ticker }: PriceHistoryChartProps) {
  const histData = history.map(p => ({ date: p.date, price: p.close, isForecast: false }));
  const forecastData = forecast.map(p => ({
    date: p.day, price: p.price, lower: p.lower, upper: p.upper, isForecast: true,
  }));
  const junction = histData.length > 0 ? [{
    date: histData[histData.length - 1].date,
    price: histData[histData.length - 1].price,
    isForecast: true,
    lower: histData[histData.length - 1].price,
    upper: histData[histData.length - 1].price,
  }] : [];

  const allData = [...histData, ...junction, ...forecastData];
  const splitDate = histData.length > 0 ? histData[histData.length - 1].date : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={allData} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
          axisLine={false} tickLine={false}
          tickFormatter={v => `$${v.toFixed(0)}`}
          domain={["auto", "auto"]}
          width={55}
        />
        <Tooltip content={<TooltipContent />} />
        {splitDate && (
          <ReferenceLine x={splitDate} stroke="var(--color-border)" strokeDasharray="4 4" />
        )}
        {/* Historical */}
        <Line
          data={histData}
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
        {/* Forecast dotted */}
        {forecastData.length > 0 && (
          <Line
            data={[junction[0], ...forecastData]}
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (!payload.isForecast || payload.lower === payload.upper) return <g key={`dot-${cx}`} />;
              return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill={color} stroke="var(--color-background)" strokeWidth={1.5} />;
            }}
            activeDot={{ r: 3, fill: color }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* Accuracy trend chart */
interface AccuracyPoint { week: string; accuracy: number; }
interface AccuracyChartProps { data: AccuracyPoint[]; }

export function AccuracyChart({ data }: AccuracyChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="acc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
        <XAxis dataKey="week" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} domain={[60, 100]} tickFormatter={v => `${v}%`} />
        <Tooltip
          content={({ active, payload, label }: any) =>
            active && payload?.length ? (
              <div className="bg-panel border border-border rounded-lg p-2 text-xs shadow-xl">
                <p className="text-muted-foreground">{label}</p>
                <p className="font-mono font-bold text-primary">{Number(payload[0].value).toFixed(1)}%</p>
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="accuracy" stroke="var(--color-primary)" strokeWidth={1.5} fill="url(#acc-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
