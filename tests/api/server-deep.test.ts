import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

jest.mock("../../src/lib/db", () => ({
  query: jest.fn(),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithAi: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { query } from "../../src/lib/db";

const mockQuery = query as jest.MockedFunction<any>;

function makeAuthCookie(userId: number, email: string) {
  const token = jwt.sign({ sub: userId, email }, JWT_SECRET);
  return `smartticket_session=${token}`;
}

describe("Server.ts — Ramas faltantes (186-190, 312-313, 361-362, 371-372, 391-396)", () => {
  let consoleSpy: any;

  beforeAll(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ── Líneas 186-190: GET /api/tickets con usuario autenticado → filtra por organización ──
  it("1. GET /api/tickets with authenticated user filters tickets by their organization", async () => {
    const cookie = makeAuthCookie(1, "user@example.com");

    // Query 1: SELECT organization_id FROM users (línea 186)
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ organization_id: 2 }] });
    // Query 2: SELECT tickets...
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 55,
          subject: "Fallo de red",
          description: "Sin internet",
          client: "Ana",
          category: "Redes",
          priority: "Alta",
          status: "Abierto",
          sla: "4h",
          created_at: new Date().toISOString(),
          organization_name: "Org B",
          technician_name: null,
        },
      ],
    });

    const response = await server.fetch(
      new Request("http://localhost/api/tickets", {
        method: "GET",
        headers: { Cookie: cookie },
      }),
      {},
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("2. GET /api/tickets with authenticated user — organization_id not found (rowCount=0)", async () => {
    const cookie = makeAuthCookie(99, "ghost@example.com");

    // Query 1: SELECT organization_id → sin resultados (línea 189, branch falso)
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // Query 2: SELECT tickets con organizationId por defecto (1)
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await server.fetch(
      new Request("http://localhost/api/tickets", {
        method: "GET",
        headers: { Cookie: cookie },
      }),
      {},
      {},
    );

    expect(response.status).toBe(200);
  });

  // ── Líneas 312-313: GET /api/tickets/:id → error catching (500) ──
  it("3. GET /api/tickets/:id — DB throws → returns 500", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection lost"));

    const response = await server.fetch(
      new Request("http://localhost/api/tickets/42", { method: "GET" }),
      {},
      {},
    );
    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain("Error al obtener");
  });

  // ── Líneas 361-362: PATCH /api/tickets/:id → error catching (500) ──
  it("4. PATCH /api/tickets/:id — DB throws → returns 500", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Disk full"));

    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "Resuelto" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain("Error al actualizar");
  });

  // ── Líneas 371-372: DELETE /api/tickets/:id → error catching (500) ──
  it("5. DELETE /api/tickets/:id — DB throws → returns 500", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Table locked"));

    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", { method: "DELETE" }),
      {},
      {},
    );
    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain("Error al eliminar");
  });

  // ── Líneas 391-396: POST /api/auth/register ──
  it("6. POST /api/auth/register with new email returns 201", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // email no existe
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, name: "Demo Org" }] }) // org
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }); // INSERT user

    const response = await server.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "Pass1!", company: "Demo Org" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(201);
  });

  it("7. POST /api/auth/register with duplicate email returns 409", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 5 }] }); // email ya existe

    const response = await server.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "duplicate@example.com", password: "Pass1!" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(409);
  });

  it("8. POST /api/auth/login with valid credentials returns 200 and Set-Cookie", async () => {
    const { hash } = await import("bcryptjs");
    const hashedPwd = await hash("correctPwd", 10);

    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 7,
          password_hash: hashedPwd,
          is_verified: true,
          full_name: "Test",
          company: "Acme",
          role: "owner",
          organization_id: 1,
          organization_name: "Acme",
        },
      ],
    });

    const response = await server.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com", password: "correctPwd" }),
      }),
      {},
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("smartticket_session");
  });

  it("9. GET /api/auth/verify with valid token returns HTML 200", async () => {
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 3, verification_token_expires: futureDate }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE

    const response = await server.fetch(
      new Request("http://localhost/api/auth/verify?token=valid-token"),
      {},
      {},
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("verificado");
  });

  it("10. GET /api/auth/verify with invalid token returns HTML 400", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await server.fetch(
      new Request("http://localhost/api/auth/verify?token=bad-token"),
      {},
      {},
    );
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("fallida");
  });
});
