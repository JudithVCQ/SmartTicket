import { describe, it, expect } from "@jest/globals";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "smartticket-dev-secret";

describe("Authentication & JWT Utilities", () => {
  const plainPassword = "Demo123!";

  it("1. should hash password correctly with bcrypt", async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    expect(hash).not.toBe(plainPassword);
    expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);
  });

  it("2. should verify correct and incorrect passwords using bcrypt", async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    const matchCorrect = await bcrypt.compare(plainPassword, hash);
    const matchIncorrect = await bcrypt.compare("WrongPass!", hash);

    expect(matchCorrect).toBe(true);
    expect(matchIncorrect).toBe(false);
  });

  it("3. should generate a verified JWT with the expected payload", () => {
    const payload = { sub: 42, email: "test@example.com" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.sub).toBe(42);
    expect(decoded.email).toBe("test@example.com");
  });

  it("4. should throw an error on expired or malformed JWT verification", () => {
    // Malformed token
    expect(() => {
      jwt.verify("invalid.token.here", JWT_SECRET);
    }).toThrow();

    // Expired token (signed with maxAge: -1000ms)
    const expiredToken = jwt.sign({ sub: 1 }, JWT_SECRET, { expiresIn: "-1s" });
    expect(() => {
      jwt.verify(expiredToken, JWT_SECRET);
    }).toThrow();
  });

  it("5. should reject JWT signed with a different secret", () => {
    const token = jwt.sign({ sub: 1 }, "different-secret");
    expect(() => {
      jwt.verify(token, JWT_SECRET);
    }).toThrow();
  });
});
