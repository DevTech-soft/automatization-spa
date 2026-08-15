-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('SELECTING_SERVICE', 'SELECTING_DATE', 'SELECTING_TIME', 'COLLECTING_NAME', 'COLLECTING_PHONE', 'WAITING_PAYMENT', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'SELECTING_SERVICE',
    "service_id" TEXT,
    "date" DATE,
    "start_time" TEXT,
    "customer_name" TEXT,
    "appointment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversations_business_id_idx" ON "whatsapp_conversations"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_business_id_phone_key" ON "whatsapp_conversations"("business_id", "phone");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
