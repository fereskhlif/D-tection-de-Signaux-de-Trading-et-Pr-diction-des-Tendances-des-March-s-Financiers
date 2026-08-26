import { useState, useEffect } from "react";
import { Clock, LogIn, CheckCircle, XCircle, TrendingUp, TrendingDown, Minus, Clock3 } from "lucide-react";
import type { Plan } from "../types";
import { apiFetch } from "../services/api";

interface HistoryProps {
  isLoggedIn: boolean;
  favorites: string[];
  plan: Plan;
  onLogin: () => void;
}

const PredIcon = ({ p }: { p: string }) =>
  p === "Hausse" ? <TrendingUp size={11} className="text-success" /> :
  p === "Baisse" ? <TrendingDown size={11} className="text-danger" /> :
  p === "En attente" ? <Clock3 size={11} className="text-muted-foreground" /> :
  <Minus size={11} className="text-warning" />;

export default function History({ isLoggedIn, onLogin }: HistoryProps) {
  const [filter, setFilter] = useState<"all" | "correct" | "wrong">("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    let statusParam = "";
    if (filter === "correct") statusParam = "?status=correct";
    if (filter === "wrong") statusParam = "?status=wrong";
    
    apiFetch<any>(`/history${statusParam}`)
      .then(res => {
        if (res.status === "error") {
          setError(res.message || "Erreur de chargement");
        } else {
          setData(res.data);
          setError("");
        }
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [isLoggedIn, filter]);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Clock size={26} className="text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-1">Connexion requise</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Connectez-vous pour accéder à l'historique de prédictions de vos actions favorites.
          </p>
        </div>
        <button
          onClick={onLogin}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <LogIn size={15} />
          Se connecter
        </button>
      </div>
    );
  }

  const entries = data?.items || [];
  const total = data?.total || 0;
  const correct = data?.correct || 0;
  const accuracy = data?.accuracy || 0;

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Prédictions", value: String(total), color: "text-foreground" },
          { label: "Correctes", value: String(correct), color: "text-success" },
          { label: "Précision", value: `${accuracy}%`, color: "text-primary" },
        ].map(stat => (
          <div key={stat.label} className="bg-panel border border-border rounded-xl p-3 text-center">
            <p className={`text-xl font-mono font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10.5px] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {[
          { label: "Toutes", value: "all" as const },
          { label: "Correctes", value: "correct" as const },
          { label: "Erronées", value: "wrong" as const },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={[
              "text-xs px-3 py-1.5 rounded-lg border transition-all",
              filter === f.value
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-background border-b border-border">
              <tr>
                {["Ticker", "Date", "Prédiction", "Statut", "Résultat réel", "Confiance"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Chargement de votre historique...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="text-center py-10 text-danger text-sm">{error}</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Aucune prédiction enregistrée</td></tr>
              ) : (
                entries.map((entry: any) => {
                  const isPending = entry.is_correct === null;
                  const isCorrect = entry.is_correct === true;
                  const actualLabel = entry.actual_label || "En attente";
                  const dateStr = new Date(entry.prediction_date).toLocaleDateString();

                  return (
                    <tr key={entry.id} className="border-b border-border hover:bg-card-hover transition-colors">
                      <td className="px-3 py-2.5 font-mono font-bold text-foreground text-[13px]">{entry.ticker}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{dateStr}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-[10.5px]">
                          <PredIcon p={entry.prediction_label} />
                          <span>{entry.prediction_label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-[10.5px]"><Clock3 size={11} />En attente</span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-success text-[10.5px]"><CheckCircle size={11} />Correct</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-danger text-[10.5px]"><XCircle size={11} />Erroné</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-[10.5px]">
                          <PredIcon p={actualLabel} />
                          <span>{actualLabel}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{(entry.confidence * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
