/**
 * BLOQUE 1: db.ts — cobertura de getDatabaseUrl() y ensureSchema()
 *
 * Estrategia: importamos db.ts UNA VEZ (mock de pg en el top).
 * Usamos closePool() entre tests para forzar que getPool() vuelva a crear
 * el pool y así getDatabaseUrl() se ejecute en cada test.
 */

import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from "@jest/globals";

// ── Mock de pg ANTES de importar db.ts ────────────────────────────────────
const mockClientQuery = jest.fn<() => Promise<any>>().mockResolvedValue({ rows: [], rowCount: 0 });
const mockRelease = jest.fn<() => void>();
const mockEnd = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockConnect = jest.fn<() => Promise<any>>().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    end: mockEnd,
  })),
}));

// Importamos DESPUÉS del mock
import { query, ensureSchema, closePool } from "../../src/lib/db";

describe("db.ts — getDatabaseUrl & ensureSchema coverage", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    // Resetear el pool para que getDatabaseUrl() se ejecute en cada test
    await closePool();
    // Resetear mocks de pg para contar llamadas limpias
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
    mockEnd.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await closePool();
    // Restaurar DATABASE_URL original
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  afterAll(async () => {
    await closePool();
    jest.restoreAllMocks();
  });

  it("1. getDatabaseUrl() uses env.DATABASE_URL when provided in env object (line 14)", async () => {
    // Asegurar que process.env no interfiera
    delete process.env.DATABASE_URL;

    // Pasamos DATABASE_URL directamente en el objeto env — línea 13-15 de db.ts
    const result = await query(
      { DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb" },
      "SELECT 1"
    );

    expect(result).toBeDefined();
    expect(result.rows).toEqual([]);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("2. getDatabaseUrl() uses process.env.DATABASE_URL as fallback when env has none (lines 17-18)", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";

    // env vacío {} — getDatabaseUrl usará process.env.DATABASE_URL
    const result = await query({}, "SELECT 1");

    expect(result).toBeDefined();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("3. getDatabaseUrl() throws ERROR when DATABASE_URL is missing from both env and process.env (line 21)", async () => {
    delete process.env.DATABASE_URL;

    // env vacío + sin process.env.DATABASE_URL → debe lanzar en línea 21
    await expect(query({}, "SELECT 1")).rejects.toThrow(
      "DATABASE_URL is required"
    );
  });

  it("4. ensureSchema() is idempotent — second call returns immediately without reinitializing", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/testdb";

    // Todas las queries de ensureTablesExist (CREATE TABLE) devuelven rowCount:0 — no importa.
    // La query CRÍTICA es: SELECT id FROM users WHERE email = 'ana@demoticket.com'
    // Si devuelve rowCount:1 → seedDemoWorkspace NO se ejecuta → sin error de rows[0].id
    mockClientQuery.mockResolvedValue({ rows: [{ id: 1, name: "Demo Org" }], rowCount: 1 });

    await ensureSchema({});

    const connectCountAfterFirst = mockConnect.mock.calls.length;

    // Segunda llamada — debe ser un no-op inmediato (schemaInitialized = true)
    await ensureSchema({});

    const connectCountAfterSecond = mockConnect.mock.calls.length;

    // La segunda llamada NO debe haber generado nuevas conexiones
    expect(connectCountAfterSecond).toBe(connectCountAfterFirst);
    expect(connectCountAfterFirst).toBeGreaterThan(0);
  });
});
