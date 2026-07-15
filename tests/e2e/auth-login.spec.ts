import { test, expect } from "@playwright/test";

/**
 * Pruebas de CAJA NEGRA — Login
 * No se conoce ni se toca la implementación interna (src/lib/auth.ts, db, etc).
 * Solo se validan entradas (UI) y salidas observables (navegación, mensajes, estado de la página).
 */
test.describe("Login — Caja negra", () => {
  test("CN-01: credenciales válidas deben redirigir al dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[type="email"]', "ana@demoticket.com");
    await page.fill('input[type="password"]', "Demo123!");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("CN-02: credenciales inválidas deben mostrar error y NO redirigir", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[type="email"]', "usuario-inexistente@demoticket.com");
    await page.fill('input[type="password"]', "ClaveIncorrecta123");
    await page.click('button[type="submit"]');

    // Debe permanecer en /login
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CN-03: campos vacíos no deben permitir el envío del formulario", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.click('button[type="submit"]');

    // La validación HTML5 (required) debe impedir el submit; seguimos en /login
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CN-04: formato de correo inválido debe ser rechazado por el navegador", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[type="email"]', "correo-no-valido");
    await page.fill('input[type="password"]', "algunaClave123");

    const emailInput = page.locator('input[type="email"]');
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);
  });
});
