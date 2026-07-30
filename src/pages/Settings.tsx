import { useState } from "react";
import { User, Shield, Bell, Palette, Database, LogIn, Crown, LogOut, ChevronRight } from "lucide-react";
import type { Plan } from "../types";

interface SettingsProps {
  isLoggedIn: boolean;
  userName: string;
  plan: Plan;
  onLogin: () => void;
  onLogout: () => void;
  onUpgrade: () => void;
}

interface SectionProps { title: string; icon: React.ElementType; children: React.ReactNode; }
function Section({ title, icon: Icon, children }: SectionProps) {
  return (
    <div className="bg-panel border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-background/50">
        <Icon size={14} className="text-primary" />
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

interface RowProps { label: string; sub?: string; right?: React.ReactNode; onClick?: () => void; danger?: boolean; }
function Row({ label, sub, right, onClick, danger }: RowProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "flex items-center justify-between px-4 py-3.5 text-sm",
        onClick ? "cursor-pointer hover:bg-card-hover transition-colors" : "",
        danger ? "text-danger hover:bg-danger/5" : "text-foreground",
      ].join(" ")}
    >
      <div>
        <p className={`text-[13px] font-medium ${danger ? "text-danger" : "text-foreground"}`}>{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {right ?? (onClick && <ChevronRight size={14} className="text-muted-foreground" />)}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-dim"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

export default function Settings({ isLoggedIn, userName, plan, onLogin, onLogout, onUpgrade }: SettingsProps) {
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [notifSignal, setNotifSignal] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [dataRetention, setDataRetention] = useState("90");

  const planLabel: Record<Plan, string> = {
    visitor: "Visiteur",
    free: "Gratuit",
    premium: "Premium",
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <User size={26} className="text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-1">Accès restreint</h2>
          <p className="text-sm text-muted-foreground max-w-xs">Connectez-vous pour accéder à vos paramètres personnalisés.</p>
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

  return (
    <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto w-full">
      {/* Account header */}
      <div className="bg-panel border border-border rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-lg font-bold text-primary select-none">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{userName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-semibold ${plan === "premium" ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground"}`}>
              {planLabel[plan]}
            </span>
            {plan !== "premium" && (
              <button onClick={onUpgrade} className="text-[10.5px] text-primary hover:underline flex items-center gap-0.5">
                <Crown size={9} />Passer à Premium
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile */}
      <Section title="Profil" icon={User}>
        <Row label="Nom d'utilisateur" sub={userName} right={<span className="text-xs text-muted-foreground font-mono">{userName}</span>} />
        <Row label="Abonnement" sub={`Plan ${planLabel[plan]} actif`} right={
          <span className={`text-xs font-semibold ${plan === "premium" ? "text-warning" : "text-muted-foreground"}`}>{planLabel[plan]}</span>
        } />
        <Row label="Changer le mot de passe" onClick={() => {}} />
      </Section>

      {/* Notifications */}
      <Section title="Notifications" icon={Bell}>
        <Row label="Alertes par e-mail" sub="Recevez les signaux par courriel" right={<Toggle checked={notifEmail} onChange={setNotifEmail} />} />
        <Row label="Notifications push" sub="Dans le navigateur" right={<Toggle checked={notifPush} onChange={setNotifPush} />} />
        <Row label="Alertes de signal" sub="Changements de prédiction détectés" right={<Toggle checked={notifSignal} onChange={setNotifSignal} />} />
      </Section>

      {/* Appearance */}
      <Section title="Apparence" icon={Palette}>
        <Row label="Mode sombre" sub="Interface sombre par défaut" right={<Toggle checked={darkMode} onChange={setDarkMode} />} />
        <Row label="Mode compact" sub="Réduire les espacements du tableau" right={<Toggle checked={compactMode} onChange={setCompactMode} />} />
      </Section>

      {/* Security */}
      <Section title="Sécurité" icon={Shield}>
        <Row label="Authentification à deux facteurs" sub="Inactif — recommandé" onClick={() => {}} />
        <Row label="Sessions actives" sub="1 session ouverte" onClick={() => {}} />
        <Row label="Journal d'activité" onClick={() => {}} />
      </Section>

      {/* Data */}
      <Section title="Données" icon={Database}>
        <Row
          label="Rétention des données"
          sub="Conserver l'historique pendant"
          right={
            <select
              value={dataRetention}
              onChange={e => setDataRetention(e.target.value)}
              className="text-xs bg-secondary border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
              <option value="180">6 mois</option>
              <option value="365">1 an</option>
            </select>
          }
        />
        <Row label="Exporter mes données" sub="Format CSV ou JSON" onClick={() => {}} />
        <Row label="Supprimer mon compte" sub="Action irréversible" onClick={onLogout} danger />
      </Section>

      {/* Logout */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <Row
          label="Se déconnecter"
          onClick={onLogout}
          right={<LogOut size={14} className="text-muted-foreground" />}
        />
      </div>
    </div>
  );
}
