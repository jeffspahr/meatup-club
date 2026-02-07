import type { ReactNode } from "react";

type BadgeVariant = "accent" | "success" | "danger" | "warning" | "muted";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  accent: "badge-accent",
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  muted: "badge-muted",
};

export function Badge({ variant = "accent", className = "", children }: BadgeProps) {
  return (
    <span className={`badge ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
