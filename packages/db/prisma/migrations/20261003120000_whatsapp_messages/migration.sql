-- Transcripción de WhatsApp por negocio (docs/PANEL-OPERADOR.md F7).
-- Generada offline con `prisma migrate diff --from-schema-datamodel` (sin
-- shadow DB: DATABASE_URL apunta a la base real). Solo crea objetos nuevos.

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageSource" AS ENUM ('CUSTOMER', 'BOT', 'AGENT', 'NOTIFICATION');

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "source" "WhatsAppMessageSource" NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "contact_name" TEXT,
    "wa_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_key" ON "whatsapp_messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_phone_created_at_idx" ON "whatsapp_messages"("business_id", "phone", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_business_id_created_at_idx" ON "whatsapp_messages"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

