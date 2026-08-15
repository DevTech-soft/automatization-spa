import { z } from "zod";

export const getBusinessParamsSchema = z.object({
  slug: z.string().min(1),
});
