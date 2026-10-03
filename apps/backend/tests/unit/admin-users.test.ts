import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../src/repositories/portalUser.repository.js", () => ({
  portalUserRepository: {
    ensureOrganization: vi.fn().mockResolvedValue("org-1"),
    findUserByEmail: vi.fn(),
    createMember: vi.fn(),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    findInBusiness: vi.fn(),
    removeMember: vi.fn(),
    listByBusiness: vi.fn(),
    updateRole: vi.fn(),
  },
}));
vi.mock("../../src/auth/users.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/auth/users.js")>()),
  createCredentialUser: vi.fn(),
  resetCredentialPassword: vi.fn().mockResolvedValue(undefined),
}));

const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { portalUserRepository } = await import("../../src/repositories/portalUser.repository.js");
const { createCredentialUser, resetCredentialPassword, generateTemporaryPassword } = await import(
  "../../src/auth/users.js"
);
const { createBusinessUser, removeBusinessUser, resetBusinessUserPassword } = await import(
  "../../src/services/admin-users.service.js"
);
const { ConflictError, NotFoundError } = await import("../../src/errors/index.js");

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    role: "owner",
    user: {
      id: "user-1",
      name: "Dueña",
      email: "duena@spa.com",
      role: "client",
      twoFactorEnabled: false,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      sessions: [],
    },
    ...overrides,
  };
}

describe("admin-users.service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("crea el usuario como `client` y devuelve la contraseña temporal una vez", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BUSINESS_ID, name: "Spa", slug: "spa" } as never);
    vi.mocked(portalUserRepository.findUserByEmail).mockResolvedValue(null);
    vi.mocked(createCredentialUser).mockResolvedValue({ id: "user-1", email: "duena@spa.com" });
    vi.mocked(portalUserRepository.createMember).mockResolvedValue(memberRow() as never);

    const result = await createBusinessUser(
      BUSINESS_ID,
      { name: "Dueña", email: "duena@spa.com", role: "owner" },
      "op-1",
    );

    expect(createCredentialUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "duena@spa.com", role: "client" }),
    );
    expect(portalUserRepository.createMember).toHaveBeenCalledWith("org-1", "user-1", "owner");
    expect(result.temporaryPassword).toHaveLength(16);
    expect(result.user).toMatchObject({ userId: "user-1", role: "owner", lastSeenAt: null });
    // La contraseña no queda en la bitácora.
    expect(JSON.stringify(vi.mocked(auditLogRepository.record).mock.calls)).not.toContain(result.temporaryPassword);
  });

  it("rechaza un correo que ya existe (aunque sea de otro negocio)", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BUSINESS_ID, name: "Spa", slug: "spa" } as never);
    vi.mocked(portalUserRepository.findUserByEmail).mockResolvedValue({ id: "other", role: "client" });

    await expect(
      createBusinessUser(BUSINESS_ID, { name: "X", email: "x@spa.com", role: "member" }, "op-1"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(createCredentialUser).not.toHaveBeenCalled();
  });

  it("si la membresía falla, borra el usuario recién creado", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BUSINESS_ID, name: "Spa", slug: "spa" } as never);
    vi.mocked(portalUserRepository.findUserByEmail).mockResolvedValue(null);
    vi.mocked(createCredentialUser).mockResolvedValue({ id: "user-9", email: "x@spa.com" });
    vi.mocked(portalUserRepository.createMember).mockRejectedValue(new Error("db down"));

    await expect(
      createBusinessUser(BUSINESS_ID, { name: "X", email: "x@spa.com", role: "member" }, "op-1"),
    ).rejects.toThrow("db down");
    expect(portalUserRepository.deleteUser).toHaveBeenCalledWith("user-9");
  });

  it("negocio inexistente → NotFound", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);

    await expect(
      createBusinessUser(BUSINESS_ID, { name: "X", email: "x@spa.com", role: "member" }, "op-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("restablecer contraseña exige que el usuario sea de ESE negocio", async () => {
    vi.mocked(portalUserRepository.findInBusiness).mockResolvedValue(null);

    await expect(resetBusinessUserPassword(BUSINESS_ID, "user-1", "op-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(resetCredentialPassword).not.toHaveBeenCalled();
  });

  it("restablecer contraseña genera una nueva", async () => {
    vi.mocked(portalUserRepository.findInBusiness).mockResolvedValue(memberRow() as never);

    const result = await resetBusinessUserPassword(BUSINESS_ID, "user-1", "op-1");

    expect(resetCredentialPassword).toHaveBeenCalledWith("user-1", result.temporaryPassword);
  });

  it("quitar un usuario audita si se borró la cuenta", async () => {
    vi.mocked(portalUserRepository.findInBusiness).mockResolvedValue(memberRow() as never);
    vi.mocked(portalUserRepository.removeMember).mockResolvedValue({ userDeleted: true });

    await removeBusinessUser(BUSINESS_ID, "user-1", "op-1");

    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.user.remove", metadata: { userDeleted: true } }),
    );
  });
});

describe("generateTemporaryPassword", () => {
  it("cumple el mínimo de Better Auth y evita caracteres ambiguos", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });
});
