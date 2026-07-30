import type { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
  error?: string;
}

export function Input({ label, icon, iconRight, error, className = "", ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</label>}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-muted-foreground pointer-events-none">{icon}</span>
        )}
        <input
          className={[
            "w-full bg-secondary border border-border rounded-lg text-foreground",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30",
            "transition-all duration-200",
            "text-sm px-3 py-2",
            icon ? "pl-9" : "",
            iconRight ? "pr-9" : "",
            error ? "border-danger/60" : "",
            className,
          ].join(" ")}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3 text-muted-foreground">{iconRight}</span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
