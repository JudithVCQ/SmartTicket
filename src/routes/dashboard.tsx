import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/AppNav";
import { KpiCard } from "@/components/KpiCard";
import { getAuthSession } from "@/lib/auth-session";
import { getMyTickets, getUserRanking, useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard analítico — SmartTicket" },
      { name: "description", content: "KPIs operativos: cumplimiento SLA, MTTR por categoría, ranking de técnicos y CSAT." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { tickets } = useTickets();
  const auth = getAuthSession();
  const misTickets = getMyTickets(tickets, auth);
  const activos = misTickets.filter((ticket) => ticket.estado !== "Cerrado" && ticket.estado !== "Resuelto");
  const resueltos = misTickets.filter((ticket) => ticket.estado === "Resuelto" || ticket.estado === "Cerrado");
  const prioridadAlta = activos.filter((ticket) => ticket.prioridad === "Crítica" || ticket.prioridad === "Alta").length;
  const ranking = getUserRanking(tickets).slice(0, 5);
  const recientes = [...misTickets].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);

  const handleExportCsv = () => {
    const rows = [
      ["id", "asunto", "cliente", "categoria", "prioridad", "estado", "creadoPor", "creadoEn"],
      ...tickets.map((ticket) => [ticket.id, ticket.asunto, ticket.cliente, ticket.categoria, ticket.prioridad, ticket.estado, ticket.creadoPor ?? "", ticket.creadoEn]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
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
              Inicio
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Panel de operaciones</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Visión consolidada del rendimiento operativo del último periodo y del trabajo de tu equipo.
            </p>
          </div>
          <div className="flex gap-3">
            <select className="h-10 px-3 border border-border bg-background text-sm rounded-sm">
              <option>Últimos 30 días</option>
              <option>Últimos 7 días</option>
              <option>Este trimestre</option>
            </select>
            <button
              onClick={handleExportCsv}
              className="px-5 py-2.5 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
            >
              Exportar CSV
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <KpiCard label="Tus tickets" value={String(misTickets.length)} trend={misTickets.length ? `${misTickets.length} creados por ti` : "Sin tickets personales"} delay={50} />
          <KpiCard label="Abiertos" value={String(activos.length)} trend={activos.length ? `${activos.length} en curso` : "Todo al día"} delay={100} />
          <KpiCard label="Prioridad alta" value={String(prioridadAlta)} trend={prioridadAlta ? `${prioridadAlta} requieren seguimiento rápido` : "Sin incidencias críticas"} delay={150} />
          <KpiCard label="Organización" value={String(tickets.length)} trend={tickets.length ? "Tickets compartidos de tu empresa" : "Aún no hay tickets"} delay={200} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="border border-border bg-card rounded-sm p-8 animate-reveal" style={{ animationDelay: "250ms" }}>
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-4">
              Tus tickets personales
            </h2>
            {misTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground max-w-2xl">
                Aún no tienes tickets registrados. Cuando crees una incidencia, aparecerá aquí.
              </p>
            ) : (
              <div className="space-y-3">
                {recientes.map((ticket) => (
                  <div key={ticket.id} className="flex flex-col gap-1 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{ticket.asunto}</div>
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{ticket.estado}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {ticket.cliente} • {ticket.categoria} • {ticket.prioridad}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border border-border bg-card rounded-sm p-8 animate-reveal" style={{ animationDelay: "300ms" }}>
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-4">
              Ranking de usuarios
            </h2>
            <div className="space-y-3">
              {ranking.map((user, index) => (
                <div key={user.key} className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
                  <div>
                    <div className="font-semibold">#{index + 1} {user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.count} tickets • {user.open} abiertos</div>
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{user.count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
