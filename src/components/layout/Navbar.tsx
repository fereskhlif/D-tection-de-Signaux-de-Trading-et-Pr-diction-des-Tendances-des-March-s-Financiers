import { useState } from "react";
import { Share2, Globe, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { MenuToggle } from "./Sidebar";
interface NavbarProps {
  onMenuToggle: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 h-14 bg-panel border-b border-border shrink-0">
        {/* Left: hamburger on mobile */}
        <div className="flex items-center gap-3">
          <MenuToggle onClick={onMenuToggle} />
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Modèle actif en production
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">

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


    </>
  );
}
