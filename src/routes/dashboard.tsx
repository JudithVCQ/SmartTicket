import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppNav } from "@/components/AppNav";
import { KpiCard } from "@/components/KpiCard";
import { useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard analítico — SmartTicket" },
      {
        name: "description",
        content:
          "KPIs operativos: cumplimiento SLA, MTTR por categoría, ranking de técnicos y CSAT.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { tickets } = useTickets();

  const activos = useMemo(
    () => tickets.filter((t) => t.estado !== "Cerrado" && t.estado !== "Resuelto"),
    [tickets],
  );
  const resueltos = useMemo(
    () => tickets.filter((t) => t.estado === "Resuelto" || t.estado === "Cerrado"),
    [tickets],
  );
  const prioridadAlta = useMemo(
    () => activos.filter((t) => t.prioridad === "Crítica" || t.prioridad === "Alta").length,
    [activos],
  );

  // Ranking: agrupar por técnico asignado
  const ranking = useMemo(() => {
    const map: Record<string, { name: string; count: number; open: number }> = {};
    for (const t of tickets) {
      const key = t.tecnico || "Sin asignar";
      if (!map[key]) map[key] = { name: key, count: 0, open: 0 };
      map[key].count += 1;
      if (t.estado !== "Cerrado" && t.estado !== "Resuelto") map[key].open += 1;
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [tickets]);

  // Últimos 5 tickets recientes
  const recientes = useMemo(
    () =>
      [...tickets]
        .sort((a, b) => {
          const na = Number(a.id);
          const nb = Number(b.id);
          if (!isNaN(na) && !isNaN(nb)) return nb - na;
          return b.id.localeCompare(a.id);
        })
        .slice(0, 5),
    [tickets],
  );

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
              Visión consolidada del rendimiento operativo del último periodo y del trabajo de tu
              equipo.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportCsv}
              className="px-5 py-2.5 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
            >
              Exportar CSV
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <KpiCard
            label="Total tickets"
            value={String(tickets.length)}
            trend={tickets.length ? `${tickets.length} en tu organización` : "Sin tickets aún"}
            delay={50}
          />
          <KpiCard
            label="Abiertos"
            value={String(activos.length)}
            trend={activos.length ? `${activos.length} en curso` : "Todo al día"}
            delay={100}
          />
          <KpiCard
            label="Prioridad alta"
            value={String(prioridadAlta)}
            trend={
              prioridadAlta
                ? `${prioridadAlta} requieren atención rápida`
                : "Sin incidencias críticas"
            }
            delay={150}
          />
          <KpiCard
            label="Resueltos"
            value={String(resueltos.length)}
            trend={
              tickets.length > 0
                ? `${Math.round((resueltos.length / tickets.length) * 100)}% de resolución`
                : "Sin datos"
            }
            delay={200}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal"
            style={{ animationDelay: "250ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-4">
              Tickets recientes de la organización
            </h2>
            {recientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay tickets registrados. Cuando crees una incidencia, aparecerá aquí.
              </p>
            ) : (
              <div className="space-y-3">
                {recientes.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold truncate max-w-xs">{t.asunto}</div>
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        {t.estado}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t.cliente} • {t.categoria} • {t.prioridad}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal"
            style={{ animationDelay: "300ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-4">
              Ranking por técnico
            </h2>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin técnicos asignados aún.</p>
            ) : (
              <div className="space-y-3">
                {ranking.map((user, index) => (
                  <div
                    key={user.name}
                    className="flex items-center justify-between rounded-sm border border-border px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold">
                        #{index + 1} {user.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {user.count} tickets • {user.open} abiertos
                      </div>
                    </div>
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {user.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
