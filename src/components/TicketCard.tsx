import { Link } from "@tanstack/react-router";
import { type Ticket, priorityColor, priorityBadge } from "@/lib/mock-data";

export function TicketCard({ ticket, delay = 0 }: { ticket: Ticket; delay?: number }) {
  return (
    <div
      className="group relative p-6 border border-border bg-card rounded-sm hover:border-primary/50 transition-all animate-reveal"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor[ticket.prioridad]}`} />
      <div className="flex justify-between items-start mb-4 gap-4">
        <div className="min-w-0">
          <span className="font-mono text-[10px] text-muted-foreground tracking-tighter">
            ID: {ticket.id}
          </span>
          <h3 className="text-lg font-bold mt-1 tracking-tight text-balance">{ticket.asunto}</h3>
        </div>
        <div
          className={`shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${priorityBadge[ticket.prioridad]}`}
        >
          IA: {ticket.prioridad}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-xl">{ticket.descripcion}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">SLA restante</span>
            <span
              className={`text-sm font-mono font-medium ${ticket.slaProgress > 0.7 ? "text-destructive" : "text-foreground"}`}
            >
              {ticket.slaRestante}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono text-muted-foreground">Cliente</span>
            <span className="text-sm font-medium">{ticket.empresa}</span>
          </div>
        </div>
        <Link
          to="/tickets/$ticketId"
          params={{ ticketId: ticket.id }}
          className="px-4 py-2 border border-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-all rounded-sm"
        >
          Gestionar
        </Link>
      </div>
    </div>
  );
}
