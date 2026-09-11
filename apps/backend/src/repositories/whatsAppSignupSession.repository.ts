import { createHash, randomBytes } from "node:crypto";
import type { Business, Prisma, WhatsAppSignupSession } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Enlaces de auto-conexión de WhatsApp (docs/PANEL-OPERADOR.md §7.4).
 *
 * El token viaja en la URL que el operador le manda al cliente, así que se
 * guarda **hasheado** (SHA-256) y no cifrado: no hay ningún caso en que el
 * backend necesite volver a leerlo, solo compararlo. Quien tenga el enlace
 * puede conectar un número a ese negocio, y nada más — por eso vence y es de un
 * solo uso.
 */

export type SignupSessionWithBusiness = WhatsAppSignupSession & { business: Business };

/** Token de 32 bytes en base64url: 43 caracteres, seguro para una URL. */
export function generateSignupToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSignupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const whatsAppSignupSessionRepository = {
  create(input: {
    businessId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<WhatsAppSignupSession> {
    return prisma.whatsAppSignupSession.create({ data: input });
  },

  listByBusiness(businessId: string): Promise<WhatsAppSignupSession[]> {
    return prisma.whatsAppSignupSession.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },

  find(id: string): Promise<WhatsAppSignupSession | null> {
    return prisma.whatsAppSignupSession.findUnique({ where: { id } });
  },

  /** Resuelve el enlace que abrió el cliente; incluye el negocio para la portada. */
  findByToken(token: string): Promise<SignupSessionWithBusiness | null> {
    return prisma.whatsAppSignupSession.findUnique({
      where: { tokenHash: hashSignupToken(token) },
      include: { business: true },
    });
  },

  update(
    id: string,
    data: Prisma.WhatsAppSignupSessionUpdateInput,
  ): Promise<WhatsAppSignupSession> {
    return prisma.whatsAppSignupSession.update({ where: { id }, data });
  },

  /**
   * Invalida los enlaces pendientes de un negocio. Se usa al generar uno nuevo
   * (que solo haya uno vivo evita que el cliente abra un enlace viejo del hilo
   * de WhatsApp) y al conectar el número por cualquier otra vía.
   */
  revokePending(businessId: string): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSignupSession.updateMany({
      where: { businessId, status: "PENDING" },
      data: { status: "REVOKED" },
    });
  },
};
