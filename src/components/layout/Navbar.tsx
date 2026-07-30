import { useState } from "react";
import { Bell, Share2, Globe, X, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { MenuToggle } from "./Sidebar";
import type { Alert } from "../../types";

interface NavbarProps {
  onMenuToggle: () => void;
  alerts: Alert[];
  onDismissAlert: (id: string) => void;
}

export function Navbar({ onMenuToggle, alerts, onDismissAlert }: NavbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 h-14 bg-panel border-b border-border shrink-0">
        {/* Left: hamburger on mobile */}
        <div className="flex items-center gap-3">
          <MenuToggle onClick={onMenuToggle} />
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Modèle actif — XGBoost v3.2
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Bell */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(v => !v)}
              className={[
                "relative w-9 h-9 flex items-center justify-center rounded-lg border border-border",
                "text-muted-foreground hover:text-foreground hover:bg-secondary",
                "transition-all duration-200",
                notifOpen ? "bg-secondary text-foreground" : "",
              ].join(" ")}
            >
              <Bell size={15} />
              {alerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger border-2 border-panel" />
              )}
            </button>
          </div>

          <Button variant="ghost" size="sm" icon={<Share2 size={13} />}>
            <span className="hidden sm:inline">Partager</span>
          </Button>

          <Button variant="primary" size="sm" icon={<Globe size={13} />}>
            <span className="hidden sm:inline">Publier</span>
          </Button>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-dim border border-border flex items-center justify-center text-[11px] font-bold text-foreground cursor-pointer hover:border-primary/50 transition-colors">
            JD
          </div>
        </div>
      </header>

      {/* Notification panel */}
      {notifOpen && (
        <div className="fixed top-14 right-4 w-80 bg-panel border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {alerts.length > 0 && (
                <Badge variant="danger">{alerts.length}</Badge>
              )}
            </div>
            <button onClick={() => setNotifOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Bell size={24} className="opacity-30" />
                <span className="text-xs">Aucune notification</span>
              </div>
            ) : (
              alerts.map(alert => {
                const isDown = alert.to === "Baisse";
                return (
                  <div key={alert.id} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDown ? "bg-danger/10" : "bg-success/10"}`}>
                      {isDown ? <TrendingDown size={14} className="text-danger" /> : <TrendingUp size={14} className="text-success" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-bold text-foreground font-mono">{alert.ticker}</span>
                        <span className={`text-[10px] font-semibold ${isDown ? "text-danger" : "text-success"}`}>{alert.to}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Conf. <span className={isDown ? "text-danger" : "text-success"}>{alert.confidence}%</span> · Il y a {alert.timeAgo}
                      </div>
                    </div>
                    <button
                      onClick={() => onDismissAlert(alert.id)}
                      className="text-muted-foreground/50 hover:text-danger transition-colors shrink-0 mt-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {alerts.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border">
              <button
                onClick={() => alerts.forEach(a => onDismissAlert(a.id))}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
              >
                Tout marquer comme lu
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
