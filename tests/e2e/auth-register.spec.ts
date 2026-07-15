import { test, expect } from "@playwright/test";

/**
 * Pruebas de CAJA NEGRA — Registro
 */
test.describe("Registro — Caja negra", () => {
  test("CN-05: registro con datos válidos debe redirigir a /login", async ({ page }) => {
    const uniqueEmail = `usuario.test.${Date.now()}@demoticket.com`;

    await page.goto("/register");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[name="firstName"]', "Usuario");
    await page.fill('input[name="lastName"]', "Prueba");
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', "Demo123!");
    // Si existe campo de empresa, se completa (ajustar selector si difiere)
    const companyInput = page.locator('input[name="company"]');
    if (await companyInput.count()) {
      await companyInput.fill("MYPE Test S.A.C.");
    }
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/login$/, { timeout: 30000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CN-06: registro con correo ya existente debe mostrar error", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[name="firstName"]', "Ana");
    await page.fill('input[name="lastName"]', "Duplicada");
    await page.fill('input[name="email"]', "ana@demoticket.com"); // correo demo ya existente
    await page.fill('input[name="password"]', "Demo123!");
    await page.click('button[type="submit"]');

    // Debe permanecer en /register (no redirige a /login)
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/register$/);
  });

  test("CN-07: campos obligatorios vacíos impiden el envío", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/register$/);
  });
});
