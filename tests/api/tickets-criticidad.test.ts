import { describe, it, expect, jest, afterAll } from "@jest/globals";

jest.mock("../../src/lib/ai", () => ({
  categorizeTicketWithAi: jest
    .fn<() => Promise<{ categoria: string; prioridad: string }>>()
    .mockResolvedValue({ categoria: "Software", prioridad: "Baja" }),
}));
jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import server from "../../src/server";
import { closePool } from "../../src/lib/db";

const call = (url: string, init?: RequestInit) =>
  server.fetch(new Request(`http://localhost${url}`, init), {}, {});

const patch = (id: string, body: unknown) =>
  call(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Criticidad y SLA (BD real)", () => {
  let id = "";

  afterAll(async () => {
    if (id) await call(`/api/tickets/${id}`, { method: "DELETE" });
    await closePool();
  });

  it("crea el ticket con el SLA de su prioridad inicial", async () => {
    const res = await call("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: "TMP criticidad",
        descripcion: "Verificación de cambio de criticidad",
        cliente: "QA",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    id = String(body.id);
    expect(body.priority).toBe("Baja");
    expect(body.sla).toBe("24:00:00");
    expect(body.status).toBe("Abierto");
  });

  it("al subir la criticidad recalcula el SLA y lo persiste", async () => {
    const res = await patch(id, { prioridad: "Crítica" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.prioridad).toBe("Crítica");
    expect(body.ticket.slaRestante).toBe("01:00:00");

    const fresh = await (await call(`/api/tickets/${id}`)).json();
    expect(fresh.priority).toBe("Crítica");
    expect(fresh.sla).toBe("01:00:00");
  });

  it("persiste asunto, descripción y categoría desde el formulario de edición", async () => {
    const res = await patch(id, {
      asunto: "TMP criticidad editado",
      descripcion: "Descripción editada",
      categoria: "Redes",
    });
    expect(res.status).toBe(200);

    const fresh = await (await call(`/api/tickets/${id}`)).json();
    expect(fresh.subject).toBe("TMP criticidad editado");
    expect(fresh.description).toBe("Descripción editada");
    expect(fresh.category).toBe("Redes");
  });

  it("congela el SLA al resolver y lo restaura al reabrir", async () => {
    await patch(id, { estado: "Resuelto" });
    let fresh = await (await call(`/api/tickets/${id}`)).json();
    expect(fresh.sla).toBe("—");

    await patch(id, { estado: "Abierto" });
    fresh = await (await call(`/api/tickets/${id}`)).json();
    expect(fresh.sla).toBe("01:00:00");
  });

  it("rechaza estados y prioridades inválidos", async () => {
    expect((await patch(id, { estado: "clasificación manual" })).status).toBe(400);
    expect((await patch(id, { prioridad: "Urgentísima" })).status).toBe(400);
    expect((await patch(id, { tecnico: "Nadie Existente" })).status).toBe(400);
  });
});
