import { describe, it, expect, jest, afterAll } from "@jest/globals";

// ── Mocks: aislar servicios externos (Gemini AI, PostgreSQL, Mailer) ──
// Estos mocks evitan que los tests necesiten .env o conexión real a internet/BD.

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithGemini: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({
      categoria: "Software",
      prioridad: "Media",
    }),
}));

jest.mock("../../src/lib/db", () => ({
  query: jest
    .fn<(...args: unknown[]) => Promise<{ rowCount: number; rows: Record<string, unknown>[] }>>()
    .mockImplementation((_env: unknown, sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT id FROM organizations")) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: 1 }] });
      }
      // INSERT INTO tickets ... RETURNING *
      return Promise.resolve({
        rowCount: 1,
        rows: [
          {
            id: 1,
            organization_id: 1,
            subject: "Test API Asunto",
            description: "Este es un test de la API de tickets",
            client: "Cliente Test",
            category: "Software",
            priority: "Media",
            status: "Abierto",
            sla: "24h",
          },
        ],
      });
    }),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Importar el servidor DESPUÉS de registrar los mocks
import server from "../../src/server";

describe("Tickets API", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should return 201 Created when creating a ticket", async () => {
    const mockRequest = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "Test API Asunto",
        descripcion: "Este es un test de la API de tickets",
        cliente: "Cliente Test",
        canal: "API",
      }),
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("subject", "Test API Asunto");
  });

  it("should return 400 Bad Request if missing fields", async () => {
    const mockRequest = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "",
      }),
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(400);
  });
});
