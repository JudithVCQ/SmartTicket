import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import "dotenv/config";

jest.mock("../../src/lib/ai", () => ({
  isAiConfigured: jest.fn<() => boolean>().mockReturnValue(false),
  categorizeTicketWithAi: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
  suggestResolutionWithAi: jest.fn<() => Promise<any>>(),
  generateBriefingWithAi: jest.fn<() => Promise<any>>(),
  clusterIncidentsWithAi: jest.fn<() => Promise<any>>().mockResolvedValue({ incidentes: [] }),
  draftReplyWithAi: jest.fn<() => Promise<any>>(),
}));
jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { closePool, query } from "../../src/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

/** Sesión de un usuario real de la BD demo. */
async function sesion(email: string) {
  const res = await query({}, "SELECT id, role FROM users WHERE email = $1", [email]);
  const user = res.rows[0] as { id: number; role: string };
  return {
    headers: { Cookie: `smartticket_session=${jwt.sign({ sub: user.id, email }, JWT_SECRET)}` },
    id: user.id,
    role: user.role,
  };
}

const call = (url: string, init?: RequestInit) =>
  server.fetch(new Request(`http://localhost${url}`, init), {}, {});

describe("Separación por rol (BD real)", () => {
  let tecnico: Awaited<ReturnType<typeof sesion>>;
  let solicitante: Awaited<ReturnType<typeof sesion>>;
  let otroSolicitante: Awaited<ReturnType<typeof sesion>>;

  beforeAll(async () => {
    tecnico = await sesion("bruno@demoticket.com");
    solicitante = await sesion("rosa@demoticket.com");
    otroSolicitante = await sesion("marco@demoticket.com");
  });

  afterAll(async () => {
    await closePool();
  });

  it("el seed dejó los roles esperados", () => {
    expect(tecnico.role).toBe("tech");
    expect(solicitante.role).toBe("member");
  });

  it("el técnico ve toda la cola y el solicitante sólo lo suyo", async () => {
    const delTecnico = await (await call("/api/tickets", { headers: tecnico.headers })).json();
    const delSolicitante = await (
      await call("/api/tickets", { headers: solicitante.headers })
    ).json();

    expect(delTecnico.length).toBeGreaterThan(delSolicitante.length);
    expect(delSolicitante.length).toBeGreaterThan(0);
    // Todo lo que ve es suyo.
    for (const t of delSolicitante) {
      expect(t.cliente).toBe("Rosa Medina");
    }
  });

  it("un solicitante no puede abrir el ticket de otro (404, no 403)", async () => {
    const suyos = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    const ajeno = await call(`/api/tickets/${suyos[0].id}`, { headers: otroSolicitante.headers });

    // 404 y no 403: un 403 confirmaría que ese ticket existe.
    expect(ajeno.status).toBe(404);
  });

  it("un solicitante sí puede abrir el suyo", async () => {
    const suyos = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    const propio = await call(`/api/tickets/${suyos[0].id}`, { headers: solicitante.headers });
    expect(propio.status).toBe(200);
  });

  it("un solicitante no puede cambiar el estado ni eliminar", async () => {
    const suyos = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    const id = suyos[0].id;

    const patch = await call(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { ...solicitante.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "Cerrado" }),
    });
    expect(patch.status).toBe(403);

    const del = await call(`/api/tickets/${id}`, {
      method: "DELETE",
      headers: solicitante.headers,
    });
    expect(del.status).toBe(403);
  });

  it("un solicitante sí puede comentar en su ticket", async () => {
    const suyos = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    const res = await call(`/api/tickets/${suyos[0].id}/comments`, {
      method: "POST",
      headers: { ...solicitante.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ texto: "¿Hay alguna novedad sobre esto?" }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).autor).toBe("Rosa Medina");
  });

  it("las herramientas de operación con IA son sólo del equipo", async () => {
    for (const url of ["/api/ai/briefing", "/api/ai/incidents"]) {
      expect((await call(url, { headers: solicitante.headers })).status).toBe(403);
      expect((await call(url, { headers: tecnico.headers })).status).toBe(200);
    }

    const suyos = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    const borrador = await call(`/api/ai/tickets/${suyos[0].id}/reply`, {
      method: "POST",
      headers: solicitante.headers,
    });
    expect(borrador.status).toBe(403);
  });

  it("la auto-resolución sí está abierta a quien reporta", async () => {
    const res = await call("/api/ai/suggest", {
      method: "POST",
      headers: { ...solicitante.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "No puedo imprimir",
        descripcion: "La impresora no responde",
      }),
    });
    // Con la IA desactivada responde 200 y `disponible:false`, no 403.
    expect(res.status).toBe(200);
    expect((await res.json()).disponible).toBe(false);
  });

  it("la lista del equipo sólo la ve el equipo", async () => {
    expect((await call("/api/org/members", { headers: solicitante.headers })).status).toBe(403);

    const res = await call("/api/org/members", { headers: tecnico.headers });
    expect(res.status).toBe(200);
    const miembros = await res.json();
    expect(miembros.some((m: any) => m.nombre === "Rosa Medina")).toBe(true);
  });

  it("el técnico puede registrar a nombre de otro y ese otro lo ve", async () => {
    const creado = await call("/api/tickets", {
      method: "POST",
      headers: { ...tecnico.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "TMP registrado por teléfono",
        descripcion: "Rosa llamó para reportar que no le carga el módulo de planilla.",
        solicitanteId: String(solicitante.id),
      }),
    });
    expect(creado.status).toBe(201);
    const ticket = await creado.json();

    // Lo tecleó el técnico, pero es de Rosa.
    expect(ticket.created_by).toBe(tecnico.id);
    expect(ticket.requester_id).toBe(solicitante.id);

    const deRosa = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    expect(deRosa.some((t: any) => t.id === String(ticket.id))).toBe(true);

    await query({}, "DELETE FROM tickets WHERE id = $1", [ticket.id]);
  });

  it("un solicitante no puede colgarle un ticket a otra persona", async () => {
    const creado = await call("/api/tickets", {
      method: "POST",
      headers: { ...solicitante.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "TMP intento de suplantación",
        descripcion: "Intento de asignar el ticket a otro usuario.",
        solicitanteId: String(otroSolicitante.id),
      }),
    });
    expect(creado.status).toBe(201);
    const ticket = await creado.json();

    // El solicitanteId enviado se ignora: el ticket queda a nombre de quien lo creó.
    expect(ticket.requester_id).toBe(solicitante.id);

    await query({}, "DELETE FROM tickets WHERE id = $1", [ticket.id]);
  });

  it("el ticket que crea un solicitante queda a su nombre y lo ve enseguida", async () => {
    const creado = await call("/api/tickets", {
      method: "POST",
      headers: { ...solicitante.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "TMP prueba de rol",
        descripcion: "Ticket creado por un solicitante para verificar la autoría.",
      }),
    });
    expect(creado.status).toBe(201);
    const ticket = await creado.json();

    expect(ticket.created_by).toBe(solicitante.id);
    expect(ticket.requester_id).toBe(solicitante.id);

    const lista = await (await call("/api/tickets", { headers: solicitante.headers })).json();
    expect(lista.some((t: any) => t.id === String(ticket.id))).toBe(true);

    // Y el otro solicitante no lo ve.
    const ajena = await (await call("/api/tickets", { headers: otroSolicitante.headers })).json();
    expect(ajena.some((t: any) => t.id === String(ticket.id))).toBe(false);

    await query({}, "DELETE FROM tickets WHERE id = $1", [ticket.id]);
  });
});
