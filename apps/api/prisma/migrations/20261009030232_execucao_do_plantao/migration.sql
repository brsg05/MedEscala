-- CreateEnum
CREATE TYPE "ResultadoContestacao" AS ENUM ('IMPROCEDENTE', 'PROCEDENTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacao" ADD VALUE 'CHECKIN_LIBERADO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CHECKOUT_REGISTRADO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'PLANTAO_SEM_CONFIRMACAO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'PLANTAO_CONFIRMADO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'PLANTAO_CONTESTADO';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CONTESTACAO_RESPONDIDA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CONTESTACAO_RESOLVIDA';

-- AlterTable
ALTER TABLE "instituicao" ADD COLUMN     "prazo_contestacao_horas" INTEGER NOT NULL DEFAULT 72;

-- AlterTable
ALTER TABLE "plantao" ADD COLUMN     "alerta_sem_confirmacao_em" TIMESTAMPTZ(6),
ADD COLUMN     "checkin_em" TIMESTAMPTZ(6),
ADD COLUMN     "checkout_em" TIMESTAMPTZ(6),
ADD COLUMN     "contestavel_ate" TIMESTAMPTZ(6),
ADD COLUMN     "lembrete_checkin_em" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "contestacao" (
    "id" UUID NOT NULL,
    "plantao_id" UUID NOT NULL,
    "justificativa" TEXT NOT NULL,
    "aberta_por_id" UUID NOT NULL,
    "aberta_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resposta" TEXT,
    "respondida_em" TIMESTAMPTZ(6),
    "resultado" "ResultadoContestacao",
    "nota" TEXT,
    "resolvida_por_id" UUID,
    "resolvida_em" TIMESTAMPTZ(6),

    CONSTRAINT "contestacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contestacao_plantao_id_key" ON "contestacao"("plantao_id");

-- AddForeignKey
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

