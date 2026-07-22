/**
 * Roles dentro de una organización.
 *
 * - owner  : administra la organización (configuración, equipo, invitaciones).
 * - tech   : atiende la cola. Ve todos los tickets de la organización.
 * - member : reporta incidencias. Sólo ve las suyas y no accede a operaciones.
 *
 * Los valores coinciden con los que ya venía guardando `users.role`, así que no
 * hace falta migrar datos existentes.
 */
export type Role = "owner" | "tech" | "member";

export const ROLE_VALUES: Role[] = ["owner", "tech", "member"];

/** Rol por defecto de quien se une a una organización que ya existe. */
export const DEFAULT_ROLE: Role = "member";

export function normalizeRole(value: unknown): Role {
  return typeof value === "string" && (ROLE_VALUES as string[]).includes(value)
    ? (value as Role)
    : DEFAULT_ROLE;
}

/** Personal de soporte: ve la cola completa, las métricas y las funciones de IA operativas. */
export function isStaff(role: Role): boolean {
  return role === "owner" || role === "tech";
}

export function isOwner(role: Role): boolean {
  return role === "owner";
}

/** Configurar la empresa y ver su organigrama es cosa de quien la administra. */
export const OWNER_ONLY_PATHS = ["/organizacion", "/organigrama"];

/** Pantallas de operación: fuera del alcance de quien sólo reporta incidencias. */
export const STAFF_ONLY_PATHS = ["/dashboard", "/tecnico", "/equipo"];

function matches(paths: string[], pathname: string) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function canAccessPath(role: Role, pathname: string): boolean {
  if (matches(OWNER_ONLY_PATHS, pathname)) return isOwner(role);
  if (matches(STAFF_ONLY_PATHS, pathname)) return isStaff(role);
  return true;
}
