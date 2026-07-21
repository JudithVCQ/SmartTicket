import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

// Mockear la base de datos
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

function makeAuthCookie(userId: number, email: string): string {
  const token = jwt.sign({ sub: userId, email }, JWT_SECRET);
  return `smartticket_session=${token}`;
}

describe("Server API Endpoints & Route Protection", () => {
  let consoleSpy: any;

  beforeAll(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("1. GET /api/tickets should return 200 and an array of mapped tickets", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 101,
          subject: "Servidor lento",
          description: "Lento",
          client: "Carlos",
          category: "Software",
          priority: "Alta",
          status: "Abierto",
          sla: "4h",
          created_at: new Date().toISOString(),
          organization_name: "Demo Soluciones SAC",
          technician_name: "Ana Paredes",
        },
      ],
    });

    const response = await server.fetch(
      new Request("http://localhost/api/tickets", { method: "GET" }),
      {},
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("asunto", "Servidor lento");
  });

  it("2. GET /api/tickets/:id with nonexistent ID should return 404", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/tickets/99999", { method: "GET" }),
      {},
      {},
    );
    expect(response.status).toBe(404);
  });

  it("3. Request without authorization token to a protected route should return 401", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/auth/profile", { method: "GET" }),
      {},
      {},
    );
    expect(response.status).toBe(401);
  });

  it("4. Request with invalid or expired token should return 401", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/auth/profile", {
        method: "GET",
        headers: { Authorization: "Bearer token-invalido-expirado" },
      }),
      {},
      {},
    );
    expect(response.status).toBe(401);
  });

  it("5. PATCH /api/tickets/:id should return 200 on success", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "Resuelto" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
  });

  it("6. PATCH /api/tickets/:id with tecnico=null clears assigned_to", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tecnico: null }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
  });

  it("7. PATCH /api/tickets/:id with tecnico name resolves to user ID", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tecnico: "Ana Paredes" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
  });

  it("8. DELETE /api/tickets/:id should return 200", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/tickets/1", { method: "DELETE" }),
      {},
      {},
    );
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it("9. POST /api/auth/forgot-password returns 200 with generic message", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "cualquier@correo.com" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain("Gmail");
  });

  it("10. POST /api/auth/profile updates profile and returns 200", async () => {
    const cookie = makeAuthCookie(10, "user@example.com");
    // No cambiamos el email, así que updateProfile solo hace 1 query (el UPDATE)
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const response = await server.fetch(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ fullName: "Nuevo Nombre" }),
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
  });

  it("11. GET /api/auth/profile with valid session returns 200", async () => {
    const cookie = makeAuthCookie(10, "user@example.com");
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 10,
          email: "user@example.com",
          full_name: "Test",
          company: null,
          role: "member",
          organization_id: 1,
          organization_name: "Org",
        },
      ],
    });
    const response = await server.fetch(
      new Request("http://localhost/api/auth/profile", {
        method: "GET",
        headers: { Cookie: cookie },
      }),
      {},
      {},
    );
    expect(response.status).toBe(200);
  });
});
