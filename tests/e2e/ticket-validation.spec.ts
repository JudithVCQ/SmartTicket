import { test, expect } from "@playwright/test";

/**
 * Pruebas de CAJA NEGRA — Validación de creación de tickets
 * Complementa a tests/e2e/ticket-creation.spec.ts (caso feliz).
 * Aquí se cubren particiones de equivalencia y valores límite del formulario.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
  await page.fill('input[type="email"]', "ana@demoticket.com");
  await page.fill('input[type="password"]', "Demo123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
}

/**
 * BUG CONOCIDO (ver __root.tsx beforeLoad + auth-session.ts):
 * isAuthenticated() lee localStorage, que no existe en SSR. Por eso una
 * navegación "dura" (page.goto) a una ruta protegida SIEMPRE redirige a
 * /login en el servidor, aunque el usuario esté logueado en el navegador.
 * Workaround: navegar por SPA haciendo clic en el link "Nueva incidencia"
 * del AppNav, en vez de page.goto("/tickets/new").
 */
async function goToNewTicket(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "Nueva incidencia" }).click();
  await page.waitForURL(/\/tickets\/new$/, { timeout: 10000 });
}

test.describe("Creación de tickets — Caja negra", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("CN-08: asunto vacío no debe permitir crear el ticket", async ({ page }) => {
    await goToNewTicket(page);
    await page.fill("textarea", "Descripción válida del problema reportado.");
    await page.click('button[type="submit"]');

    // Debe permanecer en /tickets/new (validación required del input)
    await expect(page).toHaveURL(/\/tickets\/new$/);
  });

  test("CN-09: descripción vacía no debe permitir crear el ticket", async ({ page }) => {
    await goToNewTicket(page);
    await page.fill('input[placeholder*="facturación"]', "Asunto de prueba caja negra");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/tickets\/new$/);
  });

  test("CN-10: asunto en el límite de 120 caracteres debe aceptarse", async ({ page }) => {
    const asunto120 = "A".repeat(120);

    await goToNewTicket(page);
    await page.fill('input[placeholder*="facturación"]', asunto120);
    await page.fill("textarea", "Descripción válida para prueba de límite de caracteres.");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/tickets\/.+/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/tickets\/.+/);
  });

  test("CN-11: el input de asunto no debe aceptar más de 120 caracteres (maxlength)", async ({
    page,
  }) => {
    const asuntoLargo = "B".repeat(200);

    await goToNewTicket(page);
    const asuntoInput = page.locator('input[placeholder*="facturación"]');
    await asuntoInput.fill(asuntoLargo);

    const valor = await asuntoInput.inputValue();
    expect(valor.length).toBeLessThanOrEqual(120);
  });

  test("CN-12: ticket creado exitosamente debe mostrar confirmación visible", async ({
    page,
  }) => {
    await goToNewTicket(page);
    await page.fill(
      'input[placeholder*="facturación"]',
      "Error al generar reporte mensual (CN-12)",
    );
    await page.fill('input[placeholder*="María"]', "Cliente Caja Negra");
    await page.fill("textarea", "El reporte mensual no se genera desde el panel de administración.");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/tickets\/.+/, { timeout: 30000 });
    await expect(page.locator("text=Ticket creado")).toBeVisible();
  });
});
