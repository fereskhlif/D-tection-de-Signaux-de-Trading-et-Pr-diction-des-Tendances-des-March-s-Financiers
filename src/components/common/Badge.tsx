import type { ReactNode } from "react";

type BadgeVariant = "default" | "primary" | "success" | "danger" | "warning" | "muted" | "premium";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  "bg-secondary text-foreground border border-border",
  primary:  "bg-primary/10 text-primary border border-primary/30",
  success:  "bg-success/10 text-success border border-success/30",
  danger:   "bg-danger/10 text-danger border border-danger/30",
  warning:  "bg-warning/10 text-warning border border-warning/30",
  muted:    "bg-secondary text-muted-foreground border border-border",
  premium:  "bg-warning text-warning-foreground border-0",
};

export function Badge({ variant = "default", children, icon, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}
