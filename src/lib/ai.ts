import "dotenv/config";

const API_VERSION = "2024-10-21";

/** Una llamada colgada no puede dejar la UI esperando indefinidamente. */
const REQUEST_TIMEOUT_MS = 25000;

function getAzureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, "");
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.GPT_DEPLOYMENT;
  return { endpoint, apiKey, deployment };
}

export function isAiConfigured() {
  const { endpoint, apiKey, deployment } = getAzureConfig();
  return Boolean(endpoint && apiKey && deployment);
}

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

/**
 * Los structured outputs de Azure OpenAI en modo `strict` exigen que cada objeto
 * declare additionalProperties:false y liste todas sus claves en `required`.
 * Lo aplicamos aquí para que los esquemas de abajo se lean sin ese ruido.
 */
function toStrictSchema(schema: JsonSchema): JsonSchema {
  if (schema.type === "array" && schema.items) {
    return { ...schema, items: toStrictSchema(schema.items) };
  }
  if (schema.type !== "object" || !schema.properties) {
    return schema;
  }

  const properties = Object.fromEntries(
    Object.entries(schema.properties).map(([key, value]) => [key, toStrictSchema(value)]),
  );
  return {
    ...schema,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * Pide JSON al modelo con un esquema fijo. Centraliza credenciales, timeout y
 * validación de la respuesta para que cada función se ocupe sólo del prompt.
 */
async function generateJson<T>(prompt: string, responseSchema: JsonSchema): Promise<T> {
  const { endpoint, apiKey, deployment } = getAzureConfig();
  if (!endpoint || !apiKey || !deployment) {
    throw new Error("Las credenciales de Azure OpenAI no están configuradas");
  }

  const response = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`,
    {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        // Temperatura baja: clasificar y resumir tickets debe ser reproducible.
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "respuesta",
            strict: true,
            schema: toStrictSchema(responseSchema),
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const detalle = await response.text().catch(() => "");
    throw new Error(`Azure OpenAI respondió ${response.status}: ${detalle.slice(0, 300)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;

  // El filtro de contenido puede rechazar la petición sin devolver `content`.
  if (message?.refusal) {
    throw new Error(`El modelo rechazó la petición: ${message.refusal}`);
  }
  if (!message?.content) {
    throw new Error("Respuesta vacía del modelo");
  }

  return JSON.parse(message.content) as T;
}

export async function categorizeTicketWithAi(asunto: string, descripcion: string) {
  const prompt = `Analiza el siguiente ticket de soporte técnico y extrae la categoría y la prioridad.
Asunto: ${asunto}
Descripción: ${descripcion}

Asigna la categoría más adecuada (ej. Facturación, Redes, Software, Hardware, Inventario, Capacitación, etc.).
Asigna la prioridad estricta como una de las siguientes opciones: Crítica, Alta, Media, Baja.
`;

  try {
    return await generateJson<{ categoria: string; prioridad: string }>(prompt, {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          description: "La categoría del problema.",
        },
        prioridad: {
          type: "string",
          description: "Prioridad del ticket (Crítica, Alta, Media, Baja).",
          enum: ["Crítica", "Alta", "Media", "Baja"],
        },
      },
      required: ["categoria", "prioridad"],
    });
  } catch (error) {
    console.error("Error al llamar al modelo:", error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Auto-resolución: buscar la respuesta en tickets históricos ya resueltos
// ────────────────────────────────────────────────────────────────────────────

export interface HistoricalTicket {
  id: number | string;
  asunto: string;
  descripcion?: string | null;
  categoria?: string | null;
  resolucion?: string | null;
}

export interface ResolutionSuggestion {
  /** Respuesta accionable para el usuario, en segunda persona. */
  respuesta: string;
  /** 0..1 — por debajo del umbral el servicio no la ofrece. */
  confianza: number;
  /** Ids de los tickets históricos en los que se apoya. */
  referencias: string[];
}

export async function suggestResolutionWithAi(
  asunto: string,
  descripcion: string,
  historicos: HistoricalTicket[],
): Promise<ResolutionSuggestion> {
  const contexto = historicos
    .map(
      (t) =>
        `- [id ${t.id}] ${t.asunto} (${t.categoria ?? "Sin categoría"})\n  Problema: ${t.descripcion ?? "—"}\n  Cómo se resolvió: ${t.resolucion ?? "Sin notas de resolución"}`,
    )
    .join("\n");

  const prompt = `Eres el asistente de soporte de una empresa. Un usuario está por reportar una incidencia.
Antes de crear el ticket, revisa si el problema ya fue resuelto antes y, si es así, dale la solución directamente.

INCIDENCIA NUEVA
Asunto: ${asunto}
Descripción: ${descripcion}

TICKETS YA RESUELTOS DE ESTA MISMA EMPRESA
${contexto || "(no hay historial disponible)"}

Instrucciones:
- Si algún ticket histórico resuelve claramente el mismo problema, redacta pasos concretos que el usuario pueda seguir solo, y cita los ids usados en "referencias".
- La confianza debe ser alta (0.7-1) sólo si el problema es prácticamente el mismo. Si sólo se parece en la categoría, usa 0.3-0.5.
- Si no hay nada parecido, devuelve confianza 0 y una respuesta vacía.
- No inventes procedimientos que no aparezcan en el historial.
- Escribe en español, tuteando al usuario, máximo 120 palabras.`;

  return generateJson<ResolutionSuggestion>(prompt, {
    type: "object",
    properties: {
      respuesta: { type: "string", description: "Pasos concretos para resolverlo." },
      confianza: { type: "number", description: "Confianza de 0 a 1." },
      referencias: { type: "array", items: { type: "string" } },
    },
    required: ["respuesta", "confianza", "referencias"],
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Resumen ejecutivo diario
// ────────────────────────────────────────────────────────────────────────────

export interface BriefingInput {
  organizacion: string;
  totalTickets: number;
  creadosAyer: number;
  abiertos: number;
  enRiesgo: number;
  resueltosAyer: number;
  porCategoria: Array<{ categoria: string; total: number }>;
  porPrioridad: Array<{ prioridad: string; total: number }>;
  tendencias: Array<{ categoria: string; estaSemana: number; semanaPrevia: number }>;
}

export interface Briefing {
  /** Párrafo narrativo para el dueño del negocio. */
  resumen: string;
  /** Observaciones accionables, 2 o 3. */
  hallazgos: string[];
  /** Lo único que debería hacerse hoy. */
  recomendacion: string;
}

export async function generateBriefingWithAi(data: BriefingInput): Promise<Briefing> {
  const prompt = `Eres el jefe de operaciones de soporte de "${data.organizacion}".
Escribe el resumen ejecutivo de hoy para el dueño del negocio, que NO es técnico.

DATOS
- Tickets totales: ${data.totalTickets}
- Creados ayer: ${data.creadosAyer}
- Abiertos ahora: ${data.abiertos}
- En riesgo de incumplir SLA: ${data.enRiesgo}
- Resueltos ayer: ${data.resueltosAyer}
- Por categoría: ${data.porCategoria.map((c) => `${c.categoria}=${c.total}`).join(", ") || "sin datos"}
- Por prioridad: ${data.porPrioridad.map((p) => `${p.prioridad}=${p.total}`).join(", ") || "sin datos"}
- Tendencia semanal: ${
    data.tendencias
      .map((t) => `${t.categoria}: ${t.estaSemana} esta semana vs ${t.semanaPrevia} la previa`)
      .join("; ") || "sin datos"
  }

Instrucciones:
- El resumen es un solo párrafo de máximo 60 palabras, en lenguaje de negocio, sin jerga técnica.
- Los hallazgos deben señalar causas probables, no repetir los números. Si una categoría se disparó, dilo y arriesga una hipótesis.
- La recomendación es una sola acción concreta para hoy.
- Si no hay datos suficientes, dilo con honestidad en vez de inventar tendencias.
- Español, tono directo y profesional.`;

  return generateJson<Briefing>(prompt, {
    type: "object",
    properties: {
      resumen: { type: "string" },
      hallazgos: { type: "array", items: { type: "string" } },
      recomendacion: { type: "string" },
    },
    required: ["resumen", "hallazgos", "recomendacion"],
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Detección de incidentes masivos (varios tickets, una sola causa)
// ────────────────────────────────────────────────────────────────────────────

export interface ClusterCandidate {
  id: number | string;
  asunto: string;
  descripcion?: string | null;
  categoria?: string | null;
  creadoHaceMinutos: number;
}

export interface IncidentCluster {
  titulo: string;
  resumen: string;
  categoria: string;
  severidad: "alta" | "media" | "baja";
  ticketIds: string[];
}

export async function clusterIncidentsWithAi(
  candidatos: ClusterCandidate[],
): Promise<{ incidentes: IncidentCluster[] }> {
  const listado = candidatos
    .map(
      (t) =>
        `- [id ${t.id}] "${t.asunto}" (${t.categoria ?? "Sin categoría"}, hace ${t.creadoHaceMinutos} min)\n` +
        `  Reporte del usuario: ${t.descripcion ?? "—"}`,
    )
    .join("\n");

  const prompt = `Analiza esta cola de tickets abiertos y detecta si varios son síntomas del MISMO incidente
de fondo (por ejemplo una caída de red que genera 5 reportes distintos) en vez de casos aislados.

TICKETS ABIERTOS
${listado}

Cómo razonar:
- Un mismo incidente de infraestructura se reporta con síntomas MUY distintos y cae en categorías
  distintas. "No carga el CRM" (Software), "la impresora de red desapareció" (Hardware) y "Outlook
  desconectado" (Redes) pueden ser todos la misma caída. No descartes un ticket sólo porque su
  categoría no coincide con la del resto.
- Da mucho peso a dos señales: la cercanía en el tiempo y las pistas de ubicación o alcance que el
  usuario menciona en su reporte (un piso, una sede, un área, "a mi compañero de al lado le pasa
  igual", "desde el celular sí funciona").
- Aun así, no fuerces agrupaciones: si un ticket se explica por sí solo, déjalo fuera.

Reglas de salida:
- Un incidente necesita al menos 2 tickets.
- severidad "alta" si son 4 o más tickets o si afecta facturación o red; "media" para 3; "baja" para 2.
- El título debe nombrar la causa probable, no repetir un asunto.
- Si no hay ningún grupo real, devuelve la lista vacía.
- Español, resumen de máximo 25 palabras.`;

  return generateJson<{ incidentes: IncidentCluster[] }>(prompt, {
    type: "object",
    properties: {
      incidentes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            resumen: { type: "string" },
            categoria: { type: "string" },
            severidad: { type: "string", enum: ["alta", "media", "baja"] },
            ticketIds: { type: "array", items: { type: "string" } },
          },
          required: ["titulo", "resumen", "categoria", "severidad", "ticketIds"],
        },
      },
    },
    required: ["incidentes"],
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Borrador de respuesta al cliente
// ────────────────────────────────────────────────────────────────────────────

export interface ReplyInput {
  asunto: string;
  descripcion: string;
  categoria?: string | null;
  prioridad?: string | null;
  estado?: string | null;
  cliente?: string | null;
  tecnico?: string | null;
  comentarios: Array<{ autor: string; texto: string }>;
}

export async function draftReplyWithAi(data: ReplyInput): Promise<{ borrador: string }> {
  const historial =
    data.comentarios.map((c) => `${c.autor}: ${c.texto}`).join("\n") || "(sin comentarios previos)";

  const prompt = `Eres ${data.tecnico || "un técnico de soporte"} y vas a escribir la próxima
actualización para el cliente sobre este ticket.

TICKET
Asunto: ${data.asunto}
Descripción del cliente: ${data.descripcion}
Categoría: ${data.categoria ?? "—"} · Prioridad: ${data.prioridad ?? "—"} · Estado: ${data.estado ?? "—"}
Cliente: ${data.cliente ?? "el cliente"}

CONVERSACIÓN HASTA AHORA
${historial}

Instrucciones:
- Escribe el mensaje que el cliente va a leer, listo para enviar. Sin asunto, sin firma, sin corchetes de relleno.
- Ajusta el tono al estado: si está "Resuelto" confirma la solución; si sigue abierto explica qué se está haciendo y cuál es el siguiente paso.
- Si la prioridad es Crítica, reconoce el impacto al inicio.
- No prometas fechas exactas que no aparezcan en la conversación.
- Español neutro, cercano pero profesional, máximo 100 palabras.`;

  return generateJson<{ borrador: string }>(prompt, {
    type: "object",
    properties: { borrador: { type: "string" } },
    required: ["borrador"],
  });
}
