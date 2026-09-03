import { afterEach, describe, expect, it, vi } from "vitest";

// env.SECRETS_ENCRYPTION_KEY se resuelve una sola vez al importar
// src/config/env.ts — se fija aquí, antes de cualquier import real (ver la nota
// en gift-card-redeem.test.ts). 32 bytes en base64.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY;

const { encryptSecret, decryptSecret, isEncryptedSecret } = await import("../../src/utils/crypto.js");

describe("crypto (AES-256-GCM de secretos por-tenant)", () => {
  it("hace round-trip de un valor en claro", () => {
    const secret = "EAAJ...token-de-whatsapp-largo";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("round-trip de strings vacíos y unicode", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
    expect(decryptSecret(encryptSecret("clave con ñ y 😀"))).toBe("clave con ñ y 😀");
  });

  it("produce texto cifrado distinto en cada llamada (IV aleatorio) pero descifrable al mismo valor", () => {
    const a = encryptSecret("misma-entrada");
    const b = encryptSecret("misma-entrada");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("misma-entrada");
    expect(decryptSecret(b)).toBe("misma-entrada");
  });

  it("marca su salida con el prefijo de versión", () => {
    const enc = encryptSecret("x");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(isEncryptedSecret("texto-plano")).toBe(false);
  });

  it("lanza si el texto cifrado fue manipulado", () => {
    const enc = encryptSecret("valor-sensible");
    const buf = Buffer.from(enc.slice(enc.indexOf(":") + 1), "base64");
    const last = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(last) ^ 0x01, last); // corrompe el último byte del ciphertext
    const tampered = `v1:${buf.toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lanza ante un formato no reconocido", () => {
    expect(() => decryptSecret("texto-plano-sin-prefijo")).toThrow(/no reconocido/);
    expect(() => decryptSecret("v2:abc")).toThrow(/no reconocido/);
    expect(() => decryptSecret("v1:")).toThrow(/no reconocido/);
  });

  it("lanza ante un payload demasiado corto", () => {
    expect(() => decryptSecret(`v1:${Buffer.alloc(4).toString("base64")}`)).toThrow(/corto/);
  });

  it("no descifra con otra clave", async () => {
    const enc = encryptSecret("secreto");
    vi.resetModules();
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", Buffer.alloc(32, 99).toString("base64"));
    const other = await import("../../src/utils/crypto.js");
    expect(() => other.decryptSecret(enc)).toThrow();
    vi.unstubAllEnvs();
  });
});

describe("crypto — SECRETS_ENCRYPTION_KEY inválida", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lanza un error claro si no está configurada", async () => {
    vi.resetModules();
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", "");
    const { encryptSecret: enc } = await import("../../src/utils/crypto.js");
    expect(() => enc("x")).toThrow(/no está configurada/);
  });

  it("lanza si no decodifica a 32 bytes", async () => {
    vi.resetModules();
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", Buffer.alloc(16, 1).toString("base64"));
    const { encryptSecret: enc } = await import("../../src/utils/crypto.js");
    expect(() => enc("x")).toThrow(/32 bytes/);
  });
});
