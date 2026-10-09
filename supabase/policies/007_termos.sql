-- =============================================================================
-- 007 — Termos contratuais (F13, DEC-184 a DEC-187)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.termo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_termo ENABLE ROW LEVEL SECURITY;

-- O termo é o retrato do que foi acordado (DEC-187): conteúdo e hash não mudam
-- depois da emissão. Só `substituido_em` pode ser marcado — uma vez.
CREATE OR REPLACE FUNCTION public.termo_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conteudo IS DISTINCT FROM OLD.conteudo
     OR NEW.hash IS DISTINCT FROM OLD.hash
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.plantao_id IS DISTINCT FROM OLD.plantao_id
     OR NEW.repasse_id IS DISTINCT FROM OLD.repasse_id
     OR NEW.emitido_em IS DISTINCT FROM OLD.emitido_em THEN
    RAISE EXCEPTION 'Termo % é imutável depois de emitido (DEC-187)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.substituido_em IS NOT NULL AND NEW.substituido_em IS DISTINCT FROM OLD.substituido_em THEN
    RAISE EXCEPTION 'Termo % já foi substituído', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS termo_imutavel ON public.termo;
CREATE TRIGGER termo_imutavel BEFORE UPDATE ON public.termo
  FOR EACH ROW EXECUTE FUNCTION public.termo_imutavel();

-- Assinatura não se edita: é o registro do aceite. (DELETE fica livre só para a
-- cascata de um plantão apagado — seed e e2e; a api não apaga termo.)
CREATE OR REPLACE FUNCTION public.assinatura_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Assinatura de termo não pode ser alterada'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS assinatura_imutavel ON public.assinatura_termo;
CREATE TRIGGER assinatura_imutavel BEFORE UPDATE ON public.assinatura_termo
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_imutavel();

-- A assinatura cobre o conteúdo do termo, e nenhum outro.
CREATE OR REPLACE FUNCTION public.assinatura_cobre_o_termo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hash_assinado <> (SELECT hash FROM public.termo WHERE id = NEW.termo_id) THEN
    RAISE EXCEPTION 'A assinatura não corresponde ao conteúdo do termo'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assinatura_cobre_o_termo ON public.assinatura_termo;
CREATE TRIGGER assinatura_cobre_o_termo BEFORE INSERT ON public.assinatura_termo
  FOR EACH ROW EXECUTE FUNCTION public.assinatura_cobre_o_termo();
