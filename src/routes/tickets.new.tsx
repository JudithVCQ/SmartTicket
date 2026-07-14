import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { CATEGORY_OPTIONS, useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/tickets/new")({
  head: () => ({
    meta: [
      { title: "Registrar incidencia — SmartTicket" },
      { name: "description", content: "Crea un nuevo ticket de soporte. La IA clasificará la prioridad automáticamente." },
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
  const [cliente, setCliente] = useState("");
  const [canal, setCanal] = useState("Correo");
  const [submitting, setSubmitting] = useState(false);

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
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asunto, descripcion, cliente, canal }),
      });

      if (!res.ok) {
        throw new Error("Error al crear el ticket");
      }

      const ticket = await res.json();
      toast.success(`Ticket creado — IA: ${ticket.priority}`);
      
      // Update local storage so it shows up in UI immediately if needed
      // (though a real app would refetch the list from backend)
      createTicket({ asunto, descripcion, categoria: ticket.category, cliente, canal, detalle: descripcion });
      
      navigate({ to: "/tickets/$ticketId", params: { ticketId: ticket.id.toString() } });
    } catch (error) {
      toast.error("Ocurrió un error al procesar el ticket.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10 animate-reveal">
          <Link to="/tickets" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
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
            <div>
              <Label>Nombre del cliente</Label>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                maxLength={120}
                className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm focus:outline-none focus:border-foreground transition-colors"
                placeholder="Ej. María Quispe"
              />
            </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div>
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
            <div>
              <Label>Detalles adicionales</Label>
              <input
                value={cliente ? `Cliente: ${cliente}` : "Se registrará al crear el ticket"}
                readOnly
                className="w-full h-10 px-3 border border-border bg-background rounded-sm text-sm opacity-80"
                placeholder="Se registrará al crear el ticket"
              />
            </div>
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

          <div className="mt-8 p-4 bg-foreground text-background rounded-sm flex items-center gap-3">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
            <div className="text-xs">
              <div className="font-bold uppercase tracking-widest">Análisis IA</div>
              <div className="text-zinc-400">
                Al enviar, clasificaremos la prioridad y derivaremos al técnico correcto en segundos.
              </div>
            </div>
          </div>

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
