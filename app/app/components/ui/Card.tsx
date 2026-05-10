import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: ReactNode;
}

/**
 * Surface container for grouped content. Has default padding via .card-shell;
 * pass p-0 / p-4 / p-8 to override (e.g. p-0 for tables, p-8 for hero cards).
 * @example <Card>...</Card>
 */
export function Card({ hover = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`card-shell ${hover ? "card-hover" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
