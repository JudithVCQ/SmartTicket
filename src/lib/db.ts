import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool, QueryResultRow } from "pg";

export interface AppEnv {
  DATABASE_URL?: string;
}

let pool: Pool | undefined;
let schemaInitialized = false;

function getDatabaseUrl(env: AppEnv) {
  if (env?.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  if (typeof process !== "undefined" && process.env?.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error(
    "DATABASE_URL is required. Set it as an environment variable or Cloudflare secret.",
  );
}

function getPool(env: AppEnv) {
  if (!pool) {
    const databaseUrl = getDatabaseUrl(env);
    const parsedUrl = new URL(databaseUrl);

    pool = new Pool({
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 5432),
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      database: parsedUrl.pathname.replace(/^\/+/, "") || "defaultdb",
      ssl: {
        rejectUnauthorized: false,
      },
      max: 5, // Suficiente para ensureSchema + requests concurrentes sin saturar Aiven free tier
      connectionTimeoutMillis: 15000, // Aiven puede tardar en la primera conexión SSL en frío
      idleTimeoutMillis: 30000, // Liberar conexiones inactivas tras 30s
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  env: AppEnv,
  text: string,
  params: unknown[] = [],
) {
  const client = await getPool(env).connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

/** Cierra el pool de conexiones. Llamar en afterAll() de los tests que usan la BD real. */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
    schemaInitialized = false;
  }
}

async function ensureTablesExist(env: AppEnv) {
  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  );

  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      company TEXT,
      organization_id INTEGER REFERENCES organizations(id),
      role TEXT NOT NULL DEFAULT 'member',
      is_verified BOOLEAN NOT NULL DEFAULT false,
      verification_token TEXT,
      verification_token_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  );

  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      description TEXT,
      client TEXT,
      category TEXT,
      priority TEXT NOT NULL DEFAULT 'Media',
      status TEXT NOT NULL DEFAULT 'Abierto',
      sla TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  );

  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  );

  // El detalle del ticket siempre lee los comentarios filtrando por ticket_id.
  await query(
    env,
    `CREATE INDEX IF NOT EXISTS ticket_comments_ticket_id_idx
     ON ticket_comments (ticket_id, created_at)`,
  );

  // Cada vez que la IA propone una solución antes de crear el ticket queda un
  // registro aquí. Es lo que permite calcular la tasa de deflexión.
  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS ai_deflections (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      suggestion TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      accepted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  );

  await query(
    env,
    `CREATE INDEX IF NOT EXISTS ai_deflections_org_idx
     ON ai_deflections (organization_id, created_at)`,
  );

  // El resumen ejecutivo se genera una vez al día por organización; sin esta
  // caché cada carga del dashboard sería una llamada al modelo.
  await query(
    env,
    `
    CREATE TABLE IF NOT EXISTS ai_briefings (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, day)
    );
  `,
  );

  await applyAdditiveMigrations(env);
}

/**
 * Las tablas se crean con CREATE TABLE IF NOT EXISTS, así que una base que ya
 * existía nunca recibiría las columnas nuevas. Estas sentencias son idempotentes
 * y se pueden ejecutar en cada arranque sin coste apreciable.
 */
async function applyAdditiveMigrations(env: AppEnv) {
  // Quién tecleó el ticket y de quién es el problema son dos cosas distintas:
  // un técnico puede registrar una incidencia en nombre de un trabajador, y ese
  // trabajador debe seguir viéndola en "Mis tickets".
  await query(
    env,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_by INTEGER
       REFERENCES users(id) ON DELETE SET NULL`,
  );
  await query(
    env,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_id INTEGER
       REFERENCES users(id) ON DELETE SET NULL`,
  );
  await query(
    env,
    `CREATE INDEX IF NOT EXISTS tickets_requester_idx
       ON tickets (organization_id, requester_id)`,
  );

  // Prioridad que asignó la IA al crear el ticket. Se conserva aunque un humano
  // la cambie después: la diferencia entre ambas es la corrección de la que el
  // clasificador aprende los criterios de cada empresa.
  await query(env, `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_priority TEXT`);

  // Dominio de correo corporativo: permite que un trabajador se registre solo y
  // caiga en la organización correcta sin que nadie lo invite.
  await query(env, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS domain TEXT`);
  await query(
    env,
    `CREATE UNIQUE INDEX IF NOT EXISTS organizations_domain_idx
       ON organizations (domain) WHERE domain IS NOT NULL`,
  );
}

async function seedDemoWorkspace(env: AppEnv) {
  const organizationResult = await query(
    env,
    "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
    ["demo-soluciones-sac"],
  );
  let organizationId = organizationResult.rows[0]?.id as number | undefined;

  if (!organizationId) {
    const createdOrganization = await query(
      env,
      "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
      ["Demo Soluciones SAC", "demo-soluciones-sac"],
    );
    organizationId = createdOrganization.rows[0].id as number;
  }

  const demoUsers = [
    { email: "ana@demoticket.com", fullName: "Ana Paredes", role: "owner", password: "Demo123!" },
    { email: "bruno@demoticket.com", fullName: "Bruno Castro", role: "tech", password: "Demo123!" },
    { email: "carla@demoticket.com", fullName: "Carla Rojas", role: "tech", password: "Demo123!" },
  ];

  const userIds = new Map<string, number>();

  for (const demoUser of demoUsers) {
    const existingUser = await query(env, "SELECT id FROM users WHERE email = $1 LIMIT 1", [
      demoUser.email,
    ]);
    const passwordHash = await bcrypt.hash(demoUser.password, 10);

    if ((existingUser.rowCount ?? 0) > 0) {
      const userId = existingUser.rows[0].id as number;
      userIds.set(demoUser.email, userId);
      await query(
        env,
        `UPDATE users
         SET password_hash = $2,
             full_name = $3,
             company = $4,
             organization_id = $5,
             role = $6,
             is_verified = true
         WHERE email = $1`,
        [
          demoUser.email,
          passwordHash,
          demoUser.fullName,
          "Demo Soluciones SAC",
          organizationId,
          demoUser.role,
        ],
      );
    } else {
      const createdUser = await query(
        env,
        `INSERT INTO users (email, password_hash, full_name, company, organization_id, role, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [
          demoUser.email,
          passwordHash,
          demoUser.fullName,
          "Demo Soluciones SAC",
          organizationId,
          demoUser.role,
        ],
      );
      userIds.set(demoUser.email, createdUser.rows[0].id as number);
    }
  }

  await query(
    env,
    "UPDATE users SET organization_id = $1, role = COALESCE(role, 'member') WHERE organization_id IS NULL",
    [organizationId],
  );

  const demoTickets = [
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Inventario no sincroniza con tienda",
      client: "Javier Salas",
      category: "Inventario",
      priority: "Alta",
      status: "Abierto",
      description: "La tienda física no refleja los movimientos de stock del sistema.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Correo corporativo con retrasos",
      client: "Elena Ríos",
      category: "Redes",
      priority: "Media",
      status: "En progreso",
      description: "Los correos salen con demora de entre 5 y 10 minutos.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Permisos para usuarios temporales",
      client: "Diego Paredes",
      category: "Software",
      priority: "Baja",
      status: "Abierto",
      description: "Se necesita asignar permisos para contratistas temporales.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "VPN no conecta desde casa",
      client: "Marco Ponce",
      category: "Redes",
      priority: "Alta",
      status: "En progreso",
      description: "El equipo remoto no logra conectarse a la VPN corporativa.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Pantalla de cobros se congela",
      client: "Renzo Morales",
      category: "Hardware",
      priority: "Media",
      status: "En espera",
      description: "La pantalla de cobros se congela al validar una venta.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "No cargan reportes mensuales",
      client: "Patricia Vega",
      category: "Software",
      priority: "Alta",
      status: "Abierto",
      description: "El cierre mensual no puede abrirse desde el portal.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Error al subir documentos",
      client: "Katherine Lora",
      category: "Software",
      priority: "Media",
      status: "Abierto",
      description: "Al adjuntar archivos PDF aparecen errores de carga.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Consulta de inventario por bodega",
      client: "Omar Suárez",
      category: "Inventario",
      priority: "Baja",
      status: "Abierto",
      description: "El equipo de bodega necesita ver el stock real del almacén.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Correo de ventas llega tarde",
      client: "Cecilia Tello",
      category: "Redes",
      priority: "Media",
      status: "En espera",
      description: "Los mensajes de ventas presentan retrasos de varios minutos.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Problema con sincronización de caja",
      client: "Eduardo Paredes",
      category: "Software",
      priority: "Alta",
      status: "Abierto",
      description: "La caja registra ventas pero no sincroniza el pedido.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Se solicita actualización de permisos",
      client: "Fabiola Jiménez",
      category: "Software",
      priority: "Baja",
      status: "Abierto",
      description: "Un usuario nuevo necesita acceso al módulo de compras.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Monitor de punto de venta con brillo bajo",
      client: "Germán Castañeda",
      category: "Hardware",
      priority: "Baja",
      status: "Resuelto",
      description: "El monitor de caja presenta brillo muy bajo.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Lento el sistema al emitir boletas",
      client: "Silvia Rojas",
      category: "Software",
      priority: "Alta",
      status: "En progreso",
      description: "La emisión de boletas tarda más de lo normal.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Impresora térmica sin respuesta",
      client: "Nora Flores",
      category: "Hardware",
      priority: "Media",
      status: "Abierto",
      description: "La impresora térmica no imprime tickets de atención.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Actualización de terminal de pagos",
      client: "Alonso Vera",
      category: "Hardware",
      priority: "Alta",
      status: "En progreso",
      description: "La terminal de pagos solicita una actualización de firmware.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Demora en envío de reportes",
      client: "Mireya Quispe",
      category: "Software",
      priority: "Media",
      status: "En espera",
      description: "Los reportes del cierre salen con demora de 15 minutos.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Revisión de acceso a panel comercial",
      client: "Daniela Huamán",
      category: "Software",
      priority: "Alta",
      status: "Abierto",
      description: "El equipo comercial no puede ver el panel de seguimiento.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Intermitencia en WiFi del piso 3",
      client: "Mario Córdova",
      category: "Redes",
      priority: "Media",
      status: "En progreso",
      description: "La conexión del piso 3 cae en ráfagas durante la tarde.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Reemplazo de mouse de oficina",
      client: "Lucía Roldán",
      category: "Hardware",
      priority: "Baja",
      status: "Resuelto",
      description: "El mouse del área de ventas dejó de responder por completo.",
    },
    {
      assignedEmail: "carla@demoticket.com",
      subject: "Auditoría de permisos de supervisores",
      client: "Raúl Ponce",
      category: "Software",
      priority: "Alta",
      status: "En espera",
      description: "Se requiere validar los permisos de los supervisores de turno.",
    },
  ];

  for (const ticket of demoTickets) {
    const assignedUserId = userIds.get(ticket.assignedEmail);
    if (!assignedUserId) continue;

    const existingTicket = await query(
      env,
      "SELECT id FROM tickets WHERE organization_id = $1 AND subject = $2 LIMIT 1",
      [organizationId, ticket.subject],
    );

    if (existingTicket.rowCount === 0) {
      await query(
        env,
        `INSERT INTO tickets (organization_id, assigned_to, subject, description, client, category, priority, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          organizationId,
          assignedUserId,
          ticket.subject,
          ticket.description,
          ticket.client,
          ticket.category,
          ticket.priority,
          ticket.status,
        ],
      );
    }
  }
}

let schemaInitPromise: Promise<void> | undefined;

export async function ensureSchema(env: AppEnv) {
  if (schemaInitialized) return;

  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      await ensureTablesExist(env);

      const result = await query(env, "SELECT id FROM users WHERE email = $1 LIMIT 1", [
        "ana@demoticket.com",
      ]);
      if ((result.rowCount ?? 0) === 0) {
        await seedDemoWorkspace(env);
      }

      schemaInitialized = true;
    })();
  }

  await schemaInitPromise;
}
