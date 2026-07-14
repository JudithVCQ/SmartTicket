import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/AppNav";
import { KpiCard } from "@/components/KpiCard";
import { TicketCard } from "@/components/TicketCard";
import { useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/tecnico")({
  head: () => ({
    meta: [
      { title: "Panel técnico — SmartTicket" },
      { name: "description", content: "Cola de atención inteligente con SLA, prioridad IA y métricas operativas." },
    ],
  }),
  component: TecnicoPage,
});

function TecnicoPage() {
  const { tickets } = useTickets();
  const cola = tickets.filter((t) => t.estado !== "Cerrado" && t.estado !== "Resuelto");
  const altas = cola.filter((t) => t.prioridad === "Crítica" || t.prioridad === "Alta").length;
  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-reveal">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
              Panel de Control Técnico
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance">
              Gestión de Incidencias MYPE
            </h1>
          </div>
          <div className="flex gap-3">
            <Link
              to="/tickets/new"
              className="px-5 py-2.5 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors"
            >
              Nueva incidencia
            </Link>
            <button className="px-5 py-2.5 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors">
              Exportar datos
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <KpiCard label="Cumplimiento SLA" value="—" trend="Pendiente de medición" delay={50} />
          <KpiCard label="Tickets activos" value={String(cola.length)} trend={`${altas} con prioridad alta`} delay={100} />
          <KpiCard label="MTTR (horas)" value="—" trend="Se calculará al usar el flujo" delay={150} />
          <KpiCard label="Puntaje CSAT" value="—" trend="Sin valoraciones aún" delay={200} />
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
                  Cuando registres una incidencia, el sistema simulará la priorización IA y la cola operativa aquí.
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
                El sistema evaluará cada incidencia nueva con reglas simuladas de urgencia, impacto y tiempo de respuesta.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
