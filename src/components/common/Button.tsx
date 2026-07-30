import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   "bg-primary text-white hover:bg-primary/90 border border-primary/30",
  secondary: "bg-secondary text-foreground hover:bg-secondary/80 border border-border",
  ghost:     "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground border border-border",
  danger:    "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30",
  success:   "bg-success/10 text-success hover:bg-success/20 border border-success/30",
  warning:   "bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-base px-5 py-2.5 gap-2.5",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center font-medium rounded-lg",
        "transition-all duration-200 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
}
