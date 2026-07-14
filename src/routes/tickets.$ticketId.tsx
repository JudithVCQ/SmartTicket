import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { statusBadge, priorityBadge, priorityColor, type Priority, type Status, type TicketComment, type Ticket } from "@/lib/mock-data";
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  useTickets,
} from "@/lib/tickets-store";

export const Route = createFileRoute("/tickets/$ticketId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.ticketId} — SmartTicket` },
      { name: "description", content: "Detalle del ticket: estado, SLA, comentarios y resolución." },
    ],
  }),
  component: TicketDetailPage,
});

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const navigate = useNavigate();
  const { updateTicket, deleteTicket } = useTickets();
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tickets/${ticketId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        // Formatear fecha
        const d = new Date(data.created_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        const creadoEn = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

        setTicket({
          id: data.id,
          asunto: data.subject,
          descripcion: data.description,
          categoria: data.category,
          prioridad: data.priority,
          estado: data.status,
          cliente: data.client,
          empresa: "Demo Soluciones SAC",
          creadoEn: creadoEn,
          tecnico: data.assigned_to ? `Asignado (${data.assigned_to})` : undefined,
          slaRestante: data.sla || "—",
          slaProgress: 0,
          creadoPor: data.client,
          comentarios: [],
        });
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setTicket(null);
        setLoading(false);
      });
  }, [ticketId]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    asunto: "",
    descripcion: "",
    categoria: CATEGORY_OPTIONS[0],
    prioridad: "Media" as Priority,
    estado: "Abierto" as Status,
    tecnico: "",
  });
  const [comentarios, setComentarios] = useState<TicketComment[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState("");

  useEffect(() => {
    if (!ticket) return;
    setForm({
      asunto: ticket.asunto,
      descripcion: ticket.descripcion,
      categoria: ticket.categoria,
      prioridad: ticket.prioridad as Priority,
      estado: ticket.estado as Status,
      tecnico: ticket.tecnico ?? "",
    });
    setComentarios(ticket.comentarios ?? []);
  }, [ticketId, ticket?.asunto, ticket?.descripcion, ticket?.categoria, ticket?.prioridad, ticket?.estado, ticket?.tecnico, ticket?.comentarios]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppNav />
        <main className="max-w-3xl mx-auto px-6 py-24 text-center">
          <div className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-3">
            Cargando ticket...
          </div>
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen">
        <AppNav />
        <main className="max-w-3xl mx-auto px-6 py-24 text-center">
          <div className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-3">
            404 · Ticket no encontrado
          </div>
          <h1 className="text-2xl font-bold">El ticket {ticketId} no existe o fue eliminado.</h1>
          <Link to="/tickets" className="text-primary mt-6 inline-block text-sm font-semibold">
            ← Volver al historial
          </Link>
        </main>
      </div>
    );
  }

  const handleSave = () => {
    if (!form.asunto.trim()) {
      toast.error("El asunto no puede estar vacío.");
      return;
    }
    updateTicket(ticket.id, {
      asunto: form.asunto.trim(),
      descripcion: form.descripcion.trim(),
      categoria: form.categoria,
      prioridad: form.prioridad,
      estado: form.estado,
      tecnico: form.tecnico.trim() || undefined,
    });
    setEditing(false);
    toast.success("Cambios guardados.");
  };

  const handleQuickStatus = (estado: Status) => {
    updateTicket(ticket.id, {
      estado,
      slaProgress: estado === "Resuelto" || estado === "Cerrado" ? 1 : ticket.slaProgress,
      slaRestante: estado === "Resuelto" || estado === "Cerrado" ? "—" : ticket.slaRestante,
    });
    toast.success(`Estado actualizado: ${estado}`);
  };

  const handleDelete = () => {
    if (!window.confirm("¿Eliminar este ticket? Esta acción no se puede deshacer.")) return;
    deleteTicket(ticket.id);
    toast.success(`Ticket ${ticket.id} eliminado.`);
    navigate({ to: "/tickets" });
  };

  const addComment = () => {
    const texto = nuevoComentario.trim();
    if (!texto) return;
    if (texto.length > 1000) {
      toast.error("El comentario es demasiado largo (máx 1000 caracteres).");
      return;
    }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const comment: TicketComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      autor: ticket.creadoPor || ticket.tecnico || "Tú",
      fecha: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      texto,
    };
    updateTicket(ticket.id, {
      comentarios: [...(ticket.comentarios ?? []), comment],
    });
    setComentarios((prev) => [...prev, comment]);
    setNuevoComentario("");
    toast.success("Comentario publicado.");
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <Link to="/tickets" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Mis tickets
        </Link>

        <header className="mt-4 mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 animate-reveal">
          <div className="min-w-0">
            <div className="font-mono text-xs text-primary uppercase tracking-widest mb-2">
              {ticket.id}
            </div>
            {editing ? (
              <input
                value={form.asunto}
                onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))}
                className="text-3xl font-extrabold tracking-tight text-balance w-full bg-transparent border-b border-border focus:outline-none focus:border-foreground"
              />
            ) : (
              <h1 className="text-3xl font-extrabold tracking-tight text-balance">{ticket.asunto}</h1>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${statusBadge[ticket.estado]}`}>
                {ticket.estado}
              </span>
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${priorityBadge[ticket.prioridad]}`}>
                IA: {ticket.prioridad}
              </span>
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-border rounded-sm text-muted-foreground">
                {ticket.categoria}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors"
                >
                  Guardar cambios
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 border border-destructive/60 text-destructive font-semibold text-sm rounded-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
                >
                  Editar
                </button>
                {ticket.estado !== "Resuelto" && ticket.estado !== "Cerrado" && (
                  <button
                    onClick={() => handleQuickStatus("Resuelto")}
                    className="px-4 py-2 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors"
                  >
                    Marcar resuelto
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="border border-border bg-card rounded-sm p-6 relative animate-reveal" style={{ animationDelay: "100ms" }}>
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor[ticket.prioridad]}`} />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                Descripción
              </h2>
              {editing ? (
                <textarea
                  rows={5}
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="w-full p-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground"
                />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.descripcion}</p>
              )}
            </section>

            <section className="border border-border bg-card rounded-sm p-6 animate-reveal" style={{ animationDelay: "150ms" }}>
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                Línea de tiempo
              </h2>
              <ol className="relative border-l border-border pl-6 space-y-6">
                <TimelineItem t={ticket.creadoEn} title="Ticket creado" body={`Reportado por ${ticket.cliente}.`} />
                <TimelineItem
                  t={ticket.creadoEn}
                  title="Clasificación IA"
                  body={`Prioridad ${ticket.prioridad} · Categoría ${ticket.categoria}.`}
                />
                {ticket.tecnico && (
                  <TimelineItem t={ticket.creadoEn} title="Asignado" body={`Atendido por ${ticket.tecnico}.`} />
                )}
                {comentarios.map((c, i) => (
                  <TimelineItem key={i} t={`Hoy ${c.fecha}`} title={`Comentario · ${c.autor}`} body={c.texto} />
                ))}
                {(ticket.estado === "Resuelto" || ticket.estado === "Cerrado") && (
                  <TimelineItem t="Actualizado" title={`Marcado como ${ticket.estado}`} body="Ciclo de atención cerrado." />
                )}
              </ol>
            </section>

            <section className="border border-border bg-card rounded-sm p-6 animate-reveal" style={{ animationDelay: "200ms" }}>
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                Agregar comentario
              </h2>
              <textarea
                rows={4}
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                maxLength={1000}
                placeholder="Escribe una actualización para el cliente o el equipo…"
                className="w-full p-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground"
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={addComment}
                  disabled={!nuevoComentario.trim()}
                  className="px-4 py-2 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 disabled:opacity-50"
                >
                  Publicar
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-6 animate-reveal" style={{ animationDelay: "250ms" }}>
            <div className="border border-border bg-muted/40 rounded-sm p-6">
              <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
                SLA
              </h3>
              <div className="font-mono text-2xl font-bold">{ticket.slaRestante}</div>
              <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full ${ticket.slaProgress > 0.7 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, ticket.slaProgress * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {ticket.slaProgress > 0.7 ? "En riesgo de incumplimiento" : "Dentro del SLA"}
              </p>
            </div>

            {editing ? (
              <div className="border border-border bg-card rounded-sm p-6 space-y-4">
                <SelectField
                  label="Estado"
                  value={form.estado}
                  options={STATUS_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, estado: v as Status }))}
                />
                <SelectField
                  label="Prioridad"
                  value={form.prioridad}
                  options={PRIORITY_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, prioridad: v as Priority }))}
                />
                <SelectField
                  label="Categoría"
                  value={form.categoria}
                  options={CATEGORY_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
                />
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                    Técnico asignado
                  </span>
                  <input
                    value={form.tecnico}
                    onChange={(e) => setForm((f) => ({ ...f, tecnico: e.target.value }))}
                    placeholder="Sin asignar"
                    className="w-full h-9 px-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground"
                  />
                </div>
              </div>
            ) : (
              <>
                <DetailItem label="Cliente" value={ticket.empresa} sub={ticket.cliente} />
                <DetailItem label="Técnico asignado" value={ticket.tecnico ?? "Sin asignar"} />
                <DetailItem label="Categoría" value={ticket.categoria} />
                <DetailItem label="Creado" value={ticket.creadoEn} />

                <div className="border border-border bg-card rounded-sm p-4">
                  <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
                    Cambio rápido de estado
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleQuickStatus(s)}
                        disabled={s === ticket.estado}
                        className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-sm transition-colors ${
                          s === ticket.estado
                            ? "bg-foreground text-background border-foreground cursor-default"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function TimelineItem({ t, title, body }: { t: string; title: string; body: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[31px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{t}</div>
      <div className="font-semibold text-sm mt-0.5">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </li>
  );
}

function DetailItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-b border-border pb-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2 border border-border bg-background rounded-sm text-sm"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
