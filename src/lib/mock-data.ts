export type Priority = "Crítica" | "Alta" | "Media" | "Baja";
export type Status = "Abierto" | "En progreso" | "En espera" | "Resuelto" | "Cerrado";

export interface TicketComment {
  id: string;
  autor: string;
  fecha: string;
  texto: string;
}

export interface Ticket {
  id: string;
  asunto: string;
  descripcion: string;
  cliente: string;
  empresa: string;
  categoria: string;
  prioridad: Priority;
  estado: Status;
  slaRestante: string;
  slaProgress: number; // 0..1, 1 = vencido
  creadoEn: string;
  tecnico?: string;
  creadoPor?: string;
  creadorEmail?: string;
  comentarios?: TicketComment[];
  canal?: string;
  detalle?: string;
}

export const tickets: Ticket[] = [];

export const tecnicos = [
  { nombre: "Carlos Méndez", resueltos: 142, sla: 98, csat: 4.9 },
  { nombre: "Ana Velásquez", resueltos: 128, sla: 96, csat: 4.8 },
  { nombre: "Luis Torres", resueltos: 117, sla: 92, csat: 4.6 },
  { nombre: "Patricia Yupanqui", resueltos: 98, sla: 90, csat: 4.5 },
];

export const slaPorPrioridad = [
  { prioridad: "Crítica", total: 42, dentro: 39, pct: 92.8 },
  { prioridad: "Alta", total: 86, dentro: 81, pct: 94.2 },
  { prioridad: "Media", total: 154, dentro: 149, pct: 96.7 },
  { prioridad: "Baja", total: 220, dentro: 218, pct: 99.1 },
];

export const categorias = [
  { nombre: "Facturación", tickets: 84, mttr: "3.2h" },
  { nombre: "Redes", tickets: 62, mttr: "5.1h" },
  { nombre: "Software", tickets: 110, mttr: "4.0h" },
  { nombre: "Hardware", tickets: 38, mttr: "6.8h" },
  { nombre: "Capacitación", tickets: 24, mttr: "2.0h" },
];

export const priorityColor: Record<Priority, string> = {
  Crítica: "bg-destructive",
  Alta: "bg-warning",
  Media: "bg-primary",
  Baja: "bg-muted-foreground",
};

export const priorityBadge: Record<Priority, string> = {
  Crítica: "bg-destructive/10 text-destructive border-destructive/20",
  Alta: "bg-warning/10 text-warning border-warning/20",
  Media: "bg-primary/10 text-primary border-primary/20",
  Baja: "bg-muted text-muted-foreground border-border",
};

export const statusBadge: Record<Status, string> = {
  Abierto: "bg-primary/10 text-primary border-primary/20",
  "En progreso": "bg-warning/10 text-warning border-warning/20",
  "En espera": "bg-muted text-muted-foreground border-border",
  Resuelto: "bg-success/10 text-success border-success/20",
  Cerrado: "bg-muted text-muted-foreground border-border",
};
