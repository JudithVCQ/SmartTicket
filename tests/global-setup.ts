/// <reference types="node" />

/**
 * Global setup de Playwright.
 *
 * PROBLEMA REAL DETECTADO POR LAS PRUEBAS DE CAJA NEGRA:
 * `ensureSchema()` (src/lib/db.ts) no tiene lock. Si varias peticiones llegan
 * en paralelo antes de que termine de crear las tablas, se pisan entre sí
 * (DROP/CREATE concurrentes) y truena con "relation ... does not exist".
 *
 * Mientras el bug no se corrija en el backend, este setup hace UNA sola
 * petición secuencial antes de que Playwright dispare los workers en paralelo,
 * forzando a que el esquema y el seed ya existan cuando arrancan los tests.
 */
async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
  const maxRetries = 10;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseURL}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ana@demoticket.com", password: "Demo123!" }),
      });

      // Cualquier respuesta (200 o error controlado) confirma que el server
      // ya está arriba y que ensureSchema() terminó de correr al menos una vez.
      if (response.status !== 0) {
        console.log(`[global-setup] Esquema inicializado (status ${response.status}).`);
        return;
      }
    } catch {
      // Servidor aún no responde, reintentar
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.warn("[global-setup] No se pudo confirmar la inicialización del esquema a tiempo.");
}

export default globalSetup;
