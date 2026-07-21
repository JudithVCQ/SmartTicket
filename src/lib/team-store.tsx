import { createContext, useContext, useMemo, useState } from "react";

export type TeamRole = "Administrador" | "Supervisor" | "Técnico";
export type TeamStatus = "Activo" | "Inactivo";

export interface TeamMember {
  id: string;
  nombre: string;
  email: string;
  rol: TeamRole;
  especialidad: string;
  estado: TeamStatus;
  resueltos: number;
  slaCumplimiento: number; // 0..100
  csat: number; // 0..5
  creadoEn: string;
}

export interface TeamMemberDraft {
  nombre: string;
  email: string;
  rol: TeamRole;
  especialidad: string;
}

interface TeamContextValue {
  miembros: TeamMember[];
  addMiembro: (draft: TeamMemberDraft) => TeamMember;
  removeMiembro: (id: string) => void;
  toggleEstado: (id: string) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

function nextId(existing: TeamMember[]) {
  const n = existing.length + 1;
  return `TEC-${String(n).padStart(3, "0")}`;
}

const seedMiembros: TeamMember[] = [
  {
    id: "TEC-001",
    nombre: "Carlos Méndez",
    email: "carlos.mendez@smartticket.com",
    rol: "Técnico",
    especialidad: "Redes",
    estado: "Activo",
    resueltos: 142,
    slaCumplimiento: 98,
    csat: 4.9,
    creadoEn: "2024-02-11",
  },
  {
    id: "TEC-002",
    nombre: "Ana Velásquez",
    email: "ana.velasquez@smartticket.com",
    rol: "Técnico Senior" as TeamRole,
    especialidad: "Software",
    estado: "Activo",
    resueltos: 128,
    slaCumplimiento: 96,
    csat: 4.8,
    creadoEn: "2024-03-02",
  },
  {
    id: "TEC-003",
    nombre: "Luis Torres",
    email: "luis.torres@smartticket.com",
    rol: "Técnico",
    especialidad: "Hardware",
    estado: "Activo",
    resueltos: 117,
    slaCumplimiento: 92,
    csat: 4.6,
    creadoEn: "2024-05-19",
  },
  {
    id: "TEC-004",
    nombre: "Patricia Yupanqui",
    email: "patricia.yupanqui@smartticket.com",
    rol: "Supervisor",
    especialidad: "Facturación",
    estado: "Inactivo",
    resueltos: 98,
    slaCumplimiento: 90,
    csat: 4.5,
    creadoEn: "2023-11-07",
  },
];

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [miembros, setMiembros] = useState<TeamMember[]>(seedMiembros);

  const value = useMemo<TeamContextValue>(
    () => ({
      miembros,
      addMiembro: (draft) => {
        const nuevo: TeamMember = {
          id: nextId(miembros),
          nombre: draft.nombre.trim(),
          email: draft.email.trim(),
          rol: draft.rol,
          especialidad: draft.especialidad.trim() || "General",
          estado: "Activo",
          resueltos: 0,
          slaCumplimiento: 100,
          csat: 0,
          creadoEn: new Date().toISOString().slice(0, 10),
        };
        setMiembros((prev) => [nuevo, ...prev]);
        return nuevo;
      },
      removeMiembro: (id) => setMiembros((prev) => prev.filter((m) => m.id !== id)),
      toggleEstado: (id) =>
        setMiembros((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, estado: m.estado === "Activo" ? "Inactivo" : "Activo" } : m,
          ),
        ),
    }),
    [miembros],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}

export const ROLE_OPTIONS: TeamRole[] = ["Administrador", "Supervisor", "Técnico"];
export const ESPECIALIDAD_OPTIONS = [
  "Facturación",
  "Redes",
  "Software",
  "Hardware",
  "Capacitación",
];
