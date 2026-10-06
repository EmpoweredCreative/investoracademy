import type { CriteriaStatus as RatioStatus } from "@/lib/fundamentals/criteria";

const STYLES: Record<RatioStatus, string> = {
  green: "bg-emerald-500 ring-emerald-500/30",
  yellow: "bg-amber-500 ring-amber-500/30",
  red: "bg-red-500 ring-red-500/30",
  gray: "bg-muted ring-muted/30",
};

export function RatioStatusDot({
  status,
  className = "",
}: {
  status: RatioStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${STYLES[status]} ${className}`}
      title={status}
      aria-label={status}
    />
  );
}

export function RygSummary({
  green,
  yellow,
  red,
  gray,
}: {
  green: number;
  yellow: number;
  red: number;
  gray: number;
}) {
  return (
    <span className="text-xs text-muted font-mono">
      {green > 0 && <span className="text-emerald-400">{green}G </span>}
      {yellow > 0 && <span className="text-amber-400">{yellow}Y </span>}
      {red > 0 && <span className="text-red-400">{red}R </span>}
      {gray > 0 && <span>{gray}—</span>}
      {green === 0 && yellow === 0 && red === 0 && gray === 0 && "—"}
    </span>
  );
}
