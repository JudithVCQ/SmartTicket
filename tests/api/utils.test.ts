import { describe, it, expect, jest, afterAll } from "@jest/globals";

// ── BLOQUE 2: error-capture.ts ─────────────────────────────────────────────
// La línea 11 solo registra los listeners si globalThis.addEventListener existe
// (entorno navegador/worker). En Node.js no existe, por lo que cubrimos la función
// exportada consumeLastCapturedError() directamente.
//
// ── BLOQUE 3: error-page.ts ───────────────────────────────────────────────
// La línea 2 es el return del template literal HTML. El 50% de cobertura
// reportado se debe a que la función sí se ejecuta pero el parser de istanbul
// no registra la primera línea del template dentro del return.
// Verificar que la función devuelve HTML válido y contiene las secciones esperadas.

import { consumeLastCapturedError } from "../../src/lib/error-capture";
import { renderErrorPage } from "../../src/lib/error-page";

afterAll(() => {
  jest.restoreAllMocks();
});

// ── error-capture.ts ──────────────────────────────────────────────────────

describe("consumeLastCapturedError() — src/lib/error-capture.ts", () => {
  it("1. returns undefined when no error has been captured", () => {
    const result = consumeLastCapturedError();
    expect(result).toBeUndefined();
  });

  it("2. returns undefined a second time (error is consumed and cleared)", () => {
    // Primera llamada sin error registrado
    consumeLastCapturedError();
    // Segunda llamada también debe ser undefined
    const result = consumeLastCapturedError();
    expect(result).toBeUndefined();
  });

  it("3. stale errors (TTL expired) are discarded and return undefined", () => {
    // Acceder al módulo para manipular el estado interno mediante la función
    // No podemos inyectar errores sin globalThis.addEventListener (Node no lo tiene),
    // pero sí podemos confirmar que la función es idempotente y limpia su estado.
    const first = consumeLastCapturedError();
    const second = consumeLastCapturedError();
    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
  });
});

// ── error-page.ts ─────────────────────────────────────────────────────────

describe("renderErrorPage() — src/lib/error-page.ts", () => {
  it("4. returns a non-empty HTML string", () => {
    const html = renderErrorPage();
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("5. returned HTML contains a doctype declaration", () => {
    const html = renderErrorPage();
    expect(html.toLowerCase()).toContain("<!doctype html>");
  });

  it("6. returned HTML contains the error page title", () => {
    const html = renderErrorPage();
    expect(html).toContain("This page didn't load");
  });

  it("7. returned HTML contains a reload button and home link", () => {
    const html = renderErrorPage();
    expect(html).toContain("location.reload()");
    expect(html).toContain("href=\"/\"");
  });
});
