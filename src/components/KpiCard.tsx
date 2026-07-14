export function KpiCard({
  label,
  value,
  trend,
  trendTone = "muted",
  delay = 0,
}: {
  label: string;
  value: string;
  trend?: string;
  trendTone?: "muted" | "success" | "warning" | "danger";
  delay?: number;
}) {
  const toneClass = {
    muted: "text-muted-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[trendTone];

  return (
    <div
      className="p-6 border border-border bg-card rounded-sm animate-reveal"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-xs font-mono text-muted-foreground uppercase mb-4 tracking-wider">
        {label}
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {trend && <div className={`mt-2 text-xs font-medium ${toneClass}`}>{trend}</div>}
    </div>
  );
}
