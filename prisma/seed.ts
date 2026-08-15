import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

const DEMO_SLUG = "demo-spa";

async function main(): Promise<void> {
  console.log("Seeding Demo Spa...");

  const business = await prisma.business.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      name: "Demo Spa",
      slug: DEMO_SLUG,
      phone: "+573000000000",
      whatsappNumber: "+573000000000",
      email: "hola@demospa.test",
      address: "Calle 10 #20-30, Bogotá",
      timezone: "America/Bogota",
      currency: "COP",
      settings: { gift_card_validity_days: 365, reminder_hours_before: 24 },
      active: true,
    },
  });

  // Reseed limpio de datos dependientes para que el script sea idempotente.
  await prisma.appointment.deleteMany({ where: { businessId: business.id } });
  await prisma.customer.deleteMany({ where: { businessId: business.id } });
  await prisma.businessHour.deleteMany({ where: { businessId: business.id } });
  await prisma.service.deleteMany({ where: { businessId: business.id } });

  const services = await prisma.$transaction(
    [
      { name: "Manicure", description: "Manicure clásica", price: 35000, durationMinutes: 45, capacity: 3 },
      { name: "Pedicure", description: "Pedicure spa", price: 40000, durationMinutes: 45, capacity: 3 },
      {
        name: "Masaje relajante",
        description: "Masaje corporal relajante de 60 minutos",
        price: 90000,
        durationMinutes: 60,
        capacity: 1,
      },
      {
        name: "Limpieza facial",
        description: "Limpieza facial profunda",
        price: 70000,
        durationMinutes: 50,
        capacity: 2,
      },
      {
        name: "Day Spa",
        description: "Experiencia completa: masaje + facial + manicure",
        price: 180000,
        durationMinutes: 150,
        capacity: 1,
      },
    ].map((service) =>
      prisma.service.create({
        data: { ...service, businessId: business.id },
      }),
    ),
  );

  // Lunes (1) a sábado (6), 9:00 - 18:00.
  await prisma.businessHour.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      businessId: business.id,
      dayOfWeek,
      openTime: "09:00",
      closeTime: "18:00",
      active: true,
    })),
  });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Cliente de Prueba",
      phone: "+573001112233",
      email: "cliente@demospa.test",
    },
  });

  const manicure = services[0];
  if (manicure) {
    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        serviceId: manicure.id,
        appointmentCode: `APT-${nanoid(8).toUpperCase()}`,
        appointmentDate: new Date(),
        startTime: "10:00",
        endTime: "10:45",
        price: manicure.price,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        source: "WEB",
      },
    });
  }

  console.log(`Demo Spa listo: business=${business.id}, servicios=${services.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
