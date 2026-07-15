import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppNav } from "@/components/AppNav";
import { KpiCard } from "@/components/KpiCard";
import { TicketCard } from "@/components/TicketCard";
import { useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/tecnico")({
  head: () => ({
    meta: [
      { title: "Operaciones — SmartTicket" },
      {
        name: "description",
        content: "Cola de atención inteligente con SLA, prioridad IA y métricas operativas.",
      },
    ],
  }),
  component: TecnicoPage,
});

/** Convierte "HH:MM:SS" o "XXh" en horas numéricas */
function slaToHours(sla: string | undefined): number {
  if (!sla) return 24;
  // formato HH:MM:SS
  const hhmmss = sla.match(/^(\d+):(\d+):(\d+)$/);
  if (hhmmss) return parseInt(hhmmss[1]) + parseInt(hhmmss[2]) / 60;
  // formato "24h", "4h", etc.
  const h = sla.match(/^(\d+)h$/i);
  if (h) return parseInt(h[1]);
  return 24;
}

function TecnicoPage() {
  const { tickets } = useTickets();

  const cola = useMemo(
    () => tickets.filter((t) => t.estado !== "Cerrado" && t.estado !== "Resuelto"),
    [tickets],
  );
  const altas = useMemo(
    () => cola.filter((t) => t.prioridad === "Crítica" || t.prioridad === "Alta").length,
    [cola],
  );

  // ── Cumplimiento SLA ─────────────────────────────────────────────────────
  // Un ticket "cumple SLA" si su slaProgress < 1 (no ha vencido) o está resuelto/cerrado.
  const slaTotal = tickets.length;
  const slaCumple = useMemo(() => {
    return tickets.filter((t) => {
      if (t.estado === "Resuelto" || t.estado === "Cerrado") return true;
      return (t.slaProgress ?? 0) < 1;
    }).length;
  }, [tickets]);
  const slaPct = slaTotal > 0 ? Math.round((slaCumple / slaTotal) * 100) : 0;

  // ── MTTR estimado ─────────────────────────────────────────────────────────
  // Media de horas SLA de tickets resueltos/cerrados como aproximación del MTTR
  const resueltos = useMemo(
    () => tickets.filter((t) => t.estado === "Resuelto" || t.estado === "Cerrado"),
    [tickets],
  );
  const mttr = useMemo(() => {
    if (resueltos.length === 0) return null;
    const totalHoras = resueltos.reduce((sum, t) => sum + slaToHours(t.slaRestante), 0);
    return (totalHoras / resueltos.length).toFixed(1);
  }, [resueltos]);

  // ── Puntaje CSAT estimado ─────────────────────────────────────────────────
  // Basado en % de tickets resueltos con prioridad Baja/Media (los más satisfactorios)
  const csatBase = useMemo(() => {
    if (tickets.length === 0) return null;
    const satisfactorios = resueltos.filter(
      (t) => t.prioridad === "Baja" || t.prioridad === "Media",
    ).length;
    // Escala del 1–5: ponderamos resueltos sobre total, ajustado a 5
    const score = Math.min(5, ((resueltos.length / Math.max(tickets.length, 1)) * 5 + (satisfactorios / Math.max(resueltos.length, 1)) * 5) / 2);
    return score.toFixed(1);
  }, [tickets, resueltos]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows = [
      ["ID", "Asunto", "Cliente", "Empresa", "Categoría", "Prioridad", "Estado", "SLA", "Técnico", "Creado"],
      ...tickets.map((t) => [
        t.id,
        t.asunto,
        t.cliente ?? "",
        t.empresa ?? "",
        t.categoria ?? "",
        t.prioridad ?? "",
        t.estado ?? "",
        t.slaRestante ?? "",
        t.tecnico ?? "",
        t.creadoEn ?? "",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `operaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-reveal">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
              Operaciones
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance">
              Gestión de Incidencias
            </h1>
          </div>
          <div className="flex gap-3">
            <Link
              to="/tickets/new"
              className="px-5 py-2.5 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors"
            >
              Nueva incidencia
            </Link>
            <button
              onClick={handleExportCsv}
              className="px-5 py-2.5 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
            >
              Exportar datos
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <KpiCard
            label="Cumplimiento SLA"
            value={slaTotal > 0 ? `${slaPct}%` : "—"}
            trend={
              slaTotal > 0
                ? `${slaCumple} de ${slaTotal} tickets dentro del SLA`
                : "Sin datos suficientes"
            }
            delay={50}
          />
          <KpiCard
            label="Tickets activos"
            value={String(cola.length)}
            trend={`${altas} con prioridad alta`}
            delay={100}
          />
          <KpiCard
            label="MTTR (horas)"
            value={mttr !== null ? `${mttr}h` : "—"}
            trend={
              mttr !== null
                ? `Basado en ${resueltos.length} tickets resueltos`
                : "Sin tickets resueltos aún"
            }
            delay={150}
          />
          <KpiCard
            label="Puntaje CSAT"
            value={csatBase !== null ? `${csatBase}/5` : "—"}
            trend={
              csatBase !== null
                ? `${resueltos.length} tickets completados`
                : "Sin valoraciones aún"
            }
            delay={200}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground">
                Cola de Atención Inteligente
              </h2>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-muted text-[10px] font-mono border border-border rounded-sm">
                  FILTRAR: TODO
                </span>
                <span className="px-2 py-1 bg-muted text-[10px] font-mono border border-border rounded-sm">
                  ORDEN: PRIORIDAD IA
                </span>
              </div>
            </div>
            {cola.length === 0 ? (
              <div className="border border-dashed border-border rounded-sm bg-card p-10 text-center">
                <div className="text-sm font-medium">Tu operación está lista para comenzar.</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Cuando registres una incidencia, el sistema simulará la priorización IA y la cola
                  operativa aquí.
                </p>
              </div>
            ) : (
              cola.map((t, i) => <TicketCard key={t.id} ticket={t} delay={300 + i * 100} />)
            )}
          </div>

          <aside className="space-y-6 animate-reveal" style={{ animationDelay: "500ms" }}>
            <div className="p-6 border border-border bg-foreground text-background rounded-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="size-2 rounded-full bg-primary animate-pulse" />
                <h3 className="font-bold text-sm">Análisis IA Activo</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                El sistema evaluará cada incidencia nueva con reglas simuladas de urgencia, impacto
                y tiempo de respuesta.
              </p>
            </div>

            {tickets.length > 0 && (
              <div className="p-6 border border-border bg-card rounded-sm space-y-3">
                <h3 className="font-bold uppercase tracking-wide text-xs text-muted-foreground">
                  Distribución por estado
                </h3>
                {["Abierto", "En progreso", "En espera", "Resuelto", "Cerrado"].map((estado) => {
                  const count = tickets.filter((t) => t.estado === estado).length;
                  const pct = Math.round((count / tickets.length) * 100);
                  return (
                    <div key={estado}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{estado}</span>
                        <span className="font-mono">{count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
