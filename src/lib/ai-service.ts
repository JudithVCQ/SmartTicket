import {
  clusterIncidentsWithAi,
  draftReplyWithAi,
  generateBriefingWithAi,
  isAiConfigured,
  suggestAssigneeWithAi,
  suggestResolutionWithAi,
  type Briefing,
  type IncidentCluster,
  type RoutingCandidate,
} from "./ai";
import { ensureSchema, query, AppEnv } from "./db";
import { checkTicketAccess, resolveOrganizationId } from "./org-access";
import { isClosedStatus } from "./ticket-rules";

type ServiceResponse = { status: number; body: unknown };

/** Confianza mínima para ofrecerle una auto-resolución al usuario. */
const MIN_CONFIDENCE = 0.45;

/** Ventana en la que varios tickets parecidos se consideran un mismo incidente. */
const INCIDENT_WINDOW_HOURS = 24;
const INCIDENT_MIN_TICKETS = 2;

const STOPWORDS = new Set([
  "para",
  "desde",
  "cuando",
  "porque",
  "sobre",
  "entre",
  "todos",
  "todas",
  "puede",
  "puedo",
  "hacer",
  "tiene",
  "estoy",
  "sistema",
  "problema",
  "favor",
  "ayuda",
  "error",
]);

/**
 * Palabras con carga semántica del texto del ticket, para buscar históricos
 * parecidos sin depender de full-text search específico del motor.
 */
function extractKeywords(text: string, limit = 6): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-záéíóúñü0-9]+/i)) {
    if (raw.length < 5 || STOPWORDS.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Auto-resolución
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tickets ya resueltos de la organización que se parecen al texto dado. Las
 * notas de resolución salen de los comentarios, que es donde el técnico cuenta
 * qué hizo.
 */
async function findHistoricalMatches(env: AppEnv, organizationId: number, texto: string) {
  const base = `SELECT t.id, t.subject, t.description, t.category,
       (SELECT string_agg(c.body, ' | ' ORDER BY c.created_at)
          FROM ticket_comments c WHERE c.ticket_id = t.id) AS resolution_notes
     FROM tickets t
     WHERE t.organization_id = $1
       AND t.status IN ('Resuelto', 'Cerrado')`;

  const keywords = extractKeywords(texto);
  if (keywords.length > 0) {
    const patterns = keywords.map((k) => `%${k}%`);
    const porPalabra = await query(
      env,
      `${base} AND (t.subject ILIKE ANY($2) OR t.description ILIKE ANY($2))
       ORDER BY t.updated_at DESC LIMIT 8`,
      [organizationId, patterns],
    );
    if ((porPalabra.rowCount ?? 0) > 0) return porPalabra.rows;
  }

  // Sin coincidencias léxicas le damos igual contexto reciente: puede que el
  // parecido sea semántico y sólo el modelo lo vea.
  const recientes = await query(env, `${base} ORDER BY t.updated_at DESC LIMIT 6`, [
    organizationId,
  ]);
  return recientes.rows;
}

export async function suggestResolution(
  request: Request,
  payload: { asunto?: string; descripcion?: string },
  env: AppEnv,
): Promise<ServiceResponse> {
  const asunto = payload.asunto?.trim() ?? "";
  const descripcion = payload.descripcion?.trim() ?? "";

  if (!asunto && !descripcion) {
    return { status: 400, body: { message: "Describe la incidencia para poder analizarla" } };
  }
  if (!isAiConfigured()) {
    return { status: 200, body: { disponible: false, motivo: "IA no configurada" } };
  }

  await ensureSchema(env);
  const organizationId = await resolveOrganizationId(request, env);
  const historicos = await findHistoricalMatches(env, organizationId, `${asunto} ${descripcion}`);

  if (historicos.length === 0) {
    return { status: 200, body: { disponible: false, motivo: "Sin historial suficiente" } };
  }

  let sugerencia;
  try {
    sugerencia = await suggestResolutionWithAi(
      asunto,
      descripcion,
      historicos.map((row) => ({
        id: row.id as number,
        asunto: row.subject as string,
        descripcion: row.description as string | null,
        categoria: row.category as string | null,
        resolucion: row.resolution_notes as string | null,
      })),
    );
  } catch (error) {
    console.error("Error generando auto-resolución:", error);
    return { status: 200, body: { disponible: false, motivo: "La IA no está disponible" } };
  }

  const confianza = Number(sugerencia.confianza) || 0;
  if (confianza < MIN_CONFIDENCE || !sugerencia.respuesta?.trim()) {
    return { status: 200, body: { disponible: false, motivo: "Sin coincidencias claras" } };
  }

  // Sólo devolvemos referencias que existan de verdad en el historial enviado.
  const idsValidos = new Set(historicos.map((row) => String(row.id)));
  const referencias = (sugerencia.referencias ?? []).filter((id) => idsValidos.has(String(id)));

  const registro = await query(
    env,
    `INSERT INTO ai_deflections (organization_id, subject, suggestion, confidence)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [organizationId, asunto || descripcion.slice(0, 120), sugerencia.respuesta, confianza],
  );

  return {
    status: 200,
    body: {
      disponible: true,
      deflectionId: String(registro.rows[0].id),
      respuesta: sugerencia.respuesta.trim(),
      confianza,
      referencias: historicos
        .filter((row) => referencias.includes(String(row.id)))
        .map((row) => ({ id: String(row.id), asunto: row.subject as string })),
    },
  };
}

/** El usuario confirmó que la sugerencia le sirvió: el ticket nunca se creó. */
export async function acceptDeflection(
  request: Request,
  payload: { deflectionId?: string },
  env: AppEnv,
): Promise<ServiceResponse> {
  const id = parseInt(String(payload.deflectionId ?? ""), 10);
  if (Number.isNaN(id)) {
    return { status: 400, body: { message: "deflectionId no válido" } };
  }

  await ensureSchema(env);
  const organizationId = await resolveOrganizationId(request, env);

  const result = await query(
    env,
    `UPDATE ai_deflections SET accepted = true
     WHERE id = $1 AND organization_id = $2 RETURNING id`,
    [id, organizationId],
  );

  if ((result.rowCount ?? 0) === 0) {
    return { status: 404, body: { message: "Sugerencia no encontrada" } };
  }
  return { status: 200, body: { success: true } };
}

/** Tasa de deflexión de los últimos 30 días: incidencias resueltas sin ticket. */
async function getDeflectionStats(env: AppEnv, organizationId: number) {
  const deflections = await query(
    env,
    `SELECT COUNT(*) FILTER (WHERE accepted) AS aceptadas, COUNT(*) AS ofrecidas
     FROM ai_deflections
     WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [organizationId],
  );
  const creados = await query(
    env,
    `SELECT COUNT(*) AS total FROM tickets
     WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [organizationId],
  );

  const aceptadas = Number(deflections.rows[0]?.aceptadas ?? 0);
  const ofrecidas = Number(deflections.rows[0]?.ofrecidas ?? 0);
  const ticketsCreados = Number(creados.rows[0]?.total ?? 0);
  const universo = aceptadas + ticketsCreados;

  return {
    aceptadas,
    ofrecidas,
    ticketsCreados,
    tasa: universo > 0 ? aceptadas / universo : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Resumen ejecutivo diario
// ────────────────────────────────────────────────────────────────────────────

async function collectBriefingData(env: AppEnv, organizationId: number) {
  const org = await query(env, "SELECT name FROM organizations WHERE id = $1", [organizationId]);

  const totales = await query(
    env,
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status NOT IN ('Resuelto', 'Cerrado')) AS abiertos,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND created_at < CURRENT_DATE) AS creados_ayer,
       COUNT(*) FILTER (WHERE status IN ('Resuelto', 'Cerrado')
                          AND updated_at >= CURRENT_DATE - INTERVAL '1 day') AS resueltos_ayer,
       COUNT(*) FILTER (WHERE status NOT IN ('Resuelto', 'Cerrado')
                          AND priority IN ('Crítica', 'Alta')) AS en_riesgo
     FROM tickets WHERE organization_id = $1`,
    [organizationId],
  );

  const porCategoria = await query(
    env,
    `SELECT COALESCE(category, 'Sin categoría') AS categoria, COUNT(*) AS total
     FROM tickets WHERE organization_id = $1
     GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
    [organizationId],
  );

  const porPrioridad = await query(
    env,
    `SELECT priority AS prioridad, COUNT(*) AS total
     FROM tickets WHERE organization_id = $1
     GROUP BY 1 ORDER BY 2 DESC`,
    [organizationId],
  );

  const tendencias = await query(
    env,
    `SELECT COALESCE(category, 'Sin categoría') AS categoria,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS esta_semana,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days'
                               AND created_at < NOW() - INTERVAL '7 days') AS semana_previa
     FROM tickets
     WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
     GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    [organizationId],
  );

  const fila = totales.rows[0] ?? {};
  return {
    organizacion: (org.rows[0]?.name as string) || "tu organización",
    totalTickets: Number(fila.total ?? 0),
    abiertos: Number(fila.abiertos ?? 0),
    creadosAyer: Number(fila.creados_ayer ?? 0),
    resueltosAyer: Number(fila.resueltos_ayer ?? 0),
    enRiesgo: Number(fila.en_riesgo ?? 0),
    porCategoria: porCategoria.rows.map((r) => ({
      categoria: r.categoria as string,
      total: Number(r.total),
    })),
    porPrioridad: porPrioridad.rows.map((r) => ({
      prioridad: r.prioridad as string,
      total: Number(r.total),
    })),
    tendencias: tendencias.rows.map((r) => ({
      categoria: r.categoria as string,
      estaSemana: Number(r.esta_semana),
      semanaPrevia: Number(r.semana_previa),
    })),
  };
}

export async function getBriefing(
  request: Request,
  env: AppEnv,
  options: { refresh?: boolean } = {},
): Promise<ServiceResponse> {
  await ensureSchema(env);
  const organizationId = await resolveOrganizationId(request, env);
  const deflexion = await getDeflectionStats(env, organizationId);

  if (!options.refresh) {
    const cache = await query(
      env,
      `SELECT content, created_at FROM ai_briefings
       WHERE organization_id = $1 AND day = CURRENT_DATE`,
      [organizationId],
    );
    if ((cache.rowCount ?? 0) > 0) {
      return {
        status: 200,
        body: {
          disponible: true,
          ...(JSON.parse(cache.rows[0].content as string) as Briefing),
          generadoEn: cache.rows[0].created_at,
          deflexion,
        },
      };
    }
  }

  const datos = await collectBriefingData(env, organizationId);

  if (!isAiConfigured()) {
    return { status: 200, body: { disponible: false, motivo: "IA no configurada", deflexion } };
  }

  let briefing: Briefing;
  try {
    briefing = await generateBriefingWithAi(datos);
  } catch (error) {
    console.error("Error generando el resumen ejecutivo:", error);
    return {
      status: 200,
      body: { disponible: false, motivo: "La IA no está disponible", deflexion },
    };
  }

  // ON CONFLICT para que dos pestañas abiertas a la vez no dupliquen el día.
  await query(
    env,
    `INSERT INTO ai_briefings (organization_id, day, content)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (organization_id, day)
     DO UPDATE SET content = EXCLUDED.content, created_at = NOW()`,
    [organizationId, JSON.stringify(briefing)],
  );

  return {
    status: 200,
    body: { disponible: true, ...briefing, generadoEn: new Date().toISOString(), deflexion },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Incidentes masivos
// ────────────────────────────────────────────────────────────────────────────

/** Respaldo sin IA: varios tickets abiertos de la misma categoría en la ventana. */
function clusterByCategory(
  candidatos: Array<{ id: string; asunto: string; categoria: string; minutos: number }>,
): IncidentCluster[] {
  const porCategoria = new Map<string, typeof candidatos>();
  for (const c of candidatos) {
    porCategoria.set(c.categoria, [...(porCategoria.get(c.categoria) ?? []), c]);
  }

  return [...porCategoria.entries()]
    .filter(([, grupo]) => grupo.length >= 3)
    .map(([categoria, grupo]) => ({
      titulo: `Posible incidente en ${categoria}`,
      resumen: `${grupo.length} tickets de ${categoria} abiertos en las últimas ${INCIDENT_WINDOW_HOURS} h.`,
      categoria,
      severidad: (grupo.length >= 4 ? "alta" : "media") as IncidentCluster["severidad"],
      ticketIds: grupo.map((g) => g.id),
    }));
}

export async function getIncidents(request: Request, env: AppEnv): Promise<ServiceResponse> {
  await ensureSchema(env);
  const organizationId = await resolveOrganizationId(request, env);

  const result = await query(
    env,
    `SELECT id, subject, description, COALESCE(category, 'Sin categoría') AS category,
            EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS minutes_ago
     FROM tickets
     WHERE organization_id = $1
       AND status NOT IN ('Resuelto', 'Cerrado')
       AND created_at > NOW() - INTERVAL '${INCIDENT_WINDOW_HOURS} hours'
     ORDER BY created_at DESC
     LIMIT 25`,
    [organizationId],
  );

  const candidatos = result.rows.map((row) => ({
    id: String(row.id),
    asunto: row.subject as string,
    // Recortada: las pistas de ubicación y alcance están al inicio del reporte.
    descripcion: ((row.description as string) ?? "").slice(0, 300),
    categoria: row.category as string,
    minutos: Math.round(Number(row.minutes_ago ?? 0)),
  }));

  if (candidatos.length < INCIDENT_MIN_TICKETS) {
    return { status: 200, body: { incidentes: [], analizados: candidatos.length } };
  }

  if (isAiConfigured()) {
    try {
      const { incidentes } = await clusterIncidentsWithAi(
        candidatos.map((c) => ({
          id: c.id,
          asunto: c.asunto,
          descripcion: c.descripcion,
          categoria: c.categoria,
          creadoHaceMinutos: c.minutos,
        })),
      );

      // El modelo puede citar ids que no enviamos: nos quedamos sólo con los reales.
      const validos = new Set(candidatos.map((c) => c.id));
      const limpios = incidentes
        .map((i) => ({
          ...i,
          ticketIds: (i.ticketIds ?? []).filter((id) => validos.has(String(id))),
        }))
        .filter((i) => i.ticketIds.length >= INCIDENT_MIN_TICKETS);

      return { status: 200, body: { incidentes: limpios, analizados: candidatos.length } };
    } catch (error) {
      console.error("Error agrupando incidentes, se usa el respaldo heurístico:", error);
    }
  }

  return {
    status: 200,
    body: { incidentes: clusterByCategory(candidatos), analizados: candidatos.length },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Borrador de respuesta
// ────────────────────────────────────────────────────────────────────────────

export async function draftReply(
  request: Request,
  ticketId: number,
  env: AppEnv,
): Promise<ServiceResponse> {
  if (!isAiConfigured()) {
    return { status: 503, body: { message: "La redacción con IA no está configurada" } };
  }

  await ensureSchema(env);

  const denied = await checkTicketAccess(request, env, ticketId);
  if (denied) return { status: denied.status, body: { message: denied.message } };

  const result = await query(
    env,
    `SELECT t.subject, t.description, t.category, t.priority, t.status, t.client,
            u.full_name AS technician_name
     FROM tickets t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.id = $1`,
    [ticketId],
  );
  if (result.rowCount === 0) {
    return { status: 404, body: { message: "Ticket no encontrado" } };
  }

  const comentarios = await query(
    env,
    `SELECT author_name, body FROM ticket_comments
     WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 20`,
    [ticketId],
  );

  const ticket = result.rows[0];
  try {
    const { borrador } = await draftReplyWithAi({
      asunto: ticket.subject as string,
      descripcion: (ticket.description as string) ?? "",
      categoria: ticket.category as string | null,
      prioridad: ticket.priority as string | null,
      estado: ticket.status as string | null,
      cliente: ticket.client as string | null,
      tecnico: ticket.technician_name as string | null,
      comentarios: comentarios.rows.map((c) => ({
        autor: c.author_name as string,
        texto: c.body as string,
      })),
    });

    return {
      status: 200,
      body: { borrador: borrador.trim(), cerrado: isClosedStatus(ticket.status) },
    };
  } catch (error) {
    console.error("Error redactando la respuesta:", error);
    return { status: 502, body: { message: "La IA no pudo redactar la respuesta" } };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Enrutamiento automático
// ────────────────────────────────────────────────────────────────────────────

/**
 * Carga y experiencia de cada persona del equipo de soporte. Los números son
 * reales: salen de los tickets, no los estima el modelo.
 */
async function getRoutingCandidates(env: AppEnv, organizationId: number, categoria: string) {
  const result = await query(
    env,
    `SELECT u.id, u.full_name, u.email,
            COUNT(*) FILTER (
              WHERE t.status NOT IN ('Resuelto', 'Cerrado')
            ) AS abiertos,
            COUNT(*) FILTER (
              WHERE t.status IN ('Resuelto', 'Cerrado') AND t.category = $2
            ) AS resueltos_categoria,
            COUNT(*) FILTER (WHERE t.status IN ('Resuelto', 'Cerrado')) AS resueltos_total
     FROM users u
     LEFT JOIN tickets t ON t.assigned_to = u.id AND t.organization_id = u.organization_id
     WHERE u.organization_id = $1 AND u.role IN ('owner', 'tech')
     GROUP BY u.id, u.full_name, u.email`,
    [organizationId, categoria],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    nombre: (row.full_name as string) || (row.email as string),
    abiertos: Number(row.abiertos ?? 0),
    resueltosEnCategoria: Number(row.resueltos_categoria ?? 0),
    resueltosTotal: Number(row.resueltos_total ?? 0),
  }));
}

/**
 * Reparto sin modelo: premia la experiencia en la categoría y penaliza la carga
 * actual. Es el respaldo cuando la IA no está disponible, y el criterio con el
 * que se contrasta lo que propone.
 */
function pickByScore(candidatos: RoutingCandidate[]): RoutingCandidate {
  return [...candidatos].sort((a, b) => {
    const puntaje = (c: RoutingCandidate) => c.resueltosEnCategoria * 2 - c.abiertos;
    return puntaje(b) - puntaje(a) || a.abiertos - b.abiertos;
  })[0];
}

export interface Assignment {
  tecnicoId: string;
  nombre: string;
  motivo: string;
  /** true cuando el reparto lo decidió el respaldo determinista. */
  automatico: boolean;
}

/**
 * Elige a quién le toca un ticket recién creado. Devuelve null si la
 * organización no tiene equipo de soporte: en ese caso el ticket se queda en la
 * cola sin asignar, que es el comportamiento correcto.
 */
export async function routeTicket(
  env: AppEnv,
  organizationId: number,
  ticket: { asunto: string; descripcion: string; categoria: string; prioridad: string },
): Promise<Assignment | null> {
  const candidatos = await getRoutingCandidates(env, organizationId, ticket.categoria);
  if (candidatos.length === 0) return null;

  const porDefecto = pickByScore(candidatos);

  if (candidatos.length === 1 || !isAiConfigured()) {
    return {
      tecnicoId: porDefecto.id,
      nombre: porDefecto.nombre,
      motivo: `Asignado a ${porDefecto.nombre}: ${porDefecto.resueltosEnCategoria} tickets resueltos en ${ticket.categoria} y ${porDefecto.abiertos} abiertos ahora.`,
      automatico: true,
    };
  }

  try {
    const decision = await suggestAssigneeWithAi(ticket, candidatos);
    // El modelo a veces adorna el id ("id 2" en vez de "2"); nos quedamos con los
    // dígitos y, aun así, sólo aceptamos ids que existan de verdad.
    const idLimpio = String(decision.tecnicoId ?? "").replace(/\D/g, "");
    const elegido = candidatos.find((c) => c.id === idLimpio);
    if (elegido) {
      return {
        tecnicoId: elegido.id,
        nombre: elegido.nombre,
        motivo: decision.motivo,
        automatico: false,
      };
    }
    console.error("El modelo propuso un técnico inexistente, se usa el reparto por carga");
  } catch (error) {
    console.error("Error enrutando el ticket, se usa el reparto por carga:", error);
  }

  return {
    tecnicoId: porDefecto.id,
    nombre: porDefecto.nombre,
    motivo: `Asignado a ${porDefecto.nombre}: ${porDefecto.resueltosEnCategoria} tickets resueltos en ${ticket.categoria} y ${porDefecto.abiertos} abiertos ahora.`,
    automatico: true,
  };
}
