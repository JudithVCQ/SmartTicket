import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ensureSchema, query, AppEnv } from "./db";
import { sendVerificationEmail, MailEnv } from "./mailer";

export interface AuthEnv extends AppEnv, MailEnv {
  JWT_SECRET?: string;
}

const TOKEN_LIFETIME_MINUTES = 60 * 24;
const SESSION_DAYS = 7;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "organizacion";
}

function getJwtSecret(env?: AuthEnv) {
  const secret = env?.JWT_SECRET ?? process.env?.JWT_SECRET ?? "smartticket-dev-secret";
  return secret || "smartticket-dev-secret";
}

function createSessionCookie(token: string) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `smartticket_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

function getSessionToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const headerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (headerToken) {
    return headerToken;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)smartticket_session=([^;]+)/);
  return cookieMatch?.[1]?.trim() ?? null;
}

function getAuthenticatedUser(request: Request, env?: AuthEnv) {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getJwtSecret(env)) as unknown as { sub: number; email: string };
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

async function getOrCreateOrganization(env: AppEnv, companyName: string) {
  const normalizedName = companyName.trim() || "Organización sin nombre";
  const slug = slugify(normalizedName);

  const existing = await query(
    env,
    "SELECT id, name FROM organizations WHERE slug = $1 OR lower(name) = lower($2) LIMIT 1",
    [slug, normalizedName],
  );

  if ((existing.rowCount ?? 0) > 0) {
    const record = existing.rows[0] as { id: number; name: string };
    return { id: record.id, name: record.name, created: false };
  }

  const inserted = await query(
    env,
    "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, name",
    [normalizedName, slug],
  );

  const record = inserted.rows[0] as { id: number; name: string };
  return { id: record.id, name: record.name, created: true };
}

export async function registerUser(
  payload: { email: string; password: string; fullName?: string; company?: string; role?: string },
  env?: AuthEnv,
  origin?: string,
) {
  await ensureSchema(env as AppEnv);

  const normalizedEmail = payload.email.trim().toLowerCase();
  const exists = await query(env as AppEnv, "SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if ((exists.rowCount ?? 0) > 0) {
    return { status: 409, body: { message: "Ya existe un usuario con ese correo." } };
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MINUTES * 60 * 1000).toISOString();
  const companyName = payload.company?.trim() || "Organización sin nombre";
  const organization = await getOrCreateOrganization(env as AppEnv, companyName);
  const role = organization.created ? "owner" : payload.role === "owner" ? "owner" : "member";

  await query(
    env as AppEnv,
    `INSERT INTO users (email, password_hash, full_name, company, organization_id, role, verification_token, verification_token_expires)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [normalizedEmail, passwordHash, payload.fullName ?? null, companyName, organization.id, role, token, expiresAt],
  );

  await sendVerificationEmail(normalizedEmail, token, origin ?? "http://localhost:8080", env as MailEnv);

  return {
    status: 201,
    body: {
      message:
        "Registro exitoso. Revisa tu correo para activar tu cuenta. Solo Gmail y servicios compatibles recibirán el enlace.",
      organization: { id: organization.id, name: organization.name, role },
    },
  };
}

export async function verifyUser(token: string, env?: AuthEnv) {
  await ensureSchema(env as AppEnv);

  const result = await query(
    env as AppEnv,
    "SELECT id, verification_token_expires FROM users WHERE verification_token = $1 AND is_verified = false",
    [token],
  );

  if (result.rowCount === 0) {
    return { ok: false, message: "Token de verificación inválido o expirado." };
  }

  const record = result.rows[0] as { id: number; verification_token_expires: string | Date };
  const expiresAt = new Date(record.verification_token_expires);

  if (expiresAt < new Date()) {
    return { ok: false, message: "El enlace de verificación ya expiró." };
  }

  await query(env as AppEnv, "UPDATE users SET is_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1", [record.id]);

  return { ok: true, message: "Correo verificado correctamente. Ya puedes iniciar sesión." };
}

export async function loginUser(
  payload: { email: string; password: string },
  env?: AuthEnv,
) {
  await ensureSchema(env as AppEnv);

  const normalizedEmail = payload.email.trim().toLowerCase();
  const result = await query(
    env as AppEnv,
    `SELECT u.id, u.password_hash, u.is_verified, u.full_name, u.company, u.role, o.id AS organization_id, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [normalizedEmail],
  );

  if (result.rowCount === 0) {
    return { status: 401, body: { message: "Correo o contraseña incorrectos." } };
  }

  const user = result.rows[0] as {
    id: number;
    password_hash: string;
    is_verified: boolean;
    full_name: string | null;
    company: string | null;
    role: string | null;
    organization_id: number | null;
    organization_name: string | null;
  };
  const isValidPassword = await bcrypt.compare(payload.password, user.password_hash);

  if (!isValidPassword) {
    return { status: 401, body: { message: "Correo o contraseña incorrectos." } };
  }

  if (!user.is_verified) {
    return {
      status: 403,
      body: {
        message:
          "Tu correo todavía no está verificado. Revisa Gmail y haz clic en el enlace de activación para iniciar sesión.",
      },
    };
  }

  const token = jwt.sign({ sub: user.id, email: normalizedEmail }, getJwtSecret(env), {
    expiresIn: "7d",
  });

  return {
    status: 200,
    body: {
      message: "Inicio de sesión exitoso.",
      token,
      user: {
        id: user.id,
        email: normalizedEmail,
        fullName: user.full_name,
        company: user.company,
        organizationId: user.organization_id,
        organizationName: user.organization_name,
        role: user.role,
      },
    },
    cookie: createSessionCookie(token),
  };
}

export async function getProfile(request: Request, env?: AuthEnv) {
  await ensureSchema(env as AppEnv);

  const user = getAuthenticatedUser(request, env);
  if (!user) {
    return { status: 401, body: { message: "Sesión no válida." } };
  }

  const result = await query(
    env as AppEnv,
    `SELECT u.id, u.email, u.full_name, u.company, u.role, o.id AS organization_id, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [user.id],
  );

  if (result.rowCount === 0) {
    return { status: 404, body: { message: "No se encontró el perfil del usuario." } };
  }

  const record = result.rows[0] as {
    id: number;
    email: string;
    full_name: string | null;
    company: string | null;
    role: string | null;
    organization_id: number | null;
    organization_name: string | null;
  };
  return {
    status: 200,
    body: {
      user: {
        id: record.id,
        email: record.email,
        fullName: record.full_name,
        company: record.company,
        organizationId: record.organization_id,
        organizationName: record.organization_name,
        role: record.role,
      },
    },
  };
}

export async function updateProfile(
  request: Request,
  payload: { email?: string; fullName?: string; company?: string },
  env?: AuthEnv,
) {
  await ensureSchema(env as AppEnv);

  const user = getAuthenticatedUser(request, env);
  if (!user) {
    return { status: 401, body: { message: "Sesión no válida." } };
  }

  const nextEmail = (payload.email ?? user.email).trim().toLowerCase();
  const nextFullName = payload.fullName?.trim() ?? null;
  const nextCompany = payload.company?.trim() ?? null;

  if (nextEmail !== user.email) {
    const duplicate = await query(
      env as AppEnv,
      "SELECT id FROM users WHERE email = $1 AND id <> $2",
      [nextEmail, user.id],
    );

    if ((duplicate.rowCount ?? 0) > 0) {
      return { status: 409, body: { message: "Ese correo ya está en uso por otro usuario." } };
    }
  }

  await query(
    env as AppEnv,
    "UPDATE users SET email = $1, full_name = $2, company = $3 WHERE id = $4",
    [nextEmail, nextFullName, nextCompany, user.id],
  );

  return {
    status: 200,
    body: {
      message: "Datos actualizados correctamente.",
      user: {
        id: user.id,
        email: nextEmail,
        fullName: nextFullName,
        company: nextCompany,
      },
    },
  };
}
