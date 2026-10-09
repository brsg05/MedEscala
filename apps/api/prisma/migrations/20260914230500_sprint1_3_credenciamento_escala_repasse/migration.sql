-- CreateEnum
CREATE TYPE "StatusPlantao" AS ENUM ('ABERTO', 'EM_SELECAO', 'CONFIRMADO', 'EM_REPASSE', 'EM_EXECUCAO', 'EXECUTADO', 'LIQUIDADO', 'CONTESTADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusRepasse" AS ENUM ('SOLICITADO', 'SUBSTITUTO_ACEITO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'RECUSADO_SUBSTITUTO', 'RECUSADO_INSTITUICAO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ModeloFiscal" AS ENUM ('A_RECONTRATACAO', 'B_SUBCONTRATACAO');

-- CreateEnum
CREATE TYPE "ModeloContratacao" AS ENUM ('PJ', 'RPA');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- AlterTable
ALTER TABLE "instituicao" ADD COLUMN     "antecedencia_minima_repasse_horas" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "validade_convite_horas" INTEGER NOT NULL DEFAULT 12;

-- CreateTable
CREATE TABLE "medico" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "crm" VARCHAR(10) NOT NULL,
    "crm_uf" CHAR(2) NOT NULL,
    "especialidade" TEXT NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "verificado_em" TIMESTAMPTZ(6),
    "verificado_por_id" UUID,
    "cnpj" VARCHAR(14),
    "regime_tributario" "RegimeTributario",
    "inscricao_municipal" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "janela_disponibilidade" (
    "id" UUID NOT NULL,
    "medico_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6) NOT NULL,
    "valor_minimo_centavos" INTEGER,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "janela_disponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidade" (
    "id" UUID NOT NULL,
    "instituicao_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cnes" VARCHAR(7),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setor" (
    "id" UUID NOT NULL,
    "unidade_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "especialidade_exigida" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala" (
    "id" UUID NOT NULL,
    "setor_id" UUID NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantao" (
    "id" UUID NOT NULL,
    "escala_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6) NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "especialidade_exigida" TEXT NOT NULL,
    "requisitos" TEXT[],
    "modelo_contratacao" "ModeloContratacao" NOT NULL,
    "medico_titular_id" UUID,
    "medico_executante_id" UUID,
    "status" "StatusPlantao" NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plantao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasse" (
    "id" UUID NOT NULL,
    "plantao_id" UUID NOT NULL,
    "medico_titular_id" UUID NOT NULL,
    "medico_substituto_id" UUID,
    "motivo" TEXT NOT NULL,
    "modelo_fiscal" "ModeloFiscal" NOT NULL DEFAULT 'A_RECONTRATACAO',
    "status" "StatusRepasse" NOT NULL DEFAULT 'SOLICITADO',
    "resposta_ate" TIMESTAMPTZ(6) NOT NULL,
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMPTZ(6),
    "justificativa_recusa" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repasse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medico_usuario_id_key" ON "medico"("usuario_id");

-- CreateIndex
CREATE INDEX "medico_verificado_idx" ON "medico"("verificado");

-- CreateIndex
CREATE UNIQUE INDEX "medico_crm_crm_uf_key" ON "medico"("crm", "crm_uf");

-- CreateIndex
CREATE INDEX "janela_disponibilidade_medico_id_inicio_idx" ON "janela_disponibilidade"("medico_id", "inicio");

-- CreateIndex
CREATE INDEX "unidade_instituicao_id_idx" ON "unidade"("instituicao_id");

-- CreateIndex
CREATE INDEX "setor_unidade_id_idx" ON "setor"("unidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "escala_setor_id_competencia_key" ON "escala"("setor_id", "competencia");

-- CreateIndex
CREATE INDEX "plantao_inicio_status_idx" ON "plantao"("inicio", "status");

-- CreateIndex
CREATE INDEX "plantao_escala_id_idx" ON "plantao"("escala_id");

-- CreateIndex
CREATE INDEX "plantao_medico_executante_id_idx" ON "plantao"("medico_executante_id");

-- CreateIndex
CREATE INDEX "repasse_plantao_id_idx" ON "repasse"("plantao_id");

-- CreateIndex
CREATE INDEX "repasse_status_idx" ON "repasse"("status");

-- AddForeignKey
ALTER TABLE "medico" ADD CONSTRAINT "medico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "janela_disponibilidade" ADD CONSTRAINT "janela_disponibilidade_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_instituicao_id_fkey" FOREIGN KEY ("instituicao_id") REFERENCES "instituicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setor" ADD CONSTRAINT "setor_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantao" ADD CONSTRAINT "plantao_escala_id_fkey" FOREIGN KEY ("escala_id") REFERENCES "escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantao" ADD CONSTRAINT "plantao_medico_titular_id_fkey" FOREIGN KEY ("medico_titular_id") REFERENCES "medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantao" ADD CONSTRAINT "plantao_medico_executante_id_fkey" FOREIGN KEY ("medico_executante_id") REFERENCES "medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasse" ADD CONSTRAINT "repasse_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasse" ADD CONSTRAINT "repasse_medico_titular_id_fkey" FOREIGN KEY ("medico_titular_id") REFERENCES "medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasse" ADD CONSTRAINT "repasse_medico_substituto_id_fkey" FOREIGN KEY ("medico_substituto_id") REFERENCES "medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

