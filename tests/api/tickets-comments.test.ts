import { describe, it, expect, jest, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import "dotenv/config";

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithAi: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
}));
jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { closePool, query } from "../../src/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

const call = (url: string, init?: RequestInit) =>
  server.fetch(new Request(`http://localhost${url}`, init), {}, {});

const postComment = (ticketId: string, body: unknown, headers: Record<string, string> = {}) =>
  call(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("Comentarios de tickets (BD real)", () => {
  let ticketId = "";

  afterAll(async () => {
    if (ticketId) await call(`/api/tickets/${ticketId}`, { method: "DELETE" });
    await closePool();
  });

  it("crea el ticket de apoyo", async () => {
    const res = await call("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "TMP comentarios",
        descripcion: "Ticket de apoyo para probar comentarios",
        cliente: "QA",
      }),
    });
    expect(res.status).toBe(201);
    ticketId = String((await res.json()).id);
  });

  it("un ticket nuevo no tiene comentarios", async () => {
    const res = await call(`/api/tickets/${ticketId}/comments`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("persiste el comentario y lo devuelve en la siguiente lectura", async () => {
    const res = await postComment(ticketId, { texto: "Primer comentario de prueba" });
    expect(res.status).toBe(201);

    const created = await res.json();
    expect(created).toHaveProperty("id");
    expect(created.texto).toBe("Primer comentario de prueba");

    const listados = await (await call(`/api/tickets/${ticketId}/comments`)).json();
    expect(listados).toHaveLength(1);
    expect(listados[0].texto).toBe("Primer comentario de prueba");
  });

  it("firma el comentario con el usuario de la sesión, no con lo que envíe el cliente", async () => {
    const userRes = await query({}, "SELECT id, full_name FROM users WHERE email = $1", [
      "ana@demoticket.com",
    ]);
    const user = userRes.rows[0] as { id: number; full_name: string };
    const token = jwt.sign({ sub: user.id, email: "ana@demoticket.com" }, JWT_SECRET);

    const res = await postComment(
      ticketId,
      { texto: "Comentario firmado", autor: "Impostor" },
      { Cookie: `smartticket_session=${token}` },
    );
    expect(res.status).toBe(201);
    expect((await res.json()).autor).toBe(user.full_name);
  });

  it("rechaza comentarios vacíos y demasiado largos", async () => {
    expect((await postComment(ticketId, { texto: "   " })).status).toBe(400);
    expect((await postComment(ticketId, { texto: "x".repeat(1001) })).status).toBe(400);
  });

  it("los comentarios se borran junto con el ticket", async () => {
    const res = await call(`/api/tickets/${ticketId}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const restantes = await query({}, "SELECT id FROM ticket_comments WHERE ticket_id = $1", [
      parseInt(ticketId, 10),
    ]);
    expect(restantes.rowCount).toBe(0);
    ticketId = "";
  });
});
