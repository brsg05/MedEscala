-- CreateEnum
CREATE TYPE "TipoTermo" AS ENUM ('CONTRATO_PLANTAO', 'SUBSTITUICAO');

-- CreateEnum
CREATE TYPE "PapelNoTermo" AS ENUM ('MEDICO', 'TITULAR', 'SUBSTITUTO', 'INSTITUICAO');

-- CreateEnum
CREATE TYPE "MetodoAssinatura" AS ENUM ('ACEITE_NO_APP');

-- CreateTable
CREATE TABLE "termo" (
    "id" UUID NOT NULL,
    "tipo" "TipoTermo" NOT NULL,
    "plantao_id" UUID NOT NULL,
    "repasse_id" UUID,
    "conteudo" JSONB NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "emitido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "substituido_em" TIMESTAMPTZ(6),

    CONSTRAINT "termo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinatura_termo" (
    "id" UUID NOT NULL,
    "termo_id" UUID NOT NULL,
    "papel" "PapelNoTermo" NOT NULL,
    "usuario_id" UUID,
    "nome" TEXT NOT NULL,
    "registro" TEXT,
    "metodo" "MetodoAssinatura" NOT NULL DEFAULT 'ACEITE_NO_APP',
    "acao" TEXT NOT NULL,
    "assinada_em" TIMESTAMPTZ(6) NOT NULL,
    "hash_assinado" CHAR(64) NOT NULL,

    CONSTRAINT "assinatura_termo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "termo_repasse_id_key" ON "termo"("repasse_id");

-- CreateIndex
CREATE INDEX "termo_plantao_id_idx" ON "termo"("plantao_id");

-- CreateIndex
CREATE UNIQUE INDEX "assinatura_termo_termo_id_papel_key" ON "assinatura_termo"("termo_id", "papel");

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_plantao_id_fkey" FOREIGN KEY ("plantao_id") REFERENCES "plantao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termo" ADD CONSTRAINT "termo_repasse_id_fkey" FOREIGN KEY ("repasse_id") REFERENCES "repasse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinatura_termo" ADD CONSTRAINT "assinatura_termo_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "termo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

