-- CreateEnum
CREATE TYPE "StatusConvite" AS ENUM ('NA_FILA', 'ATIVO', 'ACEITO', 'RECUSADO', 'EXPIRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemConvite" AS ENUM ('INDICACAO', 'MATCHING');

-- AlterTable
ALTER TABLE "instituicao" ADD COLUMN     "prazo_convite_repasse_minutos" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "repasse" DROP COLUMN "resposta_ate",
ADD COLUMN     "fila_esgotada_em" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "convite_repasse" (
    "id" UUID NOT NULL,
    "repasse_id" UUID NOT NULL,
    "medico_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "origem" "OrigemConvite" NOT NULL,
    "status" "StatusConvite" NOT NULL DEFAULT 'NA_FILA',
    "ativado_em" TIMESTAMPTZ(6),
    "prazo_ate" TIMESTAMPTZ(6),
    "respondido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convite_repasse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "convite_repasse_medico_id_status_idx" ON "convite_repasse"("medico_id", "status");

-- CreateIndex
CREATE INDEX "convite_repasse_status_prazo_ate_idx" ON "convite_repasse"("status", "prazo_ate");

-- CreateIndex
CREATE UNIQUE INDEX "convite_repasse_repasse_id_medico_id_key" ON "convite_repasse"("repasse_id", "medico_id");

-- CreateIndex
CREATE UNIQUE INDEX "convite_repasse_repasse_id_ordem_key" ON "convite_repasse"("repasse_id", "ordem");

-- AddForeignKey
ALTER TABLE "convite_repasse" ADD CONSTRAINT "convite_repasse_repasse_id_fkey" FOREIGN KEY ("repasse_id") REFERENCES "repasse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convite_repasse" ADD CONSTRAINT "convite_repasse_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

