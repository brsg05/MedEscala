-- =============================================================================
-- 003 — Fila de convites do repasse (DEC-087 a DEC-099)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.convite_repasse ENABLE ROW LEVEL SECURITY;

-- No máximo UM convidado da vez por repasse. A fila anda de um em um; dois
-- convites ATIVOS ao mesmo tempo permitiriam dois médicos aceitarem o mesmo
-- plantão. Uma checagem em TypeScript perderia a corrida entre a expiração
-- disparada pelo job e a disparada por uma leitura — o índice não perde.
CREATE UNIQUE INDEX IF NOT EXISTS convite_um_ativo_por_repasse
  ON public.convite_repasse (repasse_id)
  WHERE status = 'ATIVO';

-- Convite ATIVO sem prazo seria um convite eterno, exatamente o travamento que a
-- DEC-097 existe para impedir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'convite_ativo_tem_prazo') THEN
    ALTER TABLE public.convite_repasse
      ADD CONSTRAINT convite_ativo_tem_prazo
      CHECK (status <> 'ATIVO' OR (prazo_ate IS NOT NULL AND ativado_em IS NOT NULL));
  END IF;
END
$$;

-- O prazo de convite configurável precisa ser positivo e curto (DEC-089, DEC-090):
-- até 24h, porque prazo longo empurra a fila para depois do início do plantão.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instituicao_prazo_convite_valido') THEN
    ALTER TABLE public.instituicao
      ADD CONSTRAINT instituicao_prazo_convite_valido
      CHECK (prazo_convite_repasse_minutos BETWEEN 5 AND 1440);
  END IF;
END
$$;
