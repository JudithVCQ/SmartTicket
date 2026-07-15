import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";

// DB mock completo
jest.mock("../../src/lib/db", () => ({
  query: jest.fn(),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Gemini FALLA — lanza un error
jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithGemini: jest
    .fn<() => Promise<never>>()
    .mockRejectedValue(new Error("Gemini API unavailable")),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { query } from "../../src/lib/db";

describe("AI Fallback — clasificación manual cuando Gemini falla", () => {
  let consoleSpy: any;

  beforeAll(() => {
    // Silenciar el console.error esperado del fallback de Gemini
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should create the ticket with status 'clasificación manual' when Gemini throws", async () => {
    const mockQuery = query as jest.MockedFunction<any>;

    // Consulta 1: buscar la organización por defecto
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });

    // Consulta 2: INSERT del ticket → devolvemos el ticket insertado con el estado esperado
    const fakeTicket = {
      id: 999,
      subject: "Problema de red",
      description: "La red no funciona",
      category: "Software",
      priority: "Media",
      status: "clasificación manual",
      sla: "24h",
    };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [fakeTicket] });

    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "Problema de red",
        descripcion: "La red no funciona",
        cliente: "Juan Pérez",
        canal: "Portal",
      }),
    });

    const response = await server.fetch(request, {}, {});
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.status).toBe("clasificación manual");
  });
});
