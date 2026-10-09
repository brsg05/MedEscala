-- =============================================================================
-- 005 — Execução do plantão e contestação (F16, DEC-130 a DEC-134, ADR-020)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.contestacao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- EM_EXECUCAO quer dizer "o executante fez check-in". Sem a marca, o estado
  -- mentiria sobre o que aconteceu.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantao_em_execucao_tem_checkin') THEN
    ALTER TABLE public.plantao
      ADD CONSTRAINT plantao_em_execucao_tem_checkin
      CHECK (status <> 'EM_EXECUCAO' OR checkin_em IS NOT NULL);
  END IF;

  -- Check-out só depois de um check-in, e nunca antes dele.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantao_checkout_depois_do_checkin') THEN
    ALTER TABLE public.plantao
      ADD CONSTRAINT plantao_checkout_depois_do_checkin
      CHECK (checkout_em IS NULL OR (checkin_em IS NOT NULL AND checkout_em >= checkin_em));
  END IF;

  -- A janela de contestação nasce do check-out (DEC-130). Plantão confirmado
  -- pela própria instituição (DEC-131) não tem janela: quem contestaria é ela.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantao_contestavel_so_com_checkout') THEN
    ALTER TABLE public.plantao
      ADD CONSTRAINT plantao_contestavel_so_com_checkout
      CHECK (contestavel_ate IS NULL OR checkout_em IS NOT NULL);
  END IF;

  -- DEC-132: configurável, de 1 hora a 14 dias.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instituicao_prazo_contestacao_valido') THEN
    ALTER TABLE public.instituicao
      ADD CONSTRAINT instituicao_prazo_contestacao_valido
      CHECK (prazo_contestacao_horas BETWEEN 1 AND 336);
  END IF;

  -- Resolução é inteira ou não existe: resultado, quem e quando, juntos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contestacao_resolucao_completa') THEN
    ALTER TABLE public.contestacao
      ADD CONSTRAINT contestacao_resolucao_completa
      CHECK (
        (resultado IS NULL AND resolvida_em IS NULL AND resolvida_por_id IS NULL)
        OR (resultado IS NOT NULL AND resolvida_em IS NOT NULL AND resolvida_por_id IS NOT NULL)
      );
  END IF;
END
$$;
