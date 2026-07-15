import { describe, it, expect, jest, beforeAll, afterAll } from "@jest/globals";

// Mockear BD y Mailer — NO la lógica de auth ni bcrypt/jwt
jest.mock("../../src/lib/db", () => ({
  query: jest.fn(),
  ensureSchema: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/mailer", () => ({
  sendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import {
  registerUser,
  loginUser,
  verifyUser,
  getProfile,
  updateProfile,
  getAuthenticatedUser,
} from "../../src/lib/auth";
import { query } from "../../src/lib/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";
const mockQuery = query as jest.MockedFunction<any>;

// ── Helper: construir un Request con cookie de sesión JWT válida ──
function makeAuthRequest(userId: number, email: string, path = "/api/auth/profile"): Request {
  const token = jwt.sign({ sub: userId, email }, JWT_SECRET);
  return new Request(`http://localhost${path}`, {
    headers: { Cookie: `smartticket_session=${token}` },
  });
}

describe("Auth Functions — cobertura profunda de auth.ts", () => {
  let consoleSpy: any;

  beforeAll(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ── getAuthenticatedUser ──────────────────────────────────────────────────

  describe("getAuthenticatedUser()", () => {
    it("1. returns null when request has no Authorization header or cookie", () => {
      const req = new Request("http://localhost/api/auth/profile");
      expect(getAuthenticatedUser(req)).toBeNull();
    });

    it("2. returns null when Authorization header is malformed (no 'Bearer ')", () => {
      const req = new Request("http://localhost/api/auth/profile", {
        headers: { Authorization: "Token invalid-format" },
      });
      expect(getAuthenticatedUser(req)).toBeNull();
    });

    it("3. returns null when Bearer token is invalid/expired", () => {
      const req = new Request("http://localhost/api/auth/profile", {
        headers: { Authorization: "Bearer not-a-valid-jwt-at-all" },
      });
      expect(getAuthenticatedUser(req)).toBeNull();
    });

    it("4. returns user from a valid Bearer Authorization header", () => {
      const token = jwt.sign({ sub: 1, email: "test@example.com" }, JWT_SECRET);
      const req = new Request("http://localhost/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = getAuthenticatedUser(req);
      expect(user).not.toBeNull();
      expect(user?.id).toBe(1);
      expect(user?.email).toBe("test@example.com");
    });
  });

  // ── registerUser ──────────────────────────────────────────────────────────

  describe("registerUser()", () => {
    it("5. returns 409 when email already exists", async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 9 }] }); // email exists check

      const result = await registerUser({ email: "exists@example.com", password: "Pass1!" });
      expect(result.status).toBe(409);
      expect(result.body.message).toContain("Ya existe");
    });

    it("6. returns 201 and sends verification email on successful registration", async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })          // email not found
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, name: "Demo Org" }] }) // org exists
        .mockResolvedValueOnce({ rowCount: 1, rows: [{}] });        // INSERT user

      const result = await registerUser({
        email: "nuevo@example.com",
        password: "Pass1!",
        fullName: "Nuevo Usuario",
        company: "Demo Org",
      });

      expect(result.status).toBe(201);
      expect(result.body.message).toContain("Registro exitoso");
    });
  });

  // ── loginUser ─────────────────────────────────────────────────────────────

  describe("loginUser()", () => {
    it("7. returns 401 when user does not exist", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await loginUser({ email: "noexiste@example.com", password: "pass" });
      expect(result.status).toBe(401);
    });

    it("8. returns 401 when password is incorrect", async () => {
      const { hash } = await import("bcryptjs");
      const hashedPwd = await hash("correct-password", 10);

      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 2,
          password_hash: hashedPwd,
          is_verified: true,
          full_name: "Test User",
          company: null,
          role: "member",
          organization_id: 1,
          organization_name: "Org",
        }],
      });

      const result = await loginUser({ email: "user@example.com", password: "wrong-password" });
      expect(result.status).toBe(401);
    });

    it("9. returns 403 when user is not verified", async () => {
      const { hash } = await import("bcryptjs");
      const hashedPwd = await hash("correct-password", 10);

      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 3,
          password_hash: hashedPwd,
          is_verified: false,
          full_name: "Test User",
          company: null,
          role: "member",
          organization_id: 1,
          organization_name: "Org",
        }],
      });

      const result = await loginUser({ email: "unverified@example.com", password: "correct-password" });
      expect(result.status).toBe(403);
      expect(result.body.message).toContain("no está verificado");
    });

    it("10. returns 200 and a JWT token on successful login", async () => {
      const { hash } = await import("bcryptjs");
      const hashedPwd = await hash("correct-password", 10);

      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 4,
          password_hash: hashedPwd,
          is_verified: true,
          full_name: "Test User",
          company: "Demo",
          role: "owner",
          organization_id: 1,
          organization_name: "Demo Org",
        }],
      });

      const result = await loginUser({ email: "owner@example.com", password: "correct-password" });
      expect(result.status).toBe(200);
      expect((result as any).body.token).toBeDefined();
    });
  });

  // ── verifyUser ────────────────────────────────────────────────────────────

  describe("verifyUser()", () => {
    it("11. returns ok:false for an invalid/unknown token", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await verifyUser("invalid-token-xyz");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("inválido");
    });

    it("12. returns ok:false for an expired verification token", async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1h ago
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 5, verification_token_expires: pastDate }],
      });

      const result = await verifyUser("expired-token");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("expiró");
    });

    it("13. returns ok:true for a valid verification token", async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h from now
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 6, verification_token_expires: futureDate }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE

      const result = await verifyUser("valid-token");
      expect(result.ok).toBe(true);
    });
  });

  // ── getProfile ────────────────────────────────────────────────────────────

  describe("getProfile()", () => {
    it("14. returns 401 when request has no valid session", async () => {
      const req = new Request("http://localhost/api/auth/profile");
      const result = await getProfile(req);
      expect(result.status).toBe(401);
    });

    it("15. returns 404 when user in token no longer exists in DB", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const req = makeAuthRequest(99, "ghost@example.com");
      const result = await getProfile(req);
      expect(result.status).toBe(404);
    });

    it("16. returns 200 with user profile data", async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 7, email: "user@example.com", full_name: "User", company: "Acme", role: "member", organization_id: 1, organization_name: "Acme" }],
      });
      const req = makeAuthRequest(7, "user@example.com");
      const result = await getProfile(req);
      expect(result.status).toBe(200);
      expect((result.body as any).user.email).toBe("user@example.com");
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────

  describe("updateProfile()", () => {
    it("17. returns 401 when request has no valid session", async () => {
      const req = new Request("http://localhost/api/auth/profile");
      const result = await updateProfile(req, {});
      expect(result.status).toBe(401);
    });

    it("18. returns 409 when new email already belongs to another user", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 99 }] }); // duplicate check
      const req = makeAuthRequest(8, "original@example.com");
      const result = await updateProfile(req, { email: "taken@example.com" });
      expect(result.status).toBe(409);
    });

    it("19. returns 200 on successful profile update", async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // no duplicate email
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE

      const req = makeAuthRequest(8, "original@example.com");
      const result = await updateProfile(req, { email: "original@example.com", fullName: "New Name" });
      expect(result.status).toBe(200);
    });
  });
});
