import { test, expect } from '@playwright/test';

test.describe('Ticket Creation Flow', () => {
  test('should create a new ticket successfully', async ({ page }) => {
    // 1. Ir a la página de login
    await page.goto('/login');

    // 2. Llenar el formulario de login (usando credenciales demo)
    await page.fill('input[type="email"]', 'ana@demoticket.com');
    await page.fill('input[type="password"]', 'Demo123!');
    await page.click('button[type="submit"]');

    // 3. Esperar que redirija al dashboard o lista de tickets
    await page.waitForURL('/dashboard');

    // 4. Ir a nueva incidencia
    await page.goto('/tickets/new');

    // 5. Llenar formulario de ticket
    await page.fill('input[placeholder="Ej. Sistema de facturación no responde"]', 'Sistema de facturación caído (Playwright Test)');
    await page.fill('input[placeholder="Ej. María Quispe"]', 'Usuario Test');
    await page.fill('textarea[placeholder*="intentabas hacer"]', 'No se pueden generar comprobantes de pago desde la web.');

    // 6. Enviar
    await page.click('button[type="submit"]');

    // 7. Esperar redirección al ticket creado
    await page.waitForURL(/\/tickets\/.+/);

    // 8. Verificar que aparezca un mensaje de éxito
    await expect(page.locator('text=Ticket creado')).toBeVisible();
  });
});
