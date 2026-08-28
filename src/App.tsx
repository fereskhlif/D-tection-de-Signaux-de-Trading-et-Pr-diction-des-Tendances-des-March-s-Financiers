import { useState, lazy, Suspense } from "react";
import {
  LayoutDashboard, BarChart2, Layers, Target,
  Building2, Clock, Activity,
  X, TrendingUp, TrendingDown, Minus, Menu,
  LogIn, Star, Crown, LogOut, RefreshCw,
} from "lucide-react";
import type { Plan } from "./types";
import { StocksProvider, useStocksContext } from "./context/StocksContext";

// ── Lazy pages ────────────────────────────────────────────────────────────────
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const StocksPage = lazy(() => import("./pages/Stocks"));
const ComparisonPage = lazy(() => import("./pages/Comparison"));
const PredictionsPage = lazy(() => import("./pages/Predictions"));
const SectorsPage = lazy(() => import("./pages/Sectors"));
const HistoryPage = lazy(() => import("./pages/History"));

const StockDetailsPage = lazy(() => import("./pages/StockDetails"));

type Page = "dashboard" | "stocks" | "comparison" | "predictions" | "sectors" | "history" | "stockDetails";

const NAV: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "stocks", label: "Actions", icon: BarChart2 },
  { id: "comparison", label: "Comparaison", icon: Layers },
  { id: "predictions", label: "Prédictions", icon: Target },
  { id: "sectors", label: "Secteurs", icon: Building2 },
  { id: "history", label: "Historique", icon: Clock },

];

const PAGE_TITLES: Record<Page, { title: string; sub: string }> = {
  dashboard: { title: "Dashboard", sub: "Vue d'ensemble du portefeuille" },
  stocks: { title: "Actions", sub: "Catalogue complet des valeurs suivies" },
  comparison: { title: "Comparaison", sub: "Analyse multi-actifs" },
  predictions: { title: "Prédictions", sub: "Prévisions IA à horizon configurable" },
  sectors: { title: "Secteurs", sub: "Performance et répartition sectorielle" },
  history: { title: "Historique", sub: "Suivi des prédictions passées" },

  stockDetails: { title: "Détails de l'action", sub: "Analyse approfondie" },
};

// ── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({
  view,
  onClose,
  onLogin,
}: {
  view: "login" | "register";
  onClose: () => void;
  onLogin: (name: string, plan: Plan) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">(view);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(name || email.split("@")[0] || "Utilisateur", "free");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-panel border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-primary" />
            <span className="font-bold text-foreground">AlphaML</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-1">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          {mode === "login" ? "Accédez à votre espace personnel" : "Rejoignez AlphaML gratuitement"}
        </p>

        <form onSubmit={handle} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          )}
          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <button type="submit" className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors mt-1">
            {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          {mode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-primary hover:underline"
          >
            {mode === "login" ? "S'inscrire" : "Se connecter"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("Utilisateur");
  const [plan, setPlan] = useState<Plan>("visitor");
  const [authView, setAuthView] = useState<"login" | "register" | null>(null);

  const [favorites, setFavorites] = useState<string[]>(["AAPL", "NVDA", "NVO"]);

  const handleLogin = (name: string, plan: Plan) => {
    setUserName(name);
    setPlan(plan);
    setIsLoggedIn(true);
    setAuthView(null);
  };
  const handleLogout = () => {
    setIsLoggedIn(false);
    setPlan("visitor");
    setUserName("Utilisateur");
  };



  const { title, sub } = PAGE_TITLES[page];

  const PredIcon = ({ p }: { p: string }) =>
    p === "Hausse" ? <TrendingUp size={11} className="text-success" /> :
    p === "Baisse" ? <TrendingDown size={11} className="text-danger" /> :
    <Minus size={11} className="text-warning" />;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={[
        "fixed lg:static inset-y-0 left-0 z-40 w-56 bg-sidebar border-r border-border flex flex-col",
        "transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Activity size={14} className="text-white" />
          </div>
          <span className="font-bold text-foreground tracking-tight">AlphaML</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-muted-foreground hover:text-foreground lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => { setPage(id); setSidebarOpen(false); }}
                className={[
                  "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-150",
                  "border-l-2 text-left",
                  active
                    ? "border-l-primary bg-primary/8 text-foreground font-medium"
                    : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-card-hover",
                ].join(" ")}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* User info / Login */}
        <div className="p-3 border-t border-border">
          {isLoggedIn ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{plan}</p>
              </div>
              <button onClick={handleLogout} title="Déconnexion" className="text-muted-foreground hover:text-danger transition-colors">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthView("login")}
              className="w-full flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-2"
            >
              <LogIn size={14} />
              Se connecter
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar */}
        <header className="h-14 bg-sidebar border-b border-border flex items-center gap-3 px-4 shrink-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            <p className="text-[10.5px] text-muted-foreground truncate hidden sm:block">{sub}</p>
          </div>

          {/* Bouton Actualiser */}
          <RefreshButton />

          {/* Login button (not logged in) */}
          {!isLoggedIn && (
            <button
              onClick={() => setAuthView("login")}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              <LogIn size={12} />
              Connexion
            </button>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<PageLoading />}>
            {page === "dashboard" && (
              <DashboardPage onStockClick={(ticker) => { setSelectedTicker(ticker); setPage("stockDetails"); }} />
            )}
            {page === "stocks" && (
              <StocksPage onStockClick={(ticker) => { setSelectedTicker(ticker); setPage("stockDetails"); }} />
            )}
            {page === "stockDetails" && selectedTicker && (
              <StockDetailsPage ticker={selectedTicker} onBack={() => setPage("stocks")} />
            )}
            {page === "comparison" && <ComparisonPage />}
            {page === "predictions" && <PredictionsPage />}
            {page === "sectors" && <SectorsPage />}
            {page === "history" && (
              <HistoryPage
                isLoggedIn={isLoggedIn}
                favorites={favorites}
                plan={plan}
                onLogin={() => setAuthView("login")}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Auth modal */}
      {authView && (
        <AuthModal
          view={authView}
          onClose={() => setAuthView(null)}
          onLogin={handleLogin}
        />
      )}


    </div>
  );
}

// ── Bouton Actualiser (accède au contexte) ────────────────────────────────────
function RefreshButton() {
  const { refresh, loading, lastUpdated } = useStocksContext();
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 2000);
  };

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      title={timeStr ? `Dernière MAJ : ${timeStr}` : "Actualiser les données"}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw size={12} className={spinning || loading ? "animate-spin" : ""} />
      <span className="hidden sm:inline">Actualiser</span>
    </button>
  );
}

// ── Wrapper principal avec le Provider ────────────────────────────────────────
export default function AppRoot() {
  return (
    <StocksProvider>
      <App />
    </StocksProvider>
  );
}
