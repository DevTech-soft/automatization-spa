import { z } from "zod";

/**
 * Query de paginación/orden para los listados del panel (`/admin/*`). El
 * backend hace la paginación server-side contra Postgres (docs/PANEL-OPERADOR.md
 * §D10) — TanStack Table en el panel solo pinta.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(200).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, query: Pick<PaginationQuery, "page" | "pageSize">): PaginatedResponse<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
