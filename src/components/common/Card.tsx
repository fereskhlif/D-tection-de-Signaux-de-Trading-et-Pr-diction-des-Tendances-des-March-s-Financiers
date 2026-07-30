import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, hover = false, padding = "md", className = "", ...props }: CardProps) {
  return (
    <div
      className={[
        "bg-card border border-border rounded-xl",
        "transition-colors duration-200",
        hover ? "hover:bg-card-hover cursor-pointer" : "",
        paddingClasses[padding],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
