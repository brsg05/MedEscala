-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('CONVITE_RECEBIDO', 'CONVITE_CANCELADO', 'SUBSTITUTO_ACEITOU', 'CONVITE_RECUSADO', 'CONVITE_EXPIRADO', 'FILA_ESGOTADA', 'APROVACAO_PENDENTE', 'REPASSE_APROVADO', 'REPASSE_RECUSADO', 'REPASSE_CANCELADO', 'MEDICO_ESCALADO', 'CRM_VERIFICADO', 'INSTITUICAO_APROVADA', 'CADASTRO_PENDENTE');

-- CreateTable
CREATE TABLE "notificacao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "link" TEXT,
    "entidade" TEXT,
    "entidade_id" UUID,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TIMESTAMPTZ(6),

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_criada_em_idx" ON "notificacao"("usuario_id", "criada_em" DESC);

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_lida_em_idx" ON "notificacao"("usuario_id", "lida_em");

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

