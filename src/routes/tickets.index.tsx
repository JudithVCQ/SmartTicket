import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { statusBadge, priorityBadge, priorityColor, type Status } from "@/lib/mock-data";
import { getAuthSession } from "@/lib/auth-session";
import { getMyTickets, useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/tickets/")({
  head: () => ({
    meta: [
      { title: "Mis tickets — SmartTicket" },
      { name: "description", content: "Historial completo de tus tickets de soporte con estado y prioridad." },
    ],
  }),
  component: TicketsListPage,
});

type Filtro = "Todos" | Status;
const filtros: Filtro[] = ["Todos", "Abierto", "En progreso", "En espera", "Resuelto", "Cerrado"];

function TicketsListPage() {
  const { tickets, deleteTicket } = useTickets();
  const auth = getAuthSession();
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [query, setQuery] = useState("");

  const personalTickets = useMemo(() => getMyTickets(tickets, auth), [tickets, auth]);

  const lista = useMemo(() => {
    return personalTickets.filter((t) => {
      if (filtro !== "Todos" && t.estado !== filtro) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!t.id.toLowerCase().includes(q) && !t.asunto.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [personalTickets, filtro, query]);

  const handleDelete = (id: string, asunto: string) => {
    if (!window.confirm(`¿Eliminar el ticket "${asunto}"? Esta acción no se puede deshacer.`)) return;
    deleteTicket(id);
    toast.success(`Ticket ${id} eliminado.`);
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 animate-reveal">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
              Historial
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Mis tickets</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Trazabilidad completa: cada solicitud, su estado y SLA.
            </p>
          </div>
          <Link
            to="/tickets/new"
            className="px-5 py-2.5 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors self-start md:self-auto"
          >
            Nueva incidencia
          </Link>
        </header>

        <div className="flex flex-wrap gap-2 mb-6">
          {filtros.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest border rounded-sm transition-colors ${
                f === filtro
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
          <div className="ml-auto">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por ID o asunto…"
              className="h-9 px-3 border border-border bg-background rounded-sm text-sm w-64 focus:outline-none focus:border-foreground"
            />
          </div>
        </div>

        <div className="border border-border rounded-sm overflow-hidden bg-card animate-reveal" style={{ animationDelay: "100ms" }}>
          {lista.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-sm text-muted-foreground">No hay tickets que coincidan.</div>
              <Link to="/tickets/new" className="mt-4 inline-block text-xs font-mono uppercase tracking-widest text-primary">
                Crear nueva incidencia →
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Ticket</th>
                  <th className="px-6 py-3 font-medium hidden md:table-cell">Categoría</th>
                  <th className="px-6 py-3 font-medium">Prioridad</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium hidden lg:table-cell">SLA</th>
                  <th className="px-6 py-3 font-medium hidden lg:table-cell">Creado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-1 h-8 ${priorityColor[t.prioridad]}`} />
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] text-muted-foreground">{t.id}</div>
                          <div className="font-medium truncate max-w-xs">{t.asunto}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-muted-foreground">
                      {t.categoria}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${priorityBadge[t.prioridad]}`}
                      >
                        {t.prioridad}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${statusBadge[t.estado]}`}
                      >
                        {t.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell font-mono text-xs">
                      {t.slaRestante}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-muted-foreground text-xs">
                      {t.creadoEn}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <Link
                        to="/tickets/$ticketId"
                        params={{ ticketId: t.id }}
                        className="text-[11px] font-bold uppercase tracking-widest text-primary hover:underline mr-4"
                      >
                        Ver
                      </Link>
                      <button
                        onClick={() => handleDelete(t.id, t.asunto)}
                        className="text-[11px] font-bold uppercase tracking-widest text-destructive hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
