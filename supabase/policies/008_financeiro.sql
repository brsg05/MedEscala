-- =============================================================================
-- 008 — Pagamento, split e NFS-e simulados (F14, F15, F17; DEC-201 a DEC-207)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_fiscal ENABLE ROW LEVEL SECURITY;

-- No máximo UM pagamento vivo por perna de um plantão. Repasse aprovado no
-- modelo A cancela o do titular antes de pré-autorizar o do substituto.
CREATE UNIQUE INDEX IF NOT EXISTS pagamento_uma_perna_viva
  ON public.pagamento (plantao_id, perna)
  WHERE status IN ('PRE_AUTORIZADO', 'RETIDO', 'LIBERADO');

DO $$
BEGIN
  -- O split fecha: bruto = retido + taxa da plataforma + líquido (F17).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagamento_split_fecha') THEN
    ALTER TABLE public.pagamento
      ADD CONSTRAINT pagamento_split_fecha
      CHECK (valor_bruto_centavos = retido_centavos + taxa_plataforma_centavos + liquido_centavos
             AND retido_centavos >= 0 AND taxa_plataforma_centavos >= 0 AND liquido_centavos >= 0);
  END IF;

  -- Exatamente uma pagadora: a instituição (perna principal) ou o titular (B).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagamento_uma_pagadora') THEN
    ALTER TABLE public.pagamento
      ADD CONSTRAINT pagamento_uma_pagadora
      CHECK ((pagador_instituicao_id IS NULL) <> (pagador_medico_id IS NULL));
  END IF;

  -- F17: liberação vinculada ao documento fiscal — conferido no trigger abaixo.

  -- Nota emitida tem número, código e data; rascunho não tem.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documento_emitido_completo') THEN
    ALTER TABLE public.documento_fiscal
      ADD CONSTRAINT documento_emitido_completo
      CHECK (status = 'RASCUNHO'
             OR (numero IS NOT NULL AND codigo_verificacao IS NOT NULL AND emitida_em IS NOT NULL)
             OR status = 'CANCELADA');
  END IF;

  -- DEC-206: ISS entre 2% e 5% (LC 116/2003), ou sem retenção.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instituicao_iss_valido') THEN
    ALTER TABLE public.instituicao
      ADD CONSTRAINT instituicao_iss_valido
      CHECK (iss_retido_bp IS NULL OR iss_retido_bp BETWEEN 200 AND 500);
  END IF;
END
$$;

-- F17 — "liberação do valor vinculada ao documento fiscal": o banco recusa
-- LIBERADO sem NFS-e emitida para a perna. Não é disciplina do código.
CREATE OR REPLACE FUNCTION public.pagamento_libera_so_com_nota()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'LIBERADO' AND OLD.status IS DISTINCT FROM 'LIBERADO' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.documento_fiscal d
      WHERE d.pagamento_id = NEW.id AND d.status = 'EMITIDA'
    ) THEN
      RAISE EXCEPTION 'Pagamento % não pode ser liberado sem NFS-e emitida (F17)', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagamento_libera_so_com_nota ON public.pagamento;
CREATE TRIGGER pagamento_libera_so_com_nota BEFORE UPDATE ON public.pagamento
  FOR EACH ROW EXECUTE FUNCTION public.pagamento_libera_so_com_nota();
