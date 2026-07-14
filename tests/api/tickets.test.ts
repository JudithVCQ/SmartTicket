import { describe, it, expect } from '@jest/globals';
// Simular el servidor para las pruebas
// Dado que la app usa Cloudflare Workers / H3 interno, podemos probar el handler
import server from '../../src/server';

describe('Tickets API', () => {
  it('should return 201 Created when creating a ticket', async () => {
    const mockRequest = new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asunto: 'Test API Asunto',
        descripcion: 'Este es un test de la API de tickets',
        cliente: 'Cliente Test',
        canal: 'API'
      }),
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('subject', 'Test API Asunto');
  });

  it('should return 400 Bad Request if missing fields', async () => {
    const mockRequest = new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asunto: '',
      }),
    });

    const response = await server.fetch(mockRequest, {}, {});
    expect(response.status).toBe(400);
  });
});
