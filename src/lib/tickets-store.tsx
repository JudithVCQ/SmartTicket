import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Ticket } from "@/lib/mock-data";
import { getAuthSession, isAuthenticated, subscribeAuthSession } from "@/lib/auth-session";
import { CATEGORY_VALUES, PRIORITY_VALUES, STATUS_VALUES } from "@/lib/ticket-rules";

/** Fila cruda que devuelve POST /api/tickets (nombres de columna, no de UI). */
export interface CreatedTicket {
  id: number | string;
  subject: string;
  category: string;
  priority: string;
  status: string;
}

export interface TicketDraft {
  asunto: string;
  descripcion: string;
  categoria: string;
  /** Nombre de a quién le ocurre. Si se omite, es quien está en sesión. */
  cliente?: string;
  /** Id del solicitante cuando un técnico registra el ticket a nombre de otro. */
  solicitanteId?: string;
  empresa?: string;
  canal?: string;
  detalle?: string;
}

interface TicketsContextValue {
  tickets: Ticket[];
  loading: boolean;
  getTicket: (id: string) => Ticket | undefined;
  createTicket: (draft: TicketDraft) => Promise<CreatedTicket>;
  updateTicket: (id: string, patch: TicketPatch) => Promise<Ticket | null>;
  deleteTicket: (id: string) => Promise<void>;
  refreshTickets: () => Promise<void>;
}

const TicketsContext = createContext<TicketsContextValue | null>(null);

/** La sesión vive en localStorage, así que cada llamada debe adjuntar el token. */
export function authHeaders(extra: Record<string, string> = {}) {
  const token = getAuthSession()?.token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/** Campos que el API acepta en un PATCH; el resto es estado sólo de la UI. */
const PATCHABLE_FIELDS = [
  "asunto",
  "descripcion",
  "categoria",
  "prioridad",
  "estado",
  "tecnico",
  "tecnicoId",
] as const;

/** `tecnicoId: null` desasigna; por eso el patch admite null explícito. */
export type TicketPatch = Omit<Partial<Ticket>, "tecnico" | "tecnicoId"> & {
  tecnico?: string | null;
  tecnicoId?: string | null;
};

function toPatchPayload(patch: TicketPatch) {
  const payload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (patch[field] !== undefined) payload[field] = patch[field];
  }
  return payload;
}

/**
 * El patch usa `null` para desasignar, pero el Ticket de la UI no admite null.
 * Esto traduce un patch a los campos que se pueden fusionar en el estado local.
 */
export function toLocalTicketFields(patch: TicketPatch): Partial<Ticket> {
  return {
    ...patch,
    tecnico: patch.tecnico ?? undefined,
    tecnicoId: patch.tecnicoId ?? undefined,
  };
}

async function readErrorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return typeof body?.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshTickets = useCallback(async () => {
    // Sin sesión no se pide nada: una petición sin token la responde el API en
    // modo demo y devolvería tickets que no son de este usuario.
    if (!isAuthenticated()) {
      setTickets([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/tickets", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error loading tickets from server:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // El provider vive en la raíz y sólo se monta una vez, así que hay que volver
  // a cargar cuando alguien inicia o cierra sesión sin recargar la página.
  useEffect(() => {
    refreshTickets();
    return subscribeAuthSession(() => {
      setLoading(true);
      refreshTickets();
    });
  }, [refreshTickets]);

  const getTicket = useCallback((id: string) => tickets.find((t) => t.id === id), [tickets]);

  const createTicket = useCallback(
    async (draft: TicketDraft): Promise<CreatedTicket> => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          asunto: draft.asunto.trim(),
          descripcion: draft.descripcion.trim(),
          categoria: draft.categoria,
          cliente: draft.cliente?.trim() || getAuthSession()?.fullName || undefined,
          solicitanteId: draft.solicitanteId,
          canal: draft.canal,
        }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "No se pudo crear el ticket."));
      }

      const created = await res.json();
      await refreshTickets();
      return created as CreatedTicket;
    },
    [refreshTickets],
  );

  const updateTicket = useCallback(
    async (id: string, patch: TicketPatch): Promise<Ticket | null> => {
      const payload = toPatchPayload(patch);
      if (Object.keys(payload).length === 0) return null;

      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "No se pudo actualizar el ticket."));
      }

      // El servidor devuelve el ticket ya recalculado (SLA incluido); usarlo
      // evita que la UI muestre valores que la BD no llegó a guardar.
      const body = await res.json().catch(() => ({}));
      const updated = (body?.ticket ?? null) as Ticket | null;
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...(updated ?? toLocalTicketFields(patch)) } : t)),
      );
      return updated;
    },
    [],
  );

  const deleteTicket = useCallback(async (id: string) => {
    const res = await fetch(`/api/tickets/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "No se pudo eliminar el ticket."));
    }
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<TicketsContextValue>(
    () => ({
      tickets,
      loading,
      getTicket,
      createTicket,
      updateTicket,
      deleteTicket,
      refreshTickets,
    }),
    [tickets, loading, getTicket, createTicket, updateTicket, deleteTicket, refreshTickets],
  );

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets() {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used within TicketsProvider");
  return ctx;
}

export const STATUS_OPTIONS = STATUS_VALUES;
export const PRIORITY_OPTIONS = PRIORITY_VALUES;
export const CATEGORY_OPTIONS = CATEGORY_VALUES;
