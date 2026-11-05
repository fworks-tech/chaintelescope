/**
 * @fileoverview Argon2id + pepper (#119) e a janela de throttling de login.
 * Não precisa de banco: a camada é pura.
 */

import { describe, expect, test } from "vitest";
import {
  ARGON2_OPTIONS,
  hashPassword,
  needsUpgrade,
  verifyDummyPassword,
  verifyPassword,
} from "../src/auth/password.js";
import { LoginThrottle } from "../src/auth/throttle.js";

const PEPPER = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex",
);
const OTHER_PEPPER = Buffer.from("ff".repeat(32), "hex");

describe("password storage", () => {
  test("hashes carry the OWASP argon2id floor in the PHC string", async () => {
    const stored = await hashPassword("correct horse battery staple", PEPPER);

    expect(stored.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(ARGON2_OPTIONS).toMatchObject({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  test("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple", PEPPER);

    await expect(
      verifyPassword(stored, "correct horse battery staple", PEPPER),
    ).resolves.toBe(true);
    await expect(verifyPassword(stored, "wrong", PEPPER)).resolves.toBe(false);
  });

  test("salts each hash independently", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same password", PEPPER),
      hashPassword("same password", PEPPER),
    ]);

    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "same password", PEPPER)).resolves.toBe(
      true,
    );
    await expect(verifyPassword(b, "same password", PEPPER)).resolves.toBe(
      true,
    );
  });

  test("a different pepper cannot verify an existing hash", async () => {
    const stored = await hashPassword("peppered", PEPPER);

    await expect(verifyPassword(stored, "peppered", OTHER_PEPPER)).resolves.toBe(
      false,
    );
  });

  test("needsUpgrade flags legacy and below-floor hashes only", async () => {
    const current = await hashPassword("x", PEPPER);

    expect(needsUpgrade(current)).toBe(false);
    expect(needsUpgrade("$2b$10$abcdefghijklmnopqrstuv")).toBe(true);
    expect(
      needsUpgrade(
        "$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$YG3PQs4lJ0B0m9m0aXhY1g",
      ),
    ).toBe(true);
    expect(needsUpgrade("not-a-hash")).toBe(true);
  });

  test("an unknown user still pays the KDF", async () => {
    const stored = await hashPassword("known", PEPPER);

    await verifyDummyPassword("warmup", PEPPER);

    const knownStart = performance.now();
    await verifyPassword(stored, "unknown", PEPPER);
    const known = performance.now() - knownStart;

    const dummyStart = performance.now();
    await expect(
      verifyDummyPassword("nobody@example.com", PEPPER),
    ).resolves.toBe(false);
    const dummy = performance.now() - dummyStart;

    // O caminho de hash legado sai antes da KDF; o dummy não pode sair.
    const legacyStart = performance.now();
    await verifyPassword("$2b$10$abcdefghijklmnopqrstuv", "x", PEPPER);
    const legacy = performance.now() - legacyStart;

    expect(dummy).toBeGreaterThan(5);
    expect(dummy).toBeGreaterThan(known * 0.3);
    expect(legacy).toBeLessThan(dummy);
  });
});

describe("login throttle", () => {
  const WINDOW = 15 * 60 * 1000;

  test("blocks the sixth failure and reports the remaining window", () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle({ now: () => now });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
      throttle.recordFailure("a@example.com");
    }

    expect(throttle.retryAfterSeconds("a@example.com")).toBe(WINDOW / 1000);
    expect(throttle.retryAfterSeconds("b@example.com")).toBe(0);

    // A janela desliza: passado o tempo, a tentativa é liberada.
    now += WINDOW;
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });

  test("reset clears the bucket after a successful login", () => {
    const throttle = new LoginThrottle({ now: () => 0 });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      throttle.recordFailure("a@example.com");
    }
    expect(throttle.retryAfterSeconds("a@example.com")).toBeGreaterThan(0);

    throttle.reset("a@example.com");
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });

  test("only failures inside the window count", () => {
    let now = 0;
    const throttle = new LoginThrottle({ now: () => now });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      throttle.recordFailure("a@example.com");
    }
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(WINDOW / 1000);

    // Um segundo antes de a janela fechar ainda bloqueia.
    now += WINDOW - 1;
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(1);

    now += 1;
    expect(throttle.retryAfterSeconds("a@example.com")).toBe(0);
  });
});
