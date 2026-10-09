-- =============================================================================
-- Fila única de convites (DEC-164) e candidatura a vaga (F10, DEC-135)
--
-- Escrita à mão a partir do diff do Prisma: o Prisma gera DROP + CREATE para
-- renomear tabela, o que apagaria os convites existentes. Aqui tudo é RENAME,
-- e os nomes finais batem com os que o Prisma espera (nenhum drift depois).
-- =============================================================================

-- CreateEnum
CREATE TYPE "StatusCandidatura" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'RETIRADA', 'ENCERRADA');

-- AlterEnum
ALTER TYPE "TipoNotificacao" ADD VALUE 'CANDIDATURA_RECEBIDA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CANDIDATURA_ACEITA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CANDIDATURA_RECUSADA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'CANDIDATURA_ENCERRADA';
ALTER TYPE "TipoNotificacao" ADD VALUE 'VAGA_PREENCHIDA';

-- Instituição: um prazo só para a fila, de repasse ou de vaga (DEC-165). O valor
-- configurado é preservado; o campo nunca usado sai.
ALTER TABLE "instituicao" RENAME COLUMN "prazo_convite_repasse_minutos" TO "prazo_convite_minutos";
ALTER TABLE "instituicao" DROP COLUMN "validade_convite_horas";

-- convite_repasse → convite, preservando as linhas.
ALTER TABLE "convite_repasse" RENAME TO "convite";
ALTER TABLE "convite" RENAME CONSTRAINT "convite_repasse_pkey" TO "convite_pkey";
ALTER TABLE "convite" RENAME CONSTRAINT "convite_repasse_repasse_id_fkey" TO "convite_repasse_id_fkey";
ALTER TABLE "convite" RENAME CONSTRAINT "convite_repasse_medico_id_fkey" TO "convite_medico_id_fkey";
ALTER INDEX "convite_repasse_medico_id_status_idx" RENAME TO "convite_medico_id_status_idx";
ALTER INDEX "convite_repasse_status_prazo_ate_idx" RENAME TO "convite_status_prazo_ate_idx";

-- A unicidade por fila passa a incluir o plantão e a tratar repasse nulo (fila
-- da vaga) como igual — ver supabase/policies/006 (UNIQUE NULLS NOT DISTINCT).
DROP INDEX "convite_repasse_repasse_id_medico_id_key";
DROP INDEX "convite_repasse_repasse_id_ordem_key";
-- O "um convidado da vez" passa a valer por plantão (006 recria).
DROP INDEX IF EXISTS "convite_um_ativo_por_repasse";

-- Todo convite aponta para o plantão; o repasse fica opcional.
ALTER TABLE "convite" ADD COLUMN "plantao_id" UUID;
UPDATE "convite" c SET "plantao_id" = r."plantao_id" FROM "repasse" r WHERE r."id" = c."repasse_id";
ALTER TABLE "convite" ALTER COLUMN "plantao_id" SET NOT NULL;
ALTER TABLE "convite" ALTER COLUMN "repasse_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "convite_plantao_id_repasse_id_idx" ON "convite"("plantao_id", "repasse_id");

-- AddForeignKey
ALTER TABLE "convite" ADD CONSTRAINT "convite_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "candidatura" (
    "id" UUID NOT NULL,
    "plantao_id" UUID NOT NULL,
    "medico_id" UUID NOT NULL,
    "status" "StatusCandidatura" NOT NULL DEFAULT 'PENDENTE',
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondida_em" TIMESTAMPTZ(6),

    CONSTRAINT "candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidatura_plantao_id_status_idx" ON "candidatura"("plantao_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "candidatura_plantao_id_medico_id_key" ON "candidatura"("plantao_id", "medico_id");

-- AddForeignKey
ALTER TABLE "candidatura" ADD CONSTRAINT "candidatura_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatura" ADD CONSTRAINT "candidatura_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
