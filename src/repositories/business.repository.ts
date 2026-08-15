import { prisma } from "../db/prisma.js";

export const businessRepository = {
  findBySlug(slug: string) {
    return prisma.business.findFirst({ where: { slug, active: true } });
  },

  findById(id: string) {
    return prisma.business.findFirst({ where: { id, active: true } });
  },
};
