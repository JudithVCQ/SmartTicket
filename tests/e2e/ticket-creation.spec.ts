import { test, expect } from "@playwright/test";

test.describe("Ticket Creation Flow", () => {
  test("should create a new ticket successfully", async ({ page }) => {
    test.setTimeout(120000);

    // Login
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // espera a que React termine de hidratar
    await page.fill('input[type="email"]', "ana@demoticket.com");
    await page.fill('input[type="password"]', "Demo123!");
    await page.click('button[type="submit"]');

    // Esperar a que la API responda y la ruta sea /dashboard
    await page.waitForResponse((res) => res.url().includes("/api/auth/login"), { timeout: 60000 });
    await page.waitForURL(/\/dashboard$/, { timeout: 30000 });

    // Nuevo ticket
    // NOTA: no usar page.goto("/tickets/new") — el guard de auth en __root.tsx
    // corre en SSR y localStorage no existe ahí, así que una navegación dura
    // siempre redirige a /login. Se navega por la SPA con el link del nav.
    await page.getByRole("link", { name: "Nueva incidencia" }).click();
    await page.waitForURL(/\/tickets\/new$/, { timeout: 10000 });
    await page.fill(
      'input[placeholder*="facturación"]',
      "Sistema de facturación caído (Playwright Test)",
    );
    await page.fill('input[placeholder*="María"]', "Usuario Test");
    await page.fill("textarea", "No se pueden generar comprobantes de pago desde la web.");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/tickets\/.+/);
    await expect(page.locator("text=Ticket creado")).toBeVisible();
  });
});
