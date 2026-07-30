import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  LayoutDashboard, BarChart2, Layers, Target,
  Building2, Clock, Settings, Activity, X, Menu,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/actions", label: "Actions", icon: BarChart2 },
  { path: "/comparison", label: "Comparaison", icon: Layers },
  { path: "/predictions", label: "Prédictions", icon: Target },
  { path: "/sectors", label: "Secteurs", icon: Building2 },
  { path: "/history", label: "Historique", icon: Clock },
  { path: "/settings", label: "Paramètres", icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

function NavItem({ path, label, icon: Icon, exact, onClick }: (typeof NAV_ITEMS)[0] & { onClick?: () => void }) {
  const location = useLocation();
  const isActive = exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <NavLink
      to={path}
      onClick={onClick}
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium",
        "transition-all duration-200 group",
        "border border-transparent",
        isActive
          ? "bg-card-hover text-foreground border-l-2 border-l-primary border-r-0 border-t-0 border-b-0 rounded-l-none"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      ].join(" ")}
    >
      <Icon
        size={15}
        className={isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground transition-colors"}
      />
      {label}
    </NavLink>
  );
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Activity size={16} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">AlphaML</div>
          <div className="text-[10px] text-muted-foreground">Predict Engine v3.2</div>
        </div>
        {/* Mobile close */}
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors md:hidden"
        >
          <X size={14} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.path} {...item} onClick={onClose} />
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-dim flex items-center justify-center text-[11px] font-bold text-foreground">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate">Jean Dupont</div>
            <div className="text-[10px] text-muted-foreground">Analyste</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
          <aside className="relative flex flex-col w-[220px] h-full bg-sidebar border-r border-sidebar-border z-50">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

export function MenuToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border"
    >
      <Menu size={16} />
    </button>
  );
}
