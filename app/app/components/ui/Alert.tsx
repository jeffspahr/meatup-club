import type { ReactNode } from "react";

type AlertVariant = "success" | "warning" | "error" | "info";

interface AlertProps {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  success: "bg-green-500/10 border-green-500/25 text-green-400",
  warning: "bg-yellow-500/10 border-yellow-500/25 text-yellow-300",
  error: "bg-red-500/10 border-red-500/25 text-red-400",
  info: "bg-accent/10 border-accent/25 text-accent",
};

export function Alert({ variant = "error", className = "", children }: AlertProps) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${variantClasses[variant]} ${className}`}>
      {children}
    </div>
  );
}
