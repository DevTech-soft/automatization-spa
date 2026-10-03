import { z } from "zod";

/**
 * Portal de cliente / CRM (docs/PANEL-OPERADOR.md F7, §8.5). Cada spa entra con
 * su propio usuario y ve solo su negocio: citas, clientas, conversaciones del
 * bot y métricas. El tenant sale de la membresía del usuario (`member` →
 * `organization.businessId`), nunca de un parámetro de la URL.
 */

/** `user.role`: separa al operador de los usuarios de los spas. */
export const USER_ROLES = ["operator", "client"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * `member.role` dentro de la organización del negocio. Se usan los roles
 * incorporados del plugin `organization` de Better Auth (`owner`/`member`) en vez
 * de inventar unos propios, para que su control de acceso los reconozca:
 * `owner` = dueño(a) del spa (`client_owner` en el plan), `member` = equipo
 * (`client_staff`).
 */
export const PORTAL_ROLES = ["owner", "member"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export const PORTAL_ROLE_LABELS: Record<PortalRole, string> = {
  owner: "Dueño(a)",
  member: "Equipo",
};

/** Respuesta de `GET /portal/me`: quién entra y a qué negocio. */
export interface PortalMeResponse {
  userId: string;
  email: string;
  name: string;
  role: PortalRole;
  business: {
    id: string;
    name: string;
    slug: string;
    status: string;
    timezone: string;
    currency: string;
    logoUrl: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
  };
}

// — Usuarios del portal, administrados por el operador —

export interface BusinessUserDto {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  role: PortalRole;
  twoFactorEnabled: boolean;
  createdAt: string;
  /** Último inicio de sesión registrado, si alguna vez entró. */
  lastSeenAt: string | null;
}

/**
 * Alta de un usuario del portal. No hay infraestructura de correo (§9), así que
 * no hay invitación por email: el operador crea la cuenta y le pasa al cliente la
 * contraseña temporal, que el backend genera y devuelve **una sola vez**.
 */
export const createBusinessUserSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres.").max(120),
  email: z.string().trim().toLowerCase().email("Correo inválido."),
  role: z.enum(PORTAL_ROLES).default("owner"),
});

export type CreateBusinessUserInput = z.infer<typeof createBusinessUserSchema>;

export const updateBusinessUserSchema = z.object({
  role: z.enum(PORTAL_ROLES),
});

export type UpdateBusinessUserInput = z.infer<typeof updateBusinessUserSchema>;

/** Resultado de crear un usuario o restablecer su contraseña. */
export interface BusinessUserCredentials {
  user: BusinessUserDto;
  /** Contraseña temporal en claro. Solo viaja en esta respuesta; no se puede volver a leer. */
  temporaryPassword: string;
}

// — CRM: clientas del spa —

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  appointments: number;
  /** Citas confirmadas o completadas: las que de verdad pasaron por caja. */
  completedAppointments: number;
  /** Suma del precio de las citas confirmadas o completadas. */
  totalSpent: number;
  /** `YYYY-MM-DD` de la cita más reciente (de cualquier estado). */
  lastAppointmentDate: string | null;
  createdAt: string;
}

export interface CustomerDetail extends CustomerRow {
  history: Array<{
    id: string;
    code: string;
    date: string;
    startTime: string;
    serviceName: string;
    status: string;
    paymentStatus: string;
    price: number;
  }>;
}
