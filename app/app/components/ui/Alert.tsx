import type { ReactNode } from "react";

type AlertVariant = "success" | "warning" | "error" | "info";

interface AlertProps {
  variant?: AlertVariant;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  success: "bg-green-500/10 border-green-500/25 text-green-400",
  warning: "bg-yellow-500/10 border-yellow-500/25 text-yellow-300",
  error: "bg-red-500/10 border-red-500/25 text-red-400",
  info: "bg-accent/10 border-accent/25 text-accent",
};

export function Alert({ variant = "error", icon, className = "", children }: AlertProps) {
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${variantClasses[variant]} ${className}`}>
      {icon && <span className="w-5 h-5 flex-shrink-0 mt-0.5">{icon}</span>}
      <div className="flex-1">{children}</div>
    </div>
  );
}
