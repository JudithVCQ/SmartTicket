import { test, expect } from "@playwright/test";

/**
 * Pruebas de CAJA NEGRA — API /api/tickets (HTTP real, sin mocks)
 * A diferencia de tests/api/tickets.test.ts (que mockea ai/db/mailer),
 * aquí se llama al servidor real levantado por webServer en playwright.config.ts.
 * Requiere que las variables de entorno (DB, Gemini, etc.) estén configuradas
 * en el entorno donde corre `npm run dev`.
 */
test.describe("API Tickets — Caja negra (HTTP real)", () => {
  test("CN-13: POST /api/tickets con datos válidos responde 201", async ({ request }) => {
    const response = await request.post("/api/tickets", {
      data: {
        asunto: "Prueba caja negra API",
        descripcion: "Descripción de prueba enviada vía HTTP real.",
        cliente: "Cliente Caja Negra",
        canal: "API",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("subject", "Prueba caja negra API");
  });

  test("CN-14: POST /api/tickets sin campos obligatorios responde 400", async ({ request }) => {
    const response = await request.post("/api/tickets", {
      data: { asunto: "" },
    });

    expect(response.status()).toBe(400);
  });

  test("CN-15: GET /api/tickets/:id con id inexistente responde 404", async ({ request }) => {
    // Nota: esta app es una SPA (TanStack Start). Cualquier ruta que NO matchee
    // exactamente /api/tickets/(\\d+) cae al catch-all del router y devuelve 200
    // con el HTML de la app (comportamiento esperado, no es un bug).
    // El único 404 "real" de la API ocurre cuando el id SÍ matchea el patrón
    // numérico pero no existe en BD (ver server.ts, handleTicketsApi).
    const response = await request.get("/api/tickets/999999");
    expect(response.status()).toBe(404);
  });

  test("CN-16: POST /api/auth/login con credenciales incorrectas responde error controlado", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: "no-existe@demoticket.com", password: "incorrecta" },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});
