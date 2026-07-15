import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { registerUser, loginUser, verifyUser, getProfile, updateProfile, getAuthenticatedUser } from "./lib/auth";
import { query } from "./lib/db";
import { categorizeTicketWithGemini } from "./lib/ai";

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

function calculateSla(priority: string) {
  switch (priority) {
    case "Crítica":
      return "01:00:00";
    case "Alta":
      return "04:00:00";
    case "Media":
      return "08:00:00";
    case "Baja":
      return "24:00:00";
    default:
      return "24:00:00";
  }
}

async function handleTicketsApi(request: Request, env: unknown) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const appEnv = env as Record<string, string>;

  // ── GET /api/tickets: Listar todos los tickets mapeados ──
  if (pathname === "/api/tickets" && request.method === "GET") {
    try {
      const user = getAuthenticatedUser(request, appEnv);
      let organizationId = 1;

      if (user) {
        const userRes = await query(appEnv, "SELECT organization_id FROM users WHERE id = $1", [
          user.id,
        ]);
        if ((userRes.rowCount ?? 0) > 0) {
          organizationId = userRes.rows[0].organization_id as number;
        }
      }

      const result = await query(
        appEnv,
        `SELECT 
          t.*, 
          o.name as organization_name,
          u.full_name as technician_name,
          u.email as technician_email
         FROM tickets t
         LEFT JOIN organizations o ON o.id = t.organization_id
         LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.organization_id = $1
         ORDER BY t.created_at DESC`,
        [organizationId],
      );

      const mappedTickets = result.rows.map((row: any) => ({
        id: row.id.toString(),
        asunto: row.subject,
        descripcion: row.description || "",
        cliente: row.client || "",
        empresa: row.organization_name || "",
        categoria: row.category || "Software",
        prioridad: row.priority,
        estado: row.status,
        slaRestante: row.sla || "24h",
        slaProgress:
          row.priority === "Crítica"
            ? 0.2
            : row.priority === "Alta"
              ? 0.15
              : row.priority === "Media"
                ? 0.1
                : 0.05,
        creadoEn: new Date(row.created_at).toISOString().slice(0, 16).replace("T", " "),
        tecnico: row.technician_name || undefined,
        creadoPor: undefined,
        creadorEmail: undefined,
      }));

      return jsonResponse(mappedTickets, 200);
    } catch (error) {
      console.error("Error listing tickets:", error);
      return jsonResponse({ message: "Error al listar los tickets" }, 500);
    }
  }

  // ── POST /api/tickets: Crear un ticket ──
  if (pathname === "/api/tickets" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const { asunto, descripcion, cliente, canal } = payload;

    if (!asunto || !descripcion) {
      return jsonResponse({ message: "Asunto y descripción son obligatorios" }, 400);
    }

    let categoria = "Software";
    let prioridad = "Media";
    let estado = "Abierto";

    try {
      const iaResult = await categorizeTicketWithGemini(asunto, descripcion);
      categoria = iaResult.categoria;
      prioridad = iaResult.prioridad;
    } catch (error) {
      console.error("Gemini AI error, fallback to manual classification", error);
      estado = "clasificación manual";
    }

    const sla = calculateSla(prioridad);

    try {
      const orgResult = await query(appEnv, "SELECT id FROM organizations LIMIT 1");
      const organizationId = (orgResult.rowCount ?? 0) > 0 ? orgResult.rows[0].id : 1;

      const result = await query(
        appEnv,
        `INSERT INTO tickets (organization_id, subject, description, client, category, priority, status, sla)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [organizationId, asunto, descripcion, cliente, categoria, prioridad, estado, sla],
      );

      return jsonResponse(result.rows[0], 201);
    } catch (error) {
      console.error("Error inserting ticket:", error);
      return jsonResponse({ message: "Error guardando el ticket en BD" }, 500);
    }
  }

  // ── GET, PATCH, DELETE /api/tickets/:id ──
  const match = pathname.match(/^\/api\/tickets\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);

    if (request.method === "GET") {
      try {
        const result = await query(appEnv, "SELECT * FROM tickets WHERE id = $1", [id]);
        if (result.rowCount === 0) {
          return jsonResponse({ message: "Ticket no encontrado" }, 404);
        }

        const ticket = result.rows[0];

        // ── Protección IDOR: Verificar que el ticket pertenezca a la organización del usuario ──
        const user = getAuthenticatedUser(request, appEnv);
        if (user) {
          const userRes = await query(appEnv, "SELECT organization_id FROM users WHERE id = $1", [
            user.id,
          ]);
          if ((userRes.rowCount ?? 0) > 0) {
            const userOrgId = userRes.rows[0].organization_id;
            if (ticket.organization_id !== userOrgId) {
              return jsonResponse({ message: "No autorizado (Acceso prohibido)" }, 403);
            }
          }
        }

        return jsonResponse(ticket, 200);
      } catch (error) {
        console.error("Error fetching ticket:", error);
        return jsonResponse({ message: "Error al obtener el ticket" }, 500);
      }
    }

    if (request.method === "PATCH") {
      try {
        const payload = await request.json().catch(() => ({}));
        const { estado, prioridad, tecnico } = payload;
        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (estado !== undefined) {
          updates.push(`status = $${idx++}`);
          values.push(estado);
        }
        if (prioridad !== undefined) {
          updates.push(`priority = $${idx++}`);
          values.push(prioridad);
        }

        if (tecnico !== undefined) {
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
              values.push(techRes.rows[0].id);
            }
          }
        }

        if (updates.length > 0) {
          values.push(id);
          await query(
            appEnv,
            `UPDATE tickets SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
            values,
          );
        }

        return jsonResponse({ success: true }, 200);
      } catch (error) {
        console.error("Error updating ticket:", error);
        return jsonResponse({ message: "Error al actualizar el ticket" }, 500);
      }
    }

    if (request.method === "DELETE") {
      try {
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
