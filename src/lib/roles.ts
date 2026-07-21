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

/** Rutas que un `member` no debe abrir; el guard del router lo manda a sus tickets. */
export const STAFF_ONLY_PATHS = ["/dashboard", "/tecnico", "/equipo", "/organizacion"];

export function canAccessPath(role: Role, pathname: string): boolean {
  if (isStaff(role)) return true;
  return !STAFF_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
