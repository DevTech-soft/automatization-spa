import { z } from "zod";

export const businessStatusValues = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
export type BusinessStatus = (typeof businessStatusValues)[number];

export const chargeModeValues = ["TOTAL", "DEPOSIT"] as const;
export type ChargeMode = (typeof chargeModeValues)[number];

/** Fila de la tabla de negocios del panel (`GET /admin/businesses`). */
export interface BusinessListItem {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  chargeMode: ChargeMode;
  active: boolean;
  createdAt: string;
}

/** Detalle de un negocio (`GET /admin/businesses/:id`). */
export interface BusinessDetail extends BusinessListItem {
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  depositPercentage: number | null;
  organizationId: string | null;
  updatedAt: string;
}

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (sin guion al inicio/fin).");

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  phone: optionalText(30),
  whatsappNumber: optionalText(30),
  email: z.string().trim().email("Correo inválido.").optional().or(z.literal("")),
  address: optionalText(200),
  timezone: z.string().trim().min(1).default("America/Bogota"),
  currency: z.string().trim().length(3).toUpperCase().default("COP"),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: optionalText(30),
    whatsappNumber: optionalText(30),
    email: z.string().trim().email("Correo inválido.").optional().or(z.literal("")),
    address: optionalText(200),
    timezone: z.string().trim().min(1),
    currency: z.string().trim().length(3).toUpperCase(),
    status: z.enum(businessStatusValues),
    chargeMode: z.enum(chargeModeValues),
    active: z.boolean(),
    depositPercentage: z.coerce.number().int().min(1).max(99).nullable(),
    colorPrimary: optionalText(20),
    colorSecondary: optionalText(20),
  })
  .partial()
  .refine(
    (data) => data.chargeMode !== "DEPOSIT" || data.depositPercentage != null,
    { message: "El modo abono requiere un porcentaje (1–99).", path: ["depositPercentage"] },
  );
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
