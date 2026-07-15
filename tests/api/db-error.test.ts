import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";

// query lanza un error de conexión
jest.mock("../../src/lib/db", () => ({
  query: jest.fn<() => Promise<never>>().mockRejectedValue(new Error("Connection refused")),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithGemini: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";

describe("DB Connection Failure — respuesta controlada (500)", () => {
  let consoleSpy: any;

  beforeAll(() => {
    // Silenciar los console.error esperados cuando la BD falla
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("should return 500 gracefully when query() throws a connection error on POST /api/tickets", async () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "Error de prueba",
        descripcion: "Esto causa un fallo de BD",
        cliente: "Test",
        canal: "Portal",
      }),
    });

    const response = await server.fetch(request, {}, {});
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toHaveProperty("message");
  });

  it("should return 500 gracefully when query() throws a connection error on GET /api/tickets", async () => {
    const request = new Request("http://localhost/api/tickets", {
      method: "GET",
    });

    const response = await server.fetch(request, {}, {});
    expect(response.status).toBe(500);
  });
});
