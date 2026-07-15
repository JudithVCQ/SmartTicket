import { describe, it, expect, jest, afterAll } from "@jest/globals";

// ── Mocks híbridos: aislar servicios externos de terceros (Gemini AI y Mailer) ──
// Mantendremos la base de datos real (no simulada) conectándose al PostgreSQL local/Aiven.

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithGemini: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({
      categoria: "Software",
      prioridad: "Media",
    }),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Importar el servidor
import server from "../../src/server";
import { closePool } from "../../src/lib/db";

describe("Tickets API", () => {
  afterAll(async () => {
    jest.restoreAllMocks();
    await closePool();
  });

  let createdTicketId: string;

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
    createdTicketId = body.id.toString();
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

  it("should list all tickets for the organization", async () => {
    const mockRequest = new Request("http://localhost/api/tickets", {
      method: "GET",
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const found = body.find((t: any) => t.id === createdTicketId);
    expect(found).toBeDefined();
    expect(found.asunto).toBe("Test API Asunto");
  });

  it("should fetch a single ticket by ID", async () => {
    const mockRequest = new Request(`http://localhost/api/tickets/${createdTicketId}`, {
      method: "GET",
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("id", parseInt(createdTicketId, 10));
    expect(body).toHaveProperty("subject", "Test API Asunto");
  });

  it("should update a ticket status", async () => {
    const mockRequest = new Request(`http://localhost/api/tickets/${createdTicketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado: "En progreso",
        prioridad: "Alta",
      }),
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("success", true);

    const getReq = new Request(`http://localhost/api/tickets/${createdTicketId}`, {
      method: "GET",
    });
    const getRes = await server.fetch(getReq, {}, {});
    const ticketData = await getRes.json();
    expect(ticketData.status).toBe("En progreso");
    expect(ticketData.priority).toBe("Alta");
  });

  it("should delete a ticket by ID", async () => {
    const mockRequest = new Request(`http://localhost/api/tickets/${createdTicketId}`, {
      method: "DELETE",
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("success", true);

    const getReq = new Request(`http://localhost/api/tickets/${createdTicketId}`, {
      method: "GET",
    });
    const getRes = await server.fetch(getReq, {}, {});
    expect(getRes.status).toBe(404);
  });
});
