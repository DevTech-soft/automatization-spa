-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargeMode" AS ENUM ('TOTAL', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentEnvironment" AS ENUM ('TEST', 'PROD');

-- CreateEnum
CREATE TYPE "SubscriptionCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "OperatorInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'DEPOSIT_PAID';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "deposit_amount" DECIMAL(12,2),
ADD COLUMN     "pending_balance" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "charge_mode" "ChargeMode" NOT NULL DEFAULT 'TOTAL',
ADD COLUMN     "color_primary" TEXT,
ADD COLUMN     "color_secondary" TEXT,
ADD COLUMN     "deposit_percentage" INTEGER,
ADD COLUMN     "status" "BusinessStatus" NOT NULL DEFAULT 'TRIAL';

-- deposit_percentage: entero 1–100, solo relevante en chargeMode = DEPOSIT (docs/PANEL-OPERADOR.md §4).
-- Prisma no expresa CHECK en el schema; se mantiene como SQL custom (igual que el trigger de capacity).
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_deposit_percentage_range"
  CHECK ("deposit_percentage" IS NULL OR ("deposit_percentage" BETWEEN 1 AND 100));

-- Backfill: los negocios que ya operan (MVP en vivo) nacen ACTIVE, no TRIAL.
-- El default de la columna (TRIAL) aplica solo a altas nuevas por el panel (§6.1).
UPDATE "businesses" SET "status" = 'ACTIVE' WHERE "active" = true;

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT,
    "display_name" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "subscription_status" TEXT,
    "quality_rating" TEXT,
    "messaging_limit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_credentials" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'wompi',
    "environment" "PaymentEnvironment" NOT NULL DEFAULT 'PROD',
    "api_key_enc" TEXT NOT NULL,
    "public_key_enc" TEXT NOT NULL,
    "integrity_secret_enc" TEXT NOT NULL,
    "webhook_secret_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'mensual',
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "cycle" "SubscriptionCycle" NOT NULL DEFAULT 'MONTHLY',
    "valid_until" DATE NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "due_at" DATE NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "status" "OperatorInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_payments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "paid_at" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_payment_invoices" (
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,

    CONSTRAINT "operator_payment_invoices_pkey" PRIMARY KEY ("payment_id","invoice_id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "sold_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "business_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key" ON "whatsapp_accounts"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_business_id_idx" ON "whatsapp_accounts"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_credentials_business_id_key" ON "payment_credentials"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_business_id_key" ON "subscription_plans"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "operator_invoices_number_key" ON "operator_invoices"("number");

-- CreateIndex
CREATE INDEX "operator_invoices_business_id_idx" ON "operator_invoices"("business_id");

-- CreateIndex
CREATE INDEX "operator_invoices_status_idx" ON "operator_invoices"("status");

-- CreateIndex
CREATE INDEX "operator_payments_business_id_idx" ON "operator_payments"("business_id");

-- CreateIndex
CREATE INDEX "operator_payment_invoices_invoice_id_idx" ON "operator_payment_invoices"("invoice_id");

-- CreateIndex
CREATE INDEX "client_contacts_business_id_idx" ON "client_contacts"("business_id");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_idx" ON "audit_logs"("business_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_credentials" ADD CONSTRAINT "payment_credentials_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_invoices" ADD CONSTRAINT "operator_invoices_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_payments" ADD CONSTRAINT "operator_payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_payment_invoices" ADD CONSTRAINT "operator_payment_invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "operator_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_payment_invoices" ADD CONSTRAINT "operator_payment_invoices_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "operator_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

