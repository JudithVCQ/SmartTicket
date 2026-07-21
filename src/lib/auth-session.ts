import { isStaff, normalizeRole, type Role } from "./roles";

const AUTH_STORAGE_KEY = "smartticket-auth";

export interface AuthSession {
  email?: string | null;
  fullName?: string | null;
  company?: string | null;
  organizationName?: string | null;
  organizationId?: number | null;
  role?: string | null;
  loggedInAt?: number;
  token?: string | null;
}

type SessionListener = () => void;
const listeners = new Set<SessionListener>();

/**
 * Avisa de los cambios de sesión. Sin esto, los datos que se cargan una sola vez
 * al montar la app (la lista de tickets) se quedan con lo que se pidió antes de
 * iniciar sesión, que es una petición sin token.
 */
export function subscribeAuthSession(listener: SessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySessionChange() {
  for (const listener of listeners) listener();
}

export function setAuthSession(
  email?: string,
  profile?: {
    fullName?: string | null;
    company?: string | null;
    organizationName?: string | null;
    organizationId?: number | null;
    role?: string | null;
  },
  token?: string,
) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    email: email?.trim().toLowerCase() ?? null,
    fullName: profile?.fullName?.trim() ?? null,
    company: profile?.company?.trim() ?? null,
    organizationName: profile?.organizationName?.trim() ?? null,
    organizationId: profile?.organizationId ?? null,
    role: profile?.role?.trim() ?? null,
    loggedInAt: Date.now(),
    token: token?.trim() ?? null,
  });

  window.localStorage.setItem(AUTH_STORAGE_KEY, payload);
  notifySessionChange();
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  if (typeof document !== "undefined") {
    document.cookie = "smartticket_session=; Path=/; Max-Age=0; SameSite=Lax";
  }
  notifySessionChange();
}

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  return getAuthSession()?.token ?? null;
}

export function isAuthenticated() {
  const auth = getAuthSession();
  return Boolean(auth && (auth.loggedInAt || auth.token));
}

/**
 * Rol del usuario en sesión. Es sólo para decidir qué se muestra: el permiso de
 * verdad lo aplica el API, que no confía en lo que diga el navegador.
 */
export function getSessionRole(): Role {
  return normalizeRole(getAuthSession()?.role);
}

export function isStaffSession(): boolean {
  return isStaff(getSessionRole());
}
