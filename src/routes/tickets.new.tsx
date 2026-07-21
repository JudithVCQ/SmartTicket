import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { CATEGORY_OPTIONS, authHeaders, useTickets } from "@/lib/tickets-store";
import { getAuthSession, isStaffSession } from "@/lib/auth-session";

interface Miembro {
  id: string;
  nombre: string;
  rol: string;
}

interface Suggestion {
  deflectionId: string;
  respuesta: string;
  confianza: number;
  referencias: Array<{ id: string; asunto: string }>;
}

export const Route = createFileRoute("/tickets/new")({
  head: () => ({
    meta: [
      { title: "Registrar incidencia — SmartTicket" },
      {
        name: "description",
        content: "Crea un nuevo ticket de soporte. La IA clasificará la prioridad automáticamente.",
      },
    ],
  }),
  component: NewTicketPage,
});

function NewTicketPage() {
  const navigate = useNavigate();
  const { createTicket } = useTickets();
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState(CATEGORY_OPTIONS[0]);
  const [canal, setCanal] = useState("Correo");

  // Quien sólo reporta no elige "cliente": la incidencia es suya. El técnico sí
  // puede registrarla a nombre de otra persona (llamada, visita presencial).
  const staff = isStaffSession();
  const miPerfil = getAuthSession();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [solicitanteId, setSolicitanteId] = useState("");
  const [clienteExterno, setClienteExterno] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [sugerencia, setSugerencia] = useState<Suggestion | null>(null);
  const [sinCoincidencias, setSinCoincidencias] = useState(false);

  useEffect(() => {
    if (!staff) return;
    fetch("/api/org/members", { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMiembros(Array.isArray(data) ? data : []))
      .catch((error) => console.error("Error cargando el equipo:", error));
  }, [staff]);

  const solicitante = miembros.find((m) => m.id === solicitanteId);
  /** Nombre que se guarda en el ticket como "a quién le pasa". */
  const nombreCliente = staff
    ? (solicitante?.nombre ?? clienteExterno)
    : (miPerfil?.fullName ?? "");

  /**
   * Consulta al asistente antes de abrir el ticket. Si el problema ya se
   * resolvió antes en esta organización, el ticket no llega a crearse.
   */
  const buscarSolucion = async () => {
    if (!asunto.trim() && !descripcion.trim()) {
      toast.error("Escribe primero el asunto o la descripción.");
      return;
    }

    setBuscando(true);
    setSugerencia(null);
    setSinCoincidencias(false);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ asunto, descripcion }),
      });
      const data = await res.json();

      if (data?.disponible) {
        setSugerencia(data as Suggestion);
      } else {
        setSinCoincidencias(true);
      }
    } catch {
      setSinCoincidencias(true);
    } finally {
      setBuscando(false);
    }
  };

  /** El usuario confirma que la solución le sirvió: se registra la deflexión. */
  const aceptarSolucion = async () => {
    if (!sugerencia) return;
    try {
      await fetch("/api/ai/deflect", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deflectionId: sugerencia.deflectionId }),
      });
    } catch (error) {
      console.error("No se pudo registrar la deflexión:", error);
    }
    toast.success("Resuelto sin abrir ticket. ¡Eso ahorra tiempo a tu equipo!");
    navigate({ to: "/tickets" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || asunto.length > 120) {
      toast.error("El asunto es obligatorio (máx 120 caracteres).");
      return;
    }
    if (!descripcion.trim() || descripcion.length > 2000) {
      toast.error("Describe el problema (máx 2000 caracteres).");
      return;
    }
    setSubmitting(true);

    try {
      // createTicket registra el ticket en el API y recarga el listado; antes
      // esta pantalla hacía además su propio POST y duplicaba la incidencia.
      const ticket = await createTicket({
        asunto,
        descripcion,
        categoria,
        cliente: nombreCliente,
        // Sólo cuando es alguien de la organización el ticket queda ligado a su
        // cuenta y aparece en "Mis tickets" de esa persona.
        solicitanteId: staff ? solicitanteId || undefined : undefined,
        canal,
        detalle: descripcion,
      });

      toast.success(`Ticket creado — IA: ${ticket.priority}`);
      navigate({ to: "/tickets/$ticketId", params: { ticketId: String(ticket.id) } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Ocurrió un error al procesar el ticket.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10 animate-reveal">
          <Link
            to="/tickets"
            className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← Mis tickets
          </Link>
          <div className="mt-4 text-xs font-mono text-primary uppercase tracking-widest">
            Nueva incidencia
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">
            Reporta lo que está ocurriendo
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Describe el problema con claridad. Nuestra IA asignará prioridad y categoría
            automáticamente para acelerar la atención.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="border border-border bg-card rounded-sm p-8 animate-reveal"
          style={{ animationDelay: "100ms" }}
        >
          <Label>Asunto</Label>
          <input
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            maxLength={120}
            required
            className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground transition-colors"
            placeholder="Ej. Sistema de facturación no responde"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {staff ? (
              <div>
                <Label>¿A quién le ocurre?</Label>
                <select
                  value={solicitanteId}
                  onChange={(e) => setSolicitanteId(e.target.value)}
                  className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm"
                >
                  <option value="">Cliente externo (escribir abajo)</option>
                  {miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                {solicitanteId ? (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Aparecerá en los tickets de {solicitante?.nombre}.
                  </p>
                ) : (
                  <input
                    value={clienteExterno}
                    onChange={(e) => setClienteExterno(e.target.value)}
                    maxLength={120}
                    className="mt-2 w-full h-10 px-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground transition-colors"
                    placeholder="Ej. María Quispe"
                  />
                )}
              </div>
            ) : (
              <div>
                <Label>Reportado por</Label>
                <div className="w-full h-10 px-3 border border-border bg-muted/40 rounded-sm text-sm flex items-center text-muted-foreground">
                  {miPerfil?.fullName || miPerfil?.email || "Tu cuenta"}
                </div>
              </div>
            )}
            <div>
              <Label>Canal de contacto preferente</Label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm"
              >
                <option>Correo</option>
                <option>WhatsApp</option>
                <option>Llamada telefónica</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <Label>Categoría</Label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="mt-6">
            <Label>Descripción detallada</Label>
            <textarea
              rows={6}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={2000}
              required
              className="w-full p-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground transition-colors resize-y"
              placeholder="¿Qué intentabas hacer? ¿Qué mensaje aparece? ¿Desde cuándo ocurre?"
            />
            <div className="text-[10px] font-mono text-muted-foreground mt-1 text-right">
              {descripcion.length}/2000
            </div>
          </div>

          <div className="mt-8 p-4 bg-foreground text-background rounded-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-primary animate-pulse" />
              <div className="text-xs">
                <div className="font-bold uppercase tracking-widest">Asistente IA</div>
                <div className="text-zinc-400">
                  Puede que esto ya se haya resuelto antes en tu empresa. Consúltalo antes de abrir
                  el ticket.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={buscarSolucion}
              disabled={buscando}
              className="px-4 py-2 bg-background text-foreground font-semibold text-xs rounded-sm hover:bg-background/90 disabled:opacity-60 whitespace-nowrap"
            >
              {buscando ? "Buscando…" : "Buscar solución instantánea"}
            </button>
          </div>

          {sinCoincidencias && (
            <div className="mt-4 p-4 border border-border rounded-sm text-sm text-muted-foreground">
              No encontramos un caso anterior parecido. Continúa y un técnico lo atenderá.
            </div>
          )}

          {sugerencia && (
            <div className="mt-4 border border-success/40 bg-success/5 rounded-sm p-5 animate-reveal">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-success font-bold">
                  Posible solución encontrada
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {Math.round(sugerencia.confianza * 100)}% de confianza
                </span>
              </div>

              <p className="text-sm leading-relaxed whitespace-pre-wrap">{sugerencia.respuesta}</p>

              {sugerencia.referencias.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/60">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                    Basado en casos anteriores
                  </div>
                  <ul className="space-y-1">
                    {sugerencia.referencias.map((r) => (
                      <li key={r.id} className="text-xs text-muted-foreground">
                        <span className="font-mono">#{r.id}</span> · {r.asunto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={aceptarSolucion}
                  className="px-4 py-2 bg-success text-background font-semibold text-sm rounded-sm hover:bg-success/90"
                >
                  Me sirvió, no abrir ticket
                </button>
                <button
                  type="button"
                  onClick={() => setSugerencia(null)}
                  className="px-4 py-2 border border-border font-semibold text-sm rounded-sm hover:bg-muted"
                >
                  No me sirve, continuar
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-8">
            <Link
              to="/tickets"
              className="px-5 py-2.5 border border-border font-semibold text-sm rounded-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-foreground text-background font-semibold text-sm rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-60"
            >
              {submitting ? "Enviando…" : "Enviar incidencia"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </span>
  );
}
