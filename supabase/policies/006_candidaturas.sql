-- =============================================================================
-- 006 — Candidatura a vaga aberta (F10, DEC-135)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.candidatura ENABLE ROW LEVEL SECURITY;

-- Candidatura ainda pendente não tem resposta; respondida, tem data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidatura_respondida_tem_data') THEN
    ALTER TABLE public.candidatura
      ADD CONSTRAINT candidatura_respondida_tem_data
      CHECK ((status = 'PENDENTE') = (respondida_em IS NULL));
  END IF;
END
$$;
