-- Embedded Signup de WhatsApp (docs/PANEL-OPERADOR.md §7.4).
-- Escrita a mano (sin `prisma migrate dev`) porque DATABASE_URL apunta a la base
-- real: se aplica con `pnpm db:deploy` cuando el operador lo decida.

-- CreateEnum
CREATE TYPE "WhatsAppOnboardingSource" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');

-- CreateEnum
CREATE TYPE "WhatsAppSignupSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'REVOKED', 'EXPIRED');

-- AlterTable
-- Las filas que ya existen se dieron de alta a mano por el panel (puente §7.3),
-- así que el default 'MANUAL' las describe correctamente sin backfill.
ALTER TABLE "whatsapp_accounts" ADD COLUMN     "onboarding_source" "WhatsAppOnboardingSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "business_portfolio_id" TEXT,
ADD COLUMN     "registration_pin_enc" TEXT,
ADD COLUMN     "registered_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "whatsapp_signup_sessions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "WhatsAppSignupSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "account_id" TEXT,
    "waba_id" TEXT,
    "phone_number_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_signup_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_signup_sessions_token_hash_key" ON "whatsapp_signup_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "whatsapp_signup_sessions_business_id_status_idx" ON "whatsapp_signup_sessions"("business_id", "status");

-- AddForeignKey
ALTER TABLE "whatsapp_signup_sessions" ADD CONSTRAINT "whatsapp_signup_sessions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
