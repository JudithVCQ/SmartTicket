import { describe, it, expect, jest, beforeAll, beforeEach, afterAll } from "@jest/globals";

// La BD se mockea para no depender de datos reales; lo que se prueba aquí es el
// contrato de los endpoints de IA y sus respaldos cuando Gemini falla.
jest.mock("../../src/lib/db", () => ({
  query: jest.fn(),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/ai", () => ({
  isAiConfigured: jest.fn<() => boolean>().mockReturnValue(true),
  categorizeTicketWithAi: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Media" }),
  suggestResolutionWithAi: jest.fn<() => Promise<any>>(),
  generateBriefingWithAi: jest.fn<() => Promise<any>>(),
  clusterIncidentsWithAi: jest.fn<() => Promise<any>>(),
  draftReplyWithAi: jest.fn<() => Promise<any>>(),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { query } from "../../src/lib/db";
import {
  clusterIncidentsWithAi,
  draftReplyWithAi,
  generateBriefingWithAi,
  isAiConfigured,
  suggestResolutionWithAi,
} from "../../src/lib/ai";

const mockQuery = query as jest.MockedFunction<any>;
const mockSuggest = suggestResolutionWithAi as jest.MockedFunction<any>;
const mockBriefing = generateBriefingWithAi as jest.MockedFunction<any>;
const mockCluster = clusterIncidentsWithAi as jest.MockedFunction<any>;
const mockReply = draftReplyWithAi as jest.MockedFunction<any>;
const mockConfigured = isAiConfigured as jest.MockedFunction<any>;

const post = (url: string, body: unknown) =>
  server.fetch(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    {},
    {},
  );

const get = (url: string) =>
  server.fetch(new Request(`http://localhost${url}`, { method: "GET" }), {}, {});

/** Fila de ticket resuelto que devuelve la búsqueda de históricos. */
const historico = {
  id: 10,
  subject: "Factura electrónica no responde",
  description: "El módulo de facturación se queda colgado",
  category: "Facturación",
  resolution_notes: "Se reinició el servicio de SUNAT",
};

describe("Endpoints de IA", () => {
  let consoleSpy: any;

  beforeAll(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockConfigured.mockReturnValue(true);
  });

  // ── 1. Auto-resolución ────────────────────────────────────────────────────

  it("ofrece la solución y registra la deflexión cuando la confianza es alta", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [historico] }) // históricos por palabra clave
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 77 }] }); // INSERT ai_deflections

    mockSuggest.mockResolvedValueOnce({
      respuesta: "Reinicia el servicio de facturación desde el panel.",
      confianza: 0.9,
      referencias: ["10"],
    });

    const res = await post("/api/ai/suggest", {
      asunto: "Facturación electrónica colgada",
      descripcion: "El módulo de comprobantes no responde",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.disponible).toBe(true);
    expect(body.deflectionId).toBe("77");
    expect(body.referencias).toEqual([{ id: "10", asunto: historico.subject }]);
  });

  it("no ofrece nada si la confianza está por debajo del umbral", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [historico] });
    mockSuggest.mockResolvedValueOnce({
      respuesta: "Quizá sea la red.",
      confianza: 0.2,
      referencias: [],
    });

    const body = await (
      await post("/api/ai/suggest", { asunto: "Algo raro", descripcion: "no sé qué pasa" })
    ).json();

    expect(body.disponible).toBe(false);
  });

  it("descarta referencias a tickets que no se enviaron al modelo", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [historico] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 78 }] });

    mockSuggest.mockResolvedValueOnce({
      respuesta: "Reinicia el servicio.",
      confianza: 0.8,
      referencias: ["10", "9999"], // 9999 es inventado por el modelo
    });

    const body = await (
      await post("/api/ai/suggest", { asunto: "Facturación", descripcion: "colgada" })
    ).json();

    expect(body.referencias).toHaveLength(1);
    expect(body.referencias[0].id).toBe("10");
  });

  it("degrada sin romper si Gemini falla", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [historico] });
    mockSuggest.mockRejectedValueOnce(new Error("Gemini caído"));

    const res = await post("/api/ai/suggest", { asunto: "Facturación", descripcion: "colgada" });
    expect(res.status).toBe(200);
    expect((await res.json()).disponible).toBe(false);
  });

  it("exige texto para analizar", async () => {
    const res = await post("/api/ai/suggest", { asunto: "", descripcion: "  " });
    expect(res.status).toBe(400);
  });

  // ── 3. Resumen ejecutivo ──────────────────────────────────────────────────

  it("devuelve el resumen cacheado del día sin volver a llamar a Gemini", async () => {
    const cacheado = {
      resumen: "Día tranquilo.",
      hallazgos: ["Redes estable"],
      recomendacion: "Nada urgente",
    };

    mockQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ aceptadas: "3", ofrecidas: "5" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ total: "7" }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ content: JSON.stringify(cacheado), created_at: new Date().toISOString() }],
      });

    const body = await (await get("/api/ai/briefing")).json();

    expect(body.disponible).toBe(true);
    expect(body.resumen).toBe("Día tranquilo.");
    expect(mockBriefing).not.toHaveBeenCalled();
    // 3 aceptadas sobre 3 + 7 tickets creados = 30 %
    expect(body.deflexion.tasa).toBeCloseTo(0.3);
  });

  // ── 4. Incidentes masivos ─────────────────────────────────────────────────

  it("no llama al modelo si no hay tickets suficientes en la ventana", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 1, subject: "Uno", category: "Redes", minutes_ago: 5 }],
    });

    const body = await (await get("/api/ai/incidents")).json();

    expect(body.incidentes).toEqual([]);
    expect(mockCluster).not.toHaveBeenCalled();
  });

  it("filtra los ids inventados por el modelo al agrupar incidentes", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 3,
      rows: [
        { id: 1, subject: "Sin internet piso 2", category: "Redes", minutes_ago: 3 },
        { id: 2, subject: "No carga el CRM", category: "Redes", minutes_ago: 8 },
        { id: 3, subject: "Teclado malogrado", category: "Hardware", minutes_ago: 20 },
      ],
    });

    mockCluster.mockResolvedValueOnce({
      incidentes: [
        {
          titulo: "Caída de red en piso 2",
          resumen: "Varios equipos sin conexión.",
          categoria: "Redes",
          severidad: "media",
          ticketIds: ["1", "2", "555"], // 555 no existe
        },
      ],
    });

    const body = await (await get("/api/ai/incidents")).json();

    expect(body.incidentes).toHaveLength(1);
    expect(body.incidentes[0].ticketIds).toEqual(["1", "2"]);
  });

  it("usa el respaldo por categoría cuando el modelo falla", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 3,
      rows: [
        { id: 1, subject: "Sin internet piso 2", category: "Redes", minutes_ago: 3 },
        { id: 2, subject: "No carga el CRM", category: "Redes", minutes_ago: 8 },
        { id: 3, subject: "VPN caída", category: "Redes", minutes_ago: 12 },
      ],
    });
    mockCluster.mockRejectedValueOnce(new Error("Gemini caído"));

    const body = await (await get("/api/ai/incidents")).json();

    expect(body.incidentes).toHaveLength(1);
    expect(body.incidentes[0].categoria).toBe("Redes");
    expect(body.incidentes[0].ticketIds).toEqual(["1", "2", "3"]);
  });

  // ── 5. Borrador de respuesta ──────────────────────────────────────────────

  it("redacta el borrador con el contexto del ticket y sus comentarios", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            subject: "VPN no conecta",
            description: "No entro desde casa",
            category: "Redes",
            priority: "Alta",
            status: "En progreso",
            client: "Marco Ponce",
            technician_name: "Bruno Castro",
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ author_name: "Bruno Castro", body: "Revisando el firewall" }],
      });

    mockReply.mockResolvedValueOnce({ borrador: "Hola Marco, seguimos revisando el firewall." });

    const res = await post("/api/ai/tickets/5/reply", {});
    expect(res.status).toBe(200);
    expect((await res.json()).borrador).toContain("Marco");

    const enviado = mockReply.mock.calls[0][0] as any;
    expect(enviado.tecnico).toBe("Bruno Castro");
    expect(enviado.comentarios).toHaveLength(1);
  });

  it("responde 404 si el ticket del borrador no existe", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await post("/api/ai/tickets/999/reply", {});
    expect(res.status).toBe(404);
  });

  it("responde 503 si la IA no está configurada", async () => {
    mockConfigured.mockReturnValue(false);

    const res = await post("/api/ai/tickets/5/reply", {});
    expect(res.status).toBe(503);
  });
});
