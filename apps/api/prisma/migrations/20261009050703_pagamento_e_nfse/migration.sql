-- CreateEnum
CREATE TYPE "PernaPagamento" AS ENUM ('PRINCIPAL', 'SUBCONTRATACAO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PRE_AUTORIZADO', 'RETIDO', 'LIBERADO', 'CANCELADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "StatusDocumentoFiscal" AS ENUM ('RASCUNHO', 'EMITIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemDaEmissao" AS ENUM ('MEDICO', 'AUTOMATICA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacao" ADD VALUE 'NFSE_PRONTA_PARA_EMITIR';
ALTER TYPE "TipoNotificacao" ADD VALUE 'NFSE_EMITIDA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'PAGAMENTO_LIBERADO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'PAGAMENTO_ESTORNADO';

-- AlterTable
ALTER TABLE "instituicao" ADD COLUMN     "iss_retido_bp" INTEGER,
ADD COLUMN     "permite_subcontratacao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pagamento" (
    "id" UUID NOT NULL,
    "plantao_id" UUID NOT NULL,
    "perna" "PernaPagamento" NOT NULL,
    "pagador_instituicao_id" UUID,
    "pagador_medico_id" UUID,
    "beneficiario_medico_id" UUID NOT NULL,
    "valor_bruto_centavos" INTEGER NOT NULL,
    "retido_centavos" INTEGER NOT NULL DEFAULT 0,
    "taxa_plataforma_centavos" INTEGER NOT NULL DEFAULT 0,
    "liquido_centavos" INTEGER NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PRE_AUTORIZADO',
    "referencia_gateway" TEXT NOT NULL,
    "pre_autorizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retido_em" TIMESTAMPTZ(6),
    "liberavel_em" TIMESTAMPTZ(6),
    "liberado_em" TIMESTAMPTZ(6),
    "cancelado_em" TIMESTAMPTZ(6),
    "estornado_em" TIMESTAMPTZ(6),

    CONSTRAINT "pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_fiscal" (
    "id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "prestador_medico_id" UUID NOT NULL,
    "prestador_nome" TEXT NOT NULL,
    "prestador_registro" TEXT NOT NULL,
    "tomador_nome" TEXT NOT NULL,
    "tomador_registro" TEXT NOT NULL,
    "discriminacao" TEXT NOT NULL,
    "valor_servico_centavos" INTEGER NOT NULL,
    "retencoes" JSONB NOT NULL,
    "observacoes" TEXT[],
    "valor_liquido_centavos" INTEGER NOT NULL,
    "status" "StatusDocumentoFiscal" NOT NULL DEFAULT 'RASCUNHO',
    "numero" TEXT,
    "codigo_verificacao" TEXT,
    "emitida_em" TIMESTAMPTZ(6),
    "emitida_por" "OrigemDaEmissao",
    "cancelada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagamento_plantao_id_idx" ON "pagamento"("plantao_id");

-- CreateIndex
CREATE INDEX "pagamento_status_liberavel_em_idx" ON "pagamento"("status", "liberavel_em");

-- CreateIndex
CREATE UNIQUE INDEX "documento_fiscal_pagamento_id_key" ON "documento_fiscal"("pagamento_id");

-- CreateIndex
CREATE INDEX "documento_fiscal_prestador_medico_id_status_idx" ON "documento_fiscal"("prestador_medico_id", "status");

-- AddForeignKey
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

