# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ticket-creation.spec.ts >> Ticket Creation Flow >> should create a new ticket successfully
- Location: tests\e2e\ticket-creation.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button[type="submit"]')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "SMARTTICKET" [ref=e5] [cursor=pointer]:
          - /url: /
        - generic [ref=e6]: v4.2.0
    - main [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: Acceso seguro
        - heading "Inicia sesión" [level=1] [ref=e10]
        - paragraph [ref=e11]: Continúa gestionando el soporte de tu MYPE.
        - generic [ref=e13]:
          - generic [ref=e14]:
            - text: Correo corporativo
            - textbox "Correo corporativo" [ref=e15]:
              - /placeholder: contacto@mypeperu.com
              - text: ana@demoticket.com
          - generic [ref=e16]:
            - text: Contraseña
            - textbox "Contraseña" [active] [ref=e17]:
              - /placeholder: ••••••••
              - text: Demo123!
          - link "¿Olvidaste tu contraseña?" [ref=e19] [cursor=pointer]:
            - /url: /forgot-password
          - button "Entrar al panel" [ref=e20]
          - generic [ref=e21]: Conexión cifrada · JWT
        - generic [ref=e22]:
          - text: ¿Aún no tienes cuenta?
          - link "Regístrate gratis" [ref=e23] [cursor=pointer]:
            - /url: /register
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Ticket Creation Flow', () => {
  4  |   test('should create a new ticket successfully', async ({ page }) => {
  5  |     // 1. Ir a la página de login
  6  |     await page.goto('/login');
  7  | 
  8  |     // 2. Llenar el formulario de login (usando credenciales demo)
  9  |     await page.fill('input[type="email"]', 'ana@demoticket.com');
  10 |     await page.fill('input[type="password"]', 'Demo123!');
> 11 |     await page.click('button[type="submit"]');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  12 | 
  13 |     // 3. Esperar que redirija al dashboard o lista de tickets
  14 |     await page.waitForURL('/dashboard');
  15 | 
  16 |     // 4. Ir a nueva incidencia
  17 |     await page.goto('/tickets/new');
  18 | 
  19 |     // 5. Llenar formulario de ticket
  20 |     await page.fill('input[placeholder="Ej. Sistema de facturación no responde"]', 'Sistema de facturación caído (Playwright Test)');
  21 |     await page.fill('input[placeholder="Ej. María Quispe"]', 'Usuario Test');
  22 |     await page.fill('textarea[placeholder*="intentabas hacer"]', 'No se pueden generar comprobantes de pago desde la web.');
  23 | 
  24 |     // 6. Enviar
  25 |     await page.click('button[type="submit"]');
  26 | 
  27 |     // 7. Esperar redirección al ticket creado
  28 |     await page.waitForURL(/\/tickets\/.+/);
  29 | 
  30 |     // 8. Verificar que aparezca un mensaje de éxito
  31 |     await expect(page.locator('text=Ticket creado')).toBeVisible();
  32 |   });
  33 | });
  34 | 
```