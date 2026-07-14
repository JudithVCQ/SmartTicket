import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  tickets as seedTickets,
  type Priority,
  type Status,
  type Ticket,
} from "@/lib/mock-data";
import { getAuthSession } from "@/lib/auth-session";

const STORAGE_KEY = "smartticket.tickets.v1";

export interface TicketDraft {
  asunto: string;
  descripcion: string;
  categoria: string;
  cliente?: string;
  empresa?: string;
  canal?: string;
  detalle?: string;
}

interface TicketsContextValue {
  tickets: Ticket[];
  getTicket: (id: string) => Ticket | undefined;
  createTicket: (draft: TicketDraft) => Ticket;
  updateTicket: (id: string, patch: Partial<Ticket>) => Ticket | undefined;
  deleteTicket: (id: string) => void;
  resetTickets: () => void;
}

const TicketsContext = createContext<TicketsContextValue | null>(null);

const URGENT_WORDS = ["caído", "caido", "no funciona", "urgente", "crítico", "critico", "sunat", "facturación", "facturacion", "no puedo"];
const HIGH_WORDS = ["error", "falla", "pérdida", "perdida", "lento", "intermitente"];
const LOW_WORDS = ["consulta", "capacitación", "capacitacion", "duda", "información", "informacion"];

function classifyPriority(text: string): Priority {
  const t = text.toLowerCase();
  if (URGENT_WORDS.some((w) => t.includes(w))) return "Crítica";
  if (HIGH_WORDS.some((w) => t.includes(w))) return "Alta";
  if (LOW_WORDS.some((w) => t.includes(w))) return "Baja";
  return "Media";
}

function slaForPriority(p: Priority): { restante: string; progress: number } {
  switch (p) {
    case "Crítica": return { restante: "01:00:00", progress: 0.2 };
    case "Alta": return { restante: "04:00:00", progress: 0.15 };
    case "Media": return { restante: "08:00:00", progress: 0.1 };
    case "Baja": return { restante: "24:00:00", progress: 0.05 };
  }
}

function nextId(existing: Ticket[]): string {
  const nums = existing
    .map((t) => parseInt(t.id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 2900;
  return `TKT-${max + 1}-PE`;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getCurrentUserIdentity(auth = getAuthSession()) {
  const email = normalize(auth?.email);
  const fullName = auth?.fullName?.trim() || auth?.email?.trim() || "Usuario";
  return { email, fullName };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "default";
}

function getOrgScopeKey() {
  if (typeof window === "undefined") return STORAGE_KEY;
  const auth = getAuthSession();
  const scope = auth?.company?.trim() || auth?.email?.trim() || "default";
  return `${STORAGE_KEY}:${slugify(scope)}`;
}

function loadFromStorage(scopeKey: string): Ticket[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopeKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Ticket[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function seedDemoTickets(scopeKey: string) {
  const auth = getAuthSession();
  if (!auth?.organizationName || !/demo/i.test(auth.organizationName)) {
    return null;
  }

  const organizationName = auth.organizationName;
  const demoUsers = [
    { email: "ana@demoticket.com", name: "Ana Paredes" },
    { email: "bruno@demoticket.com", name: "Bruno Castro" },
    { email: "carla@demoticket.com", name: "Carla Rojas" },
  ];

  const ticketTemplates = [
    { asunto: "Factura electrónica no responde", cliente: "María Quispe", categoria: "Facturación", prioridad: "Crítica" as Priority, estado: "En progreso" as Status, slaRestante: "01:00:00", slaProgress: 0.2, tecnico: "Ana Paredes", descripcion: "El módulo de facturación quedó sin responder al validar comprobantes." },
    { asunto: "Acceso a CRM intermitente", cliente: "Luis Cárdenas", categoria: "Software", prioridad: "Alta" as Priority, estado: "Abierto" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Bruno Castro", descripcion: "La vista de clientes no carga desde la red WiFi del piso 2." },
    { asunto: "Solicitud de capacitación para nuevos usuarios", cliente: "Javier Salas", categoria: "Capacitación", prioridad: "Baja" as Priority, estado: "Abierto" as Status, slaRestante: "24:00:00", slaProgress: 0.05, tecnico: "Carla Rojas", descripcion: "Se solicita una sesión guiada para 3 nuevos contratistas." },
    { asunto: "Router del piso 2 con caída recurrente", cliente: "Sofía Torres", categoria: "Redes", prioridad: "Crítica" as Priority, estado: "En progreso" as Status, slaRestante: "01:00:00", slaProgress: 0.2, tecnico: "Bruno Castro", descripcion: "La red cae cada 20 minutos y afecta varios equipos." },
    { asunto: "Solicitud de reemplazo de teclado", cliente: "Ruben Díaz", categoria: "Hardware", prioridad: "Media" as Priority, estado: "En espera" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Bruno Castro", descripcion: "Un teclado de atención tiene teclas sin responder." },
    { asunto: "CRM presenta fallas al buscar clientes", cliente: "Luis Cárdenas", categoria: "Software", prioridad: "Alta" as Priority, estado: "Abierto" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Carla Rojas", descripcion: "La búsqueda de clientes no devuelve resultados desde la red interna." },
    { asunto: "Inventario no sincroniza con tienda", cliente: "Javier Salas", categoria: "Inventario", prioridad: "Alta" as Priority, estado: "Abierto" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Carla Rojas", descripcion: "La tienda física no refleja los movimientos de stock del sistema." },
    { asunto: "Correo corporativo con retrasos", cliente: "Elena Ríos", categoria: "Redes", prioridad: "Media" as Priority, estado: "En progreso" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Carla Rojas", descripcion: "Los correos salen con 5 a 10 minutos de demora." },
    { asunto: "Consulta de permisos para usuarios temporales", cliente: "Diego Paredes", categoria: "Software", prioridad: "Baja" as Priority, estado: "Abierto" as Status, slaRestante: "24:00:00", slaProgress: 0.05, tecnico: "Ana Paredes", descripcion: "Se necesita asignar permisos para contratistas temporales." },
    { asunto: "No cargan reportes mensuales", cliente: "Patricia Vega", categoria: "Software", prioridad: "Alta" as Priority, estado: "Abierto" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Ana Paredes", descripcion: "El cierre mensual no puede abrirse desde el portal." },
    { asunto: "Pantalla de cobros se congela", cliente: "Renzo Morales", categoria: "Hardware", prioridad: "Media" as Priority, estado: "En espera" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Ana Paredes", descripcion: "La pantalla de cobros se congela al validar una venta." },
    { asunto: "Incidencia con impresora térmica", cliente: "Nora Flores", categoria: "Hardware", prioridad: "Media" as Priority, estado: "Abierto" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Bruno Castro", descripcion: "La impresora térmica no imprime tickets de atención." },
    { asunto: "VPN no conecta desde casa", cliente: "Marco Ponce", categoria: "Redes", prioridad: "Alta" as Priority, estado: "En progreso" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Bruno Castro", descripcion: "El equipo remoto no logra conectarse a la VPN corporativa." },
    { asunto: "Error al subir documentos", cliente: "Katherine Lora", categoria: "Software", prioridad: "Media" as Priority, estado: "Abierto" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Carla Rojas", descripcion: "Al adjuntar archivos PDF aparecen errores de carga." },
    { asunto: "Consulta de inventario por bodega", cliente: "Omar Suárez", categoria: "Inventario", prioridad: "Baja" as Priority, estado: "Abierto" as Status, slaRestante: "24:00:00", slaProgress: 0.05, tecnico: "Carla Rojas", descripcion: "El equipo de bodega necesita ver el stock real del almacén." },
    { asunto: "Correo de ventas llega tarde", cliente: "Cecilia Tello", categoria: "Redes", prioridad: "Media" as Priority, estado: "En espera" as Status, slaRestante: "08:00:00", slaProgress: 0.1, tecnico: "Ana Paredes", descripcion: "Los mensajes de ventas presentan retrasos de varios minutos." },
    { asunto: "Problema con sincronización de caja", cliente: "Eduardo Paredes", categoria: "Software", prioridad: "Alta" as Priority, estado: "Abierto" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Bruno Castro", descripcion: "La caja registra ventas pero no sincroniza el pedido." },
    { asunto: "Se solicita actualización de permisos", cliente: "Fabiola Jiménez", categoria: "Software", prioridad: "Baja" as Priority, estado: "Abierto" as Status, slaRestante: "24:00:00", slaProgress: 0.05, tecnico: "Carla Rojas", descripcion: "Un usuario nuevo necesita acceso al módulo de compras." },
    { asunto: "Monitor de punto de venta con brillo bajo", cliente: "Germán Castañeda", categoria: "Hardware", prioridad: "Baja" as Priority, estado: "Resuelto" as Status, slaRestante: "—", slaProgress: 1, tecnico: "Ana Paredes", descripcion: "El monitor de caja presenta brillo muy bajo." },
    { asunto: "Lento el sistema al emitir boletas", cliente: "Silvia Rojas", categoria: "Software", prioridad: "Alta" as Priority, estado: "En progreso" as Status, slaRestante: "04:00:00", slaProgress: 0.15, tecnico: "Bruno Castro", descripcion: "La emisión de boletas tarda más de lo normal." },
  ];

  return demoUsers.flatMap((user, userIndex) =>
    ticketTemplates.map((template, ticketIndex) => ({
      id: `TKT-${3000 + userIndex * 100 + ticketIndex + 1}-PE`,
      asunto: `${template.asunto}`,
      descripcion: template.descripcion,
      cliente: template.cliente,
      empresa: organizationName,
      categoria: template.categoria,
      prioridad: template.prioridad,
      estado: template.estado,
      slaRestante: template.slaRestante,
      slaProgress: template.slaProgress,
      creadoEn: `2026-07-08 ${String(9 + (ticketIndex % 8)).padStart(2, "0")}:${String(10 + ticketIndex * 3).padStart(2, "0")}`,
      tecnico: template.tecnico,
      creadoPor: user.name,
      creadorEmail: user.email,
    })),
  );
}

function persist(tickets: Ticket[], scopeKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopeKey, JSON.stringify(tickets));
  } catch {
    // ignore quota errors
  }
}

export function getMyTickets(tickets: Ticket[], auth = getAuthSession()) {
  const { email, fullName } = getCurrentUserIdentity(auth);
  return tickets.filter((ticket) => {
    const creatorEmail = normalize(ticket.creadorEmail);
    const creatorName = normalize(ticket.creadoPor);
    const currentEmail = normalize(email);
    const currentName = normalize(fullName);

    if (currentEmail && creatorEmail) {
      return creatorEmail === currentEmail;
    }

    if (currentName && creatorName) {
      return creatorName === currentName;
    }

    return false;
  });
}

export function getUserRanking(tickets: Ticket[]) {
  return Object.entries(
    tickets.reduce<Record<string, { name: string; count: number; open: number }>>((acc, ticket) => {
      const key = ticket.creadorEmail || ticket.creadoPor || "Sin asignar";
      const entry = acc[key] ?? { name: ticket.creadoPor || ticket.creadorEmail || "Sin asignar", count: 0, open: 0 };
      entry.count += 1;
      if (ticket.estado !== "Cerrado" && ticket.estado !== "Resuelto") entry.open += 1;
      acc[key] = entry;
      return acc;
    }, {}),
  )
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>(seedTickets);
  const [scopeKey, setScopeKey] = useState<string>(STORAGE_KEY);

  useEffect(() => {
    const nextScopeKey = getOrgScopeKey();
    setScopeKey(nextScopeKey);

    const stored = loadFromStorage(nextScopeKey);
    const auth = getAuthSession();
    const isCarlaDemoUser = normalize(auth?.email) === "carla@demoticket.com";
    const carlaTicketsCount = (stored ?? []).filter((ticket) => normalize(ticket.creadorEmail) === "carla@demoticket.com" || normalize(ticket.creadoPor) === "carla rojas").length;

    if (stored && (!isCarlaDemoUser || carlaTicketsCount >= 20)) {
      setTickets(stored);
    } else {
      const demoTickets = seedDemoTickets(nextScopeKey);
      if (demoTickets) {
        setTickets(demoTickets);
        persist(demoTickets, nextScopeKey);
      } else {
        setTickets([]);
      }
    }
  }, []);

  useEffect(() => {
    persist(tickets, scopeKey);
  }, [tickets, scopeKey]);

  const getTicket = useCallback(
    (id: string) => tickets.find((t) => t.id === id),
    [tickets],
  );

  const createTicket = useCallback(
    (draft: TicketDraft): Ticket => {
      const prioridad = classifyPriority(`${draft.asunto} ${draft.descripcion}`);
      const sla = slaForPriority(prioridad);
      const auth = getAuthSession();
      const orgName = draft.empresa?.trim() || auth?.company?.trim() || auth?.email?.trim() || "Nueva organización";
      const { email, fullName } = getCurrentUserIdentity(auth);
      const ticket: Ticket = {
        id: nextId(tickets),
        asunto: draft.asunto.trim() || "Sin asunto",
        descripcion: draft.descripcion.trim(),
        cliente: draft.cliente?.trim() || auth?.fullName?.trim() || "Cliente por definir",
        empresa: orgName,
        categoria: draft.categoria || "Software",
        prioridad,
        estado: "Abierto",
        slaRestante: sla.restante,
        slaProgress: sla.progress,
        creadoEn: nowStamp(),
        tecnico: undefined,
        creadoPor: fullName || undefined,
        creadorEmail: email || undefined,
        canal: draft.canal,
        detalle: draft.detalle?.trim() || undefined,
        comentarios: [
          {
            id: `${Date.now()}-init`,
            autor: fullName || "Sistema",
            fecha: nowStamp(),
            texto: `Ticket creado desde ${draft.canal || "el portal"}.`,
          },
        ],
      };
      setTickets((prev) => [ticket, ...prev]);
      return ticket;
    },
    [tickets],
  );

  const updateTicket = useCallback((id: string, patch: Partial<Ticket>) => {
    let updated: Ticket | undefined;
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...patch };
        return updated;
      }),
    );
    return updated;
  }, []);

  const deleteTicket = useCallback((id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resetTickets = useCallback(() => {
    setTickets([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(scopeKey);
    }
  }, [scopeKey]);

  const value = useMemo<TicketsContextValue>(
    () => ({ tickets, getTicket, createTicket, updateTicket, deleteTicket, resetTickets }),
    [tickets, getTicket, createTicket, updateTicket, deleteTicket, resetTickets],
  );

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

export function useTickets() {
  const ctx = useContext(TicketsContext);
  if (!ctx) throw new Error("useTickets must be used within TicketsProvider");
  return ctx;
}

export const STATUS_OPTIONS: Status[] = ["Abierto", "En progreso", "En espera", "Resuelto", "Cerrado"];
export const PRIORITY_OPTIONS: Priority[] = ["Crítica", "Alta", "Media", "Baja"];
export const CATEGORY_OPTIONS = ["Facturación", "Redes", "Software", "Hardware", "Inventario", "Capacitación"];
