import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "core" | "speculation" | "freeMoney";
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const variantClasses = {
    default: "bg-border/50 text-muted",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    danger: "bg-danger/10 text-danger border-danger/20",
    core: "bg-core/10 text-core border-core/20",
    speculation: "bg-speculation/10 text-speculation border-speculation/20",
    freeMoney: "bg-free-money/10 text-free-money border-free-money/20",
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function wheelCategoryBadgeVariant(category: string): BadgeProps["variant"] {
  switch (category) {
    case "CORE":
      return "core";
    case "SPECULATION":
      return "speculation";
    case "RISK_FREE_MONEY":
      return "freeMoney";
    default:
      return "default";
  }
}
