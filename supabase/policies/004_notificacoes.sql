-- =============================================================================
-- 004 — Notificações in-app (F22, DEC-121 a DEC-129)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

-- Como em todas as tabelas: o web nunca lê direto do Supabase (D2), mas se um
-- dia ler, a RLS ligada sem policy nega tudo por padrão.
ALTER TABLE public.notificacao ENABLE ROW LEVEL SECURITY;

-- Lida antes de criada não existe; protege a contagem de não lidas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notificacao_lida_depois_de_criada') THEN
    ALTER TABLE public.notificacao
      ADD CONSTRAINT notificacao_lida_depois_de_criada
      CHECK (lida_em IS NULL OR lida_em >= criada_em);
  END IF;
END
$$;
