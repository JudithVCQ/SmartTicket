import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  registerUser,
  loginUser,
  verifyUser,
  getProfile,
  updateProfile,
  getAuthenticatedUser,
} from "./lib/auth";
import { ensureSchema, query } from "./lib/db";
import { categorizeTicketWithAi } from "./lib/ai";
import { checkTicketAccess, getActor, requireStaff } from "./lib/org-access";
import {
  acceptDeflection,
  draftReply,
  getBriefing,
  getIncidents,
  routeTicket,
  suggestResolution,
} from "./lib/ai-service";
import {
  SLA_NOT_APPLICABLE,
  classifyCategory,
  classifyPriority,
  isClosedStatus,
  isPriority,
  isStatus,
  slaForPriority,
  slaProgressForPriority,
} from "./lib/ticket-rules";

export type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleAuthApi(request: Request, env: unknown) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = `${url.protocol}//${url.host}`;
  const appEnv = env as Record<string, string>;

  if (pathname === "/api/auth/register" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const response = await registerUser(payload, appEnv, origin);
    return jsonResponse(response.body, response.status);
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const response = await loginUser(payload, appEnv);
    const headers: Record<string, string> = {};
    if ("cookie" in response && typeof response.cookie === "string") {
      headers["Set-Cookie"] = response.cookie;
    }
    return jsonResponse(response.body, response.status, headers);
  }

  if (pathname === "/api/auth/verify" && request.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    const result = await verifyUser(token, appEnv);
    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Verificación de correo — SmartTicket</title>
          <style>
            body { margin: 0; font-family: Inter, system-ui, sans-serif; background:#f8fafc; color:#0f172a; display:flex; min-height:100vh; align-items:center; justify-content:center; }
            .card { width:min(100%, 520px); padding:32px; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 24px 64px rgba(15,23,42,.08); }
            h1 { margin:0 0 16px; font-size:24px; }
            p { margin:0 0 24px; line-height:1.75; color:#475569; }
            a { display:inline-block; padding:12px 20px; background:#111827; color:#fff; text-decoration:none; border-radius:10px; }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>${result.ok ? "Correo verificado" : "Verificación fallida"}</h1>
            <p>${result.message}</p>
            <a href="/login">Ir a iniciar sesión</a>
          </main>
        </body>
      </html>
    `;
    return htmlResponse(html, result.ok ? 200 : 400);
  }

  if (pathname === "/api/auth/profile" && request.method === "GET") {
    const response = await getProfile(request, appEnv);
    return jsonResponse(response.body, response.status);
  }

  if (pathname === "/api/auth/profile" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const response = await updateProfile(request, payload, appEnv);
    return jsonResponse(response.body, response.status);
  }

  if (pathname === "/api/auth/forgot-password" && request.method === "POST") {
    return jsonResponse({
      message:
        "Si existe el correo, recibirás un enlace próximamente. Revisa Gmail para continuar.",
    });
  }

  return null;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

/** Fila de `tickets` con los nombres ya resueltos por los LEFT JOIN. */
type TicketRow = {
  id: number | string;
  subject: string;
  description?: string | null;
  client?: string | null;
  category?: string | null;
  priority?: string | null;
  status?: string | null;
  sla?: string | null;
  assigned_to?: number | null;
  created_at?: string | Date | null;
  organization_name?: string | null;
  technician_name?: string | null;
  technician_email?: string | null;
};

/** Traduce una fila de `tickets` al Ticket que consume la UI. */
function mapTicketRow(row: TicketRow) {
  const closed = isClosedStatus(row.status);
  return {
    id: row.id.toString(),
    asunto: row.subject,
    descripcion: row.description || "",
    cliente: row.client || "",
    empresa: row.organization_name || "",
    categoria: row.category || "Software",
    prioridad: row.priority,
    estado: row.status,
    // Un ticket resuelto o cerrado ya no tiene SLA corriendo.
    slaRestante: closed ? SLA_NOT_APPLICABLE : row.sla || slaForPriority(row.priority),
    slaProgress: closed ? 1 : slaProgressForPriority(row.priority),
    creadoEn: row.created_at
      ? new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ")
      : "",
    tecnico: row.technician_name || undefined,
    tecnicoId: row.assigned_to != null ? String(row.assigned_to) : undefined,
    tecnicoEmail: row.technician_email || undefined,
  };
}

export const COMMENT_MAX_LENGTH = 1000;

type CommentRow = {
  id: number | string;
  author_name: string;
  body: string;
  created_at?: string | Date | null;
};

/** Traduce una fila de `ticket_comments` al TicketComment que consume la UI. */
function mapCommentRow(row: CommentRow) {
  return {
    id: row.id.toString(),
    autor: row.author_name,
    fecha: row.created_at
      ? new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ")
      : "",
    texto: row.body,
  };
}

/** Protección IDOR de GET/PATCH/DELETE sobre un ticket concreto, como Response. */
async function denyTicketAccess(
  request: Request,
  appEnv: Record<string, string>,
  ticketId: number,
): Promise<Response | null> {
  const denial = await checkTicketAccess(request, appEnv, ticketId);
  return denial ? jsonResponse({ message: denial.message }, denial.status) : null;
}

/**
 * Nuevo SLA tras un PATCH, o undefined si no hay que tocarlo:
 * - al resolver o cerrar, el SLA se congela;
 * - al cambiar la criticidad, se recalcula con el objetivo de esa prioridad;
 * - al reabrir un ticket cerrado, se restaura desde su prioridad guardada.
 */
async function resolveNextSla(
  appEnv: Record<string, string>,
  ticketId: number,
  estado: unknown,
  prioridad: unknown,
): Promise<string | undefined> {
  if (estado !== undefined && isClosedStatus(estado)) return SLA_NOT_APPLICABLE;
  if (prioridad !== undefined) return slaForPriority(prioridad);
  if (estado === undefined) return undefined;

  const current = await query(appEnv, "SELECT priority, status FROM tickets WHERE id = $1", [
    ticketId,
  ]);
  const row = current?.rows?.[0];
  return row && isClosedStatus(row.status) ? slaForPriority(row.priority) : undefined;
}

/** GET /api/org/members: personas de la organización, para registrar a nombre de otro. */
/**
 * Últimas veces que alguien del equipo cambió la prioridad que había puesto la
 * IA. Se le devuelven como ejemplos para que aprenda el criterio de urgencia de
 * esa empresa, que no es el mismo en todas.
 */
async function getPriorityCorrections(appEnv: Record<string, string>, request: Request) {
  // Sin sesión no sabemos a qué organización pertenece quien reporta, así que
  // no hay criterio propio del que aprender.
  if (!getAuthenticatedUser(request, appEnv)) return [];

  try {
    const actor = await getActor(request, appEnv);
    const result = await query(
      appEnv,
      `SELECT subject, ai_priority, priority FROM tickets
       WHERE organization_id = $1
         AND ai_priority IS NOT NULL
         AND priority <> ai_priority
       ORDER BY updated_at DESC LIMIT 8`,
      [actor.organizationId],
    );
    return result.rows.map((row) => ({
      asunto: row.subject as string,
      sugerida: row.ai_priority as string,
      corregida: row.priority as string,
    }));
  } catch (error) {
    // El aprendizaje es una mejora, no un requisito: si falla se clasifica igual.
    console.error("No se pudieron leer las correcciones de prioridad:", error);
    return [];
  }
}

async function handleOrgApi(request: Request, env: unknown) {
  const url = new URL(request.url);
  const appEnv = env as Record<string, string>;

  if (url.pathname !== "/api/org/members" || request.method !== "GET") return null;

  try {
    await ensureSchema(appEnv);

    const actor = await getActor(request, appEnv);
    const denegado = requireStaff(actor);
    if (denegado) return jsonResponse({ message: denegado.message }, denegado.status);

    const result = await query(
      appEnv,
      `SELECT u.id, u.full_name, u.email, u.role,
              COUNT(*) FILTER (
                WHERE t.assigned_to = u.id AND t.status NOT IN ('Resuelto', 'Cerrado')
              ) AS abiertos_asignados,
              COUNT(*) FILTER (WHERE t.assigned_to = u.id) AS total_asignados,
              COUNT(*) FILTER (WHERE t.requester_id = u.id) AS total_reportados
       FROM users u
       LEFT JOIN tickets t
         ON t.organization_id = u.organization_id
        AND (t.assigned_to = u.id OR t.requester_id = u.id)
       WHERE u.organization_id = $1
       GROUP BY u.id, u.full_name, u.email, u.role
       ORDER BY u.full_name NULLS LAST, u.email`,
      [actor.organizationId],
    );

    return jsonResponse(
      result.rows.map((row) => ({
        id: String(row.id),
        nombre: (row.full_name as string) || (row.email as string),
        email: row.email,
        rol: row.role,
        abiertosAsignados: Number(row.abiertos_asignados ?? 0),
        totalAsignados: Number(row.total_asignados ?? 0),
        totalReportados: Number(row.total_reportados ?? 0),
      })),
      200,
    );
  } catch (error) {
    console.error("Error listando los miembros de la organización:", error);
    return jsonResponse({ message: "Error al listar el equipo" }, 500);
  }
}

async function handleAiApi(request: Request, env: unknown) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const appEnv = env as Record<string, string>;

  if (!pathname.startsWith("/api/ai/")) return null;

  try {
    // La auto-resolución es justamente para quien reporta: es la que evita que
    // el ticket llegue a existir. El resto son herramientas de operación.
    const abiertoATodos = ["/api/ai/suggest", "/api/ai/deflect"];
    if (!abiertoATodos.includes(pathname)) {
      const denegado = requireStaff(await getActor(request, appEnv));
      if (denegado) return jsonResponse({ message: denegado.message }, denegado.status);
    }
    // ── Auto-resolución antes de crear el ticket ──
    if (pathname === "/api/ai/suggest" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const response = await suggestResolution(request, payload, appEnv);
      return jsonResponse(response.body, response.status);
    }

    // ── El usuario confirma que la sugerencia le resolvió el problema ──
    if (pathname === "/api/ai/deflect" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const response = await acceptDeflection(request, payload, appEnv);
      return jsonResponse(response.body, response.status);
    }

    // ── Resumen ejecutivo diario ──
    if (pathname === "/api/ai/briefing" && request.method === "GET") {
      const refresh = url.searchParams.get("refresh") === "1";
      const response = await getBriefing(request, appEnv, { refresh });
      return jsonResponse(response.body, response.status);
    }

    // ── Incidentes masivos detectados en la cola ──
    if (pathname === "/api/ai/incidents" && request.method === "GET") {
      const response = await getIncidents(request, appEnv);
      return jsonResponse(response.body, response.status);
    }

    // ── Borrador de respuesta al cliente ──
    const replyMatch = pathname.match(/^\/api\/ai\/tickets\/(\d+)\/reply$/);
    if (replyMatch && request.method === "POST") {
      const response = await draftReply(request, parseInt(replyMatch[1], 10), appEnv);
      return jsonResponse(response.body, response.status);
    }

    return null;
  } catch (error) {
    console.error("Error en el API de IA:", error);
    return jsonResponse({ message: "Error procesando la solicitud de IA" }, 500);
  }
}

async function handleTicketsApi(request: Request, env: unknown) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const appEnv = env as Record<string, string>;

  if (!pathname.startsWith("/api/tickets")) return null;

  // ── GET /api/tickets: Listar todos los tickets mapeados ──
  if (pathname === "/api/tickets" && request.method === "GET") {
    try {
      await ensureSchema(appEnv);
      const actor = await getActor(request, appEnv);

      // El personal de soporte ve la cola completa; quien sólo reporta ve
      // únicamente los tickets que registró o que fueron abiertos a su nombre.
      const values: unknown[] = [actor.organizationId];
      let alcance = "";
      if (!actor.staff) {
        values.push(actor.userId);
        alcance = "AND (t.requester_id = $2 OR t.created_by = $2)";
      }

      const result = await query<TicketRow>(
        appEnv,
        `SELECT 
          t.*, 
          o.name as organization_name,
          u.full_name as technician_name,
          u.email as technician_email
         FROM tickets t
         LEFT JOIN organizations o ON o.id = t.organization_id
         LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.organization_id = $1 ${alcance}
         ORDER BY t.created_at DESC`,
        values,
      );

      return jsonResponse(result.rows.map(mapTicketRow), 200);
    } catch (error) {
      console.error("Error listing tickets:", error);
      return jsonResponse({ message: "Error al listar los tickets" }, 500);
    }
  }

  // ── POST /api/tickets: Crear un ticket ──
  if (pathname === "/api/tickets" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const { asunto, descripcion, cliente, categoria: categoriaSolicitada } = payload;

    if (!asunto || !descripcion) {
      return jsonResponse({ message: "Asunto y descripción son obligatorios" }, 400);
    }

    const texto = `${asunto} ${descripcion}`;
    // "Abierto" es el único estado inicial válido: el resultado de la IA
    // determina categoría y prioridad, nunca el estado del flujo de atención.
    const estado = "Abierto";
    let categoria = categoriaSolicitada || classifyCategory(texto);
    let prioridad = classifyPriority(texto);

    try {
      const iaResult = await categorizeTicketWithAi(
        asunto,
        descripcion,
        await getPriorityCorrections(appEnv, request),
      );
      categoria = iaResult.categoria;
      if (isPriority(iaResult.prioridad)) {
        prioridad = iaResult.prioridad;
      }
    } catch (error) {
      // Sin el modelo clasificamos con el motor local de palabras clave en vez
      // de dejar todo en "Media": la prioridad determina el SLA comprometido.
      console.error("Error de IA, se usa la clasificación por palabras clave", error);
    }

    const sla = slaForPriority(prioridad);

    try {
      // Las tablas pueden no existir si la primera petición del proceso llega
      // a /api/tickets en lugar de a /api/auth/*.
      await ensureSchema(appEnv);

      let organizationId: number;
      const user = getAuthenticatedUser(request, appEnv);
      let creadoPor: number | null = null;
      let actorStaff = false;

      if (user) {
        // El ticket debe nacer en la organización de quien lo reporta, si no
        // queda invisible para él (el listado filtra por organización).
        const actor = await getActor(request, appEnv);
        organizationId = actor.organizationId;
        creadoPor = actor.userId;
        actorStaff = actor.staff;
      } else {
        // ORDER BY explícito: sin él la fila devuelta depende del orden físico
        // de la tabla, que cambia con cualquier UPDATE, y el ticket acabaría en
        // una organización distinta a la que lo lista.
        const orgResult = await query(appEnv, "SELECT id FROM organizations ORDER BY id LIMIT 1");
        organizationId = (orgResult.rowCount ?? 0) > 0 ? (orgResult.rows[0].id as number) : 1;
      }

      // Por defecto el solicitante es quien lo escribe. Sólo el equipo de
      // soporte puede abrir el ticket en nombre de otra persona, y esa persona
      // debe pertenecer a la misma organización: si no, cualquiera podría
      // colgarle un ticket a un usuario ajeno.
      let solicitante = creadoPor;
      const pedido = Number(payload.solicitanteId);
      if (pedido && actorStaff) {
        const destinatario = await query(
          appEnv,
          "SELECT id FROM users WHERE id = $1 AND organization_id = $2",
          [pedido, organizationId],
        );
        if ((destinatario.rowCount ?? 0) === 0) {
          return jsonResponse({ message: "El solicitante no pertenece a tu organización" }, 400);
        }
        solicitante = pedido;
      }

      // Enrutamiento: un ticket que nace sin dueño se queda esperando a que
      // alguien lo vea. Sólo se hace con sesión, porque hace falta saber de qué
      // equipo estamos repartiendo el trabajo.
      let asignacion = null;
      if (user) {
        try {
          asignacion = await routeTicket(appEnv, organizationId, {
            asunto,
            descripcion,
            categoria,
            prioridad,
          });
        } catch (error) {
          console.error("No se pudo enrutar el ticket, queda en la cola:", error);
        }
      }

      const result = await query(
        appEnv,
        `INSERT INTO tickets (organization_id, subject, description, client, category,
                              priority, status, sla, created_by, requester_id, ai_priority,
                              assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          organizationId,
          asunto,
          descripcion,
          cliente,
          categoria,
          prioridad,
          estado,
          sla,
          creadoPor,
          solicitante,
          prioridad,
          asignacion ? Number(asignacion.tecnicoId) : null,
        ],
      );

      // El motivo queda en la línea de tiempo: una asignación automática que no
      // se puede auditar es una caja negra, y el técnico merece saber por qué
      // le tocó a él.
      if (asignacion) {
        await query(
          appEnv,
          `INSERT INTO ticket_comments (ticket_id, author_id, author_name, body)
           VALUES ($1, NULL, $2, $3)`,
          [result.rows[0].id, "Asistente IA", asignacion.motivo],
        ).catch((error) => console.error("No se pudo registrar el motivo del reparto:", error));
      }

      return jsonResponse(result.rows[0], 201);
    } catch (error) {
      console.error("Error inserting ticket:", error);
      return jsonResponse({ message: "Error guardando el ticket en BD" }, 500);
    }
  }

  // ── GET, PATCH, DELETE /api/tickets/:id ──
  // ── GET, POST /api/tickets/:id/comments ──
  const commentsMatch = pathname.match(/^\/api\/tickets\/(\d+)\/comments$/);
  if (commentsMatch) {
    const ticketId = parseInt(commentsMatch[1], 10);

    if (request.method === "GET") {
      try {
        await ensureSchema(appEnv);

        const denied = await denyTicketAccess(request, appEnv, ticketId);
        if (denied) return denied;

        const result = await query<CommentRow>(
          appEnv,
          `SELECT id, author_name, body, created_at
           FROM ticket_comments
           WHERE ticket_id = $1
           ORDER BY created_at ASC`,
          [ticketId],
        );

        return jsonResponse(result.rows.map(mapCommentRow), 200);
      } catch (error) {
        console.error("Error listing ticket comments:", error);
        return jsonResponse({ message: "Error al obtener los comentarios" }, 500);
      }
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const texto = typeof payload.texto === "string" ? payload.texto.trim() : "";

      if (!texto) {
        return jsonResponse({ message: "El comentario no puede estar vacío" }, 400);
      }
      if (texto.length > COMMENT_MAX_LENGTH) {
        return jsonResponse(
          { message: `El comentario supera los ${COMMENT_MAX_LENGTH} caracteres` },
          400,
        );
      }

      try {
        await ensureSchema(appEnv);

        const denied = await denyTicketAccess(request, appEnv, ticketId);
        if (denied) return denied;

        // El autor sale de la sesión, no del cuerpo de la petición: si no,
        // cualquiera podría firmar un comentario con el nombre de otro.
        const user = getAuthenticatedUser(request, appEnv);
        let authorId: number | null = null;
        let authorName = "Usuario";

        if (user) {
          const userRes = await query(
            appEnv,
            "SELECT id, full_name, email FROM users WHERE id = $1",
            [user.id],
          );
          if ((userRes.rowCount ?? 0) > 0) {
            const row = userRes.rows[0];
            authorId = row.id as number;
            authorName = (row.full_name as string) || (row.email as string) || "Usuario";
          }
        }

        const result = await query<CommentRow>(
          appEnv,
          `INSERT INTO ticket_comments (ticket_id, author_id, author_name, body)
           VALUES ($1, $2, $3, $4)
           RETURNING id, author_name, body, created_at`,
          [ticketId, authorId, authorName, texto],
        );

        return jsonResponse(mapCommentRow(result.rows[0]), 201);
      } catch (error) {
        console.error("Error creating ticket comment:", error);
        return jsonResponse({ message: "Error al guardar el comentario" }, 500);
      }
    }
  }

  const match = pathname.match(/^\/api\/tickets\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);

    if (request.method === "GET") {
      try {
        await ensureSchema(appEnv);

        // ── Protección IDOR: el ticket debe pertenecer a la organización del usuario ──
        const denied = await denyTicketAccess(request, appEnv, id);
        if (denied) return denied;

        const result = await query(
          appEnv,
          `SELECT t.*,
                  o.name AS organization_name,
                  u.full_name AS technician_name,
                  u.email AS technician_email
           FROM tickets t
           LEFT JOIN organizations o ON o.id = t.organization_id
           LEFT JOIN users u ON u.id = t.assigned_to
           WHERE t.id = $1`,
          [id],
        );
        if (result.rowCount === 0) {
          return jsonResponse({ message: "Ticket no encontrado" }, 404);
        }

        return jsonResponse(result.rows[0], 200);
      } catch (error) {
        console.error("Error fetching ticket:", error);
        return jsonResponse({ message: "Error al obtener el ticket" }, 500);
      }
    }

    if (request.method === "PATCH") {
      try {
        await ensureSchema(appEnv);

        const payload = await request.json().catch(() => ({}));
        const { estado, prioridad, tecnico, tecnicoId, asunto, descripcion, categoria } = payload;

        if (estado !== undefined && !isStatus(estado)) {
          return jsonResponse({ message: `Estado no válido: ${estado}` }, 400);
        }
        if (prioridad !== undefined && !isPriority(prioridad)) {
          return jsonResponse({ message: `Prioridad no válida: ${prioridad}` }, 400);
        }
        if (asunto !== undefined && !String(asunto).trim()) {
          return jsonResponse({ message: "El asunto no puede estar vacío" }, 400);
        }

        // Gestionar el ciclo del ticket (estado, prioridad, asignación) es
        // trabajo del equipo de soporte, no de quien lo reportó.
        const actor = await getActor(request, appEnv);
        const noAutorizado = requireStaff(actor);
        if (noAutorizado) {
          return jsonResponse({ message: noAutorizado.message }, noAutorizado.status);
        }

        const denied = await denyTicketAccess(request, appEnv, id);
        if (denied) return denied;

        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (estado !== undefined) {
          updates.push(`status = $${idx++}`);
          values.push(estado);
        }
        if (prioridad !== undefined) {
          updates.push(`priority = $${idx++}`);
          values.push(prioridad);
        }
        // El formulario de edición envía también estos campos; antes se
        // descartaban en silencio y los cambios se perdían al recargar.
        if (asunto !== undefined) {
          updates.push(`subject = $${idx++}`);
          values.push(String(asunto).trim());
        }
        if (descripcion !== undefined) {
          updates.push(`description = $${idx++}`);
          values.push(String(descripcion).trim());
        }
        if (categoria !== undefined) {
          updates.push(`category = $${idx++}`);
          values.push(categoria);
        }

        // Asignar por id es lo que usa la interfaz: el nombre puede repetirse y
        // obliga a escribirlo exacto. Se mantiene `tecnico` por compatibilidad.
        if (tecnicoId !== undefined) {
          if (tecnicoId === null || tecnicoId === "") {
            updates.push(`assigned_to = NULL`);
          } else {
            const destino = await query(
              appEnv,
              `SELECT id FROM users
               WHERE id = $1 AND organization_id = $2 AND role IN ('owner', 'tech')`,
              [Number(tecnicoId), actor.organizationId],
            );
            if ((destino.rowCount ?? 0) === 0) {
              return jsonResponse(
                { message: "Ese técnico no existe o no pertenece a tu equipo" },
                400,
              );
            }
            updates.push(`assigned_to = $${idx++}`);
            values.push(Number(tecnicoId));
          }
        } else if (tecnico !== undefined) {
          if (tecnico === null || tecnico === "") {
            updates.push(`assigned_to = NULL`);
          } else {
            const techRes = await query(
              appEnv,
              "SELECT id FROM users WHERE full_name = $1 LIMIT 1",
              [tecnico],
            );
            if ((techRes.rowCount ?? 0) > 0) {
              updates.push(`assigned_to = $${idx++}`);
              values.push(techRes.rows[0]?.id);
            } else {
              // Antes se ignoraba en silencio y la UI decía "guardado".
              return jsonResponse({ message: `No existe el técnico "${tecnico}"` }, 400);
            }
          }
        }

        // ── SLA: debe seguir a la criticidad, no quedarse en el del alta ──
        const nextSla = await resolveNextSla(appEnv, id, estado, prioridad);
        if (nextSla !== undefined) {
          updates.push(`sla = $${idx++}`);
          values.push(nextSla);
        }

        if (updates.length === 0) {
          return jsonResponse({ message: "No hay cambios que aplicar" }, 400);
        }

        values.push(id);
        const result = await query<TicketRow>(
          appEnv,
          `UPDATE tickets SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
          values,
        );

        const updated = result?.rows?.[0];
        return jsonResponse({ success: true, ticket: updated ? mapTicketRow(updated) : null }, 200);
      } catch (error) {
        console.error("Error updating ticket:", error);
        return jsonResponse({ message: "Error al actualizar el ticket" }, 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        await ensureSchema(appEnv);

        const actor = await getActor(request, appEnv);
        const noAutorizado = requireStaff(actor);
        if (noAutorizado) {
          return jsonResponse({ message: noAutorizado.message }, noAutorizado.status);
        }

        const denied = await denyTicketAccess(request, appEnv, id);
        if (denied) return denied;

        await query(appEnv, "DELETE FROM tickets WHERE id = $1", [id]);
        return jsonResponse({ success: true }, 200);
      } catch (error) {
        console.error("Error deleting ticket:", error);
        return jsonResponse({ message: "Error al eliminar el ticket" }, 500);
      }
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const orgResponse = await handleOrgApi(request, env);
      if (orgResponse) return orgResponse;

      const aiResponse = await handleAiApi(request, env);
      if (aiResponse) return aiResponse;

      const ticketsResponse = await handleTicketsApi(request, env);
      if (ticketsResponse) return ticketsResponse;

      const apiResponse = await handleAuthApi(request, env);
      if (apiResponse) {
        return apiResponse;
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
