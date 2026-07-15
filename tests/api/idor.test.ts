import { describe, it, expect, jest, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";
import "dotenv/config";

// Mockear la base de datos
jest.mock("../../src/lib/db", () => ({
  query: jest.fn(),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithGemini: jest.fn<() => Promise<any>>().mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { query } from "../../src/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

describe("IDOR Security Tests", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("1. should reject cross-organization ticket access (IDOR) with 403", async () => {
    // 1. Generar token de usuario válido (User ID = 50, Org ID = 1)
    const token = jwt.sign({ sub: 50, email: "user-a@org-a.com" }, JWT_SECRET);

    const mockQuery = query as jest.MockedFunction<any>;

    // Mockear la secuencia de consultas que hará el endpoint:
    // Consulta 1: Obtener el ticket con id 200 (pertenece a org_id = 2)
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 200, organization_id: 2, subject: "Ticket Secreto Org B" }],
    });

    // Consulta 2: Obtener la organización del usuario autenticado (id = 50, org_id = 1)
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ organization_id: 1 }],
    });

    // Enviar petición con la cookie de sesión correspondiente
    const request = new Request("http://localhost/api/tickets/200", {
      method: "GET",
      headers: {
        Cookie: `smartticket_session=${token}`,
      },
    });

    const response = await server.fetch(request, {}, {});
    
    // Debe denegar el acceso debido a que las organizaciones son distintas (1 !== 2)
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toContain("No autorizado");
  });
});
