-- CreateEnum
CREATE TYPE "StatusInstituicao" AS ENUM ('PENDENTE', 'ATIVA');

-- AlterTable
ALTER TABLE "instituicao" ADD COLUMN     "status" "StatusInstituicao" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "verificada_em" TIMESTAMPTZ(6),
ADD COLUMN     "verificada_por_id" UUID;

