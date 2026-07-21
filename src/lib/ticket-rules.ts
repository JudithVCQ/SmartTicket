import type { Priority, Status } from "./mock-data";

export const STATUS_VALUES: Status[] = [
  "Abierto",
  "En progreso",
  "En espera",
  "Resuelto",
  "Cerrado",
];

export const PRIORITY_VALUES: Priority[] = ["Crítica", "Alta", "Media", "Baja"];

export const CATEGORY_VALUES = [
  "Facturación",
  "Redes",
  "Software",
  "Hardware",
  "Inventario",
  "Capacitación",
];

/** Estados terminales: el SLA deja de correr y se congela. */
const CLOSED_STATUSES: Status[] = ["Resuelto", "Cerrado"];

/** SLA sin resolver para un ticket cerrado o resuelto. */
export const SLA_NOT_APPLICABLE = "—";

const SLA_BY_PRIORITY: Record<Priority, string> = {
  Crítica: "01:00:00",
  Alta: "04:00:00",
  Media: "08:00:00",
  Baja: "24:00:00",
};

const SLA_PROGRESS_BY_PRIORITY: Record<Priority, number> = {
  Crítica: 0.2,
  Alta: 0.15,
  Media: 0.1,
  Baja: 0.05,
};

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUS_VALUES as string[]).includes(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITY_VALUES as string[]).includes(value);
}

export function isClosedStatus(value: unknown): boolean {
  return typeof value === "string" && (CLOSED_STATUSES as string[]).includes(value);
}

/** Objetivo de SLA de una prioridad. Cae a "Media" si la prioridad no es válida. */
export function slaForPriority(priority: unknown): string {
  return SLA_BY_PRIORITY[isPriority(priority) ? priority : "Media"];
}

/** Consumo inicial del SLA (0..1) usado por las barras de progreso de la UI. */
export function slaProgressForPriority(priority: unknown): number {
  return SLA_PROGRESS_BY_PRIORITY[isPriority(priority) ? priority : "Media"];
}

const URGENT_WORDS = [
  "caído",
  "caido",
  "no funciona",
  "urgente",
  "crítico",
  "critico",
  "sunat",
  "facturación",
  "facturacion",
  "no puedo",
];
const HIGH_WORDS = ["error", "falla", "pérdida", "perdida", "lento", "intermitente"];
const LOW_WORDS = [
  "consulta",
  "capacitación",
  "capacitacion",
  "duda",
  "información",
  "informacion",
];

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ["Facturación", ["factura", "boleta", "comprobante", "sunat", "cobro", "pago"]],
  ["Redes", ["red", "wifi", "internet", "vpn", "correo", "router", "conexión", "conexion"]],
  ["Hardware", ["impresora", "teclado", "mouse", "monitor", "pantalla", "terminal", "equipo"]],
  ["Inventario", ["inventario", "stock", "almacén", "almacen", "bodega"]],
  ["Capacitación", ["capacitación", "capacitacion", "entrenamiento", "inducción", "induccion"]],
];

/**
 * Clasificador local por palabras clave. Es el respaldo cuando la IA no está
 * disponible: sin esto un ticket urgente entraría como "Media" y con el SLA
 * equivocado.
 */
export function classifyPriority(text: string): Priority {
  const t = text.toLowerCase();
  if (URGENT_WORDS.some((w) => t.includes(w))) return "Crítica";
  if (HIGH_WORDS.some((w) => t.includes(w))) return "Alta";
  if (LOW_WORDS.some((w) => t.includes(w))) return "Baja";
  return "Media";
}

export function classifyCategory(text: string): string {
  const t = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((w) => t.includes(w))) return category;
  }
  return "Software";
}
