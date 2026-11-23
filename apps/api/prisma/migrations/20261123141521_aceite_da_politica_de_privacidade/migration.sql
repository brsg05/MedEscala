-- CreateTable
CREATE TABLE "aceite_politica" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "versao" VARCHAR(40) NOT NULL,
    "hash_texto" CHAR(64) NOT NULL,
    "aceito_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceite_politica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aceite_politica_usuario_id_versao_key" ON "aceite_politica"("usuario_id", "versao");

-- AddForeignKey
ALTER TABLE "aceite_politica" ADD CONSTRAINT "aceite_politica_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

