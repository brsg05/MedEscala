-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('MEDICO', 'CHEFIA_ESCALA', 'ADMIN_INSTITUICAO', 'OPERADOR_PLATAFORMA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instituicao" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instituicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_acesso" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "instituicao_id" UUID,
    "perfil" "Perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "familia" UUID NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator_id" UUID,
    "ator_perfil" "Perfil",
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "estado_anterior" TEXT,
    "estado_novo" TEXT,
    "payload" JSONB,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instituicao_cnpj_key" ON "instituicao"("cnpj");

-- CreateIndex
CREATE INDEX "perfil_acesso_usuario_id_ativo_idx" ON "perfil_acesso"("usuario_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_acesso_usuario_id_instituicao_id_perfil_key" ON "perfil_acesso"("usuario_id", "instituicao_id", "perfil");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_usuario_id_idx" ON "refresh_token"("usuario_id");

-- CreateIndex
CREATE INDEX "refresh_token_familia_idx" ON "refresh_token"("familia");

-- CreateIndex
CREATE INDEX "refresh_token_expira_em_idx" ON "refresh_token"("expira_em");

-- CreateIndex
CREATE INDEX "evento_auditoria_entidade_entidade_id_idx" ON "evento_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "evento_auditoria_ocorrido_em_idx" ON "evento_auditoria"("ocorrido_em");

-- CreateIndex
CREATE INDEX "evento_auditoria_ator_id_idx" ON "evento_auditoria"("ator_id");

-- AddForeignKey
ALTER TABLE "perfil_acesso" ADD CONSTRAINT "perfil_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_acesso" ADD CONSTRAINT "perfil_acesso_instituicao_id_fkey" FOREIGN KEY ("instituicao_id") REFERENCES "instituicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
