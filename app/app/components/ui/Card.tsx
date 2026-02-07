import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: ReactNode;
}

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
