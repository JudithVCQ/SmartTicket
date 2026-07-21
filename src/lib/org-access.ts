import { getAuthenticatedUser } from "./auth";
import { query, AppEnv } from "./db";
import { isStaff, normalizeRole, type Role } from "./roles";

export interface AccessDenial {
  status: number;
  message: string;
}

export interface Actor {
  /** null cuando la petición llega sin sesión. */
  userId: number | null;
  organizationId: number;
  role: Role;
  /** Personal de soporte: ve la cola completa y las funciones operativas. */
  staff: boolean;
}

/**
 * Identidad efectiva de quien hace la petición.
 *
 * Sin sesión se devuelve el actor de demo (organización 1 con permisos de
 * staff), que es el comportamiento con el que ya funcionaban el API público de
 * pruebas y los tests de caja negra.
 */
export async function getActor(request: Request, env: AppEnv): Promise<Actor> {
  const user = getAuthenticatedUser(request, env);
  if (!user) {
    return { userId: null, organizationId: 1, role: "owner", staff: true };
  }

  const userRes = await query(env, "SELECT organization_id, role FROM users WHERE id = $1", [
    user.id,
  ]);
  if ((userRes.rowCount ?? 0) === 0) {
    return { userId: user.id, organizationId: 1, role: "member", staff: false };
  }

  const role = normalizeRole(userRes.rows[0].role);
  return {
    userId: user.id,
    organizationId: (userRes.rows[0].organization_id as number) ?? 1,
    role,
    staff: isStaff(role),
  };
}

/** Organización del usuario autenticado; la primera si no hay sesión (modo demo). */
export async function resolveOrganizationId(request: Request, env: AppEnv): Promise<number> {
  return (await getActor(request, env)).organizationId;
}

/**
 * Protección de acceso a un ticket concreto. Devuelve el motivo del rechazo, o
 * null si el acceso es legítimo. Cubre dos casos:
 *  - IDOR entre organizaciones (cualquier rol).
 *  - Un `member` que intenta abrir un ticket que no reportó ni registró.
 *
 * Se responde 404 en vez de 403 cuando el ticket es de otro solicitante de la
 * misma organización: un 403 confirmaría que ese ticket existe.
 */
export async function checkTicketAccess(
  request: Request,
  env: AppEnv,
  ticketId: number,
): Promise<AccessDenial | null> {
  // Sin sesión no se consulta nada: es el modo demo del API público.
  if (!getAuthenticatedUser(request, env)) return null;

  const ticketRes = await query(
    env,
    "SELECT organization_id, requester_id, created_by FROM tickets WHERE id = $1",
    [ticketId],
  );
  if (ticketRes.rowCount === 0) {
    return { status: 404, message: "Ticket no encontrado" };
  }

  const ticket = ticketRes.rows[0];
  const actor = await getActor(request, env);

  if (ticket.organization_id !== actor.organizationId) {
    return { status: 403, message: "No autorizado (Acceso prohibido)" };
  }

  if (!actor.staff) {
    const esSuyo = ticket.requester_id === actor.userId || ticket.created_by === actor.userId;
    if (!esSuyo) {
      return { status: 404, message: "Ticket no encontrado" };
    }
  }

  return null;
}

/** Rechaza a quien no es personal de soporte. */
export function requireStaff(actor: Actor): AccessDenial | null {
  return actor.staff
    ? null
    : { status: 403, message: "Esta acción es sólo para el equipo de soporte" };
}
