-- =============================================================================
-- 009 — Aceite da política de privacidade (F24, ADR-015, DEC-224 a DEC-227)
--
-- Idempotente; aplicado depois de `prisma migrate`, como os demais.
-- =============================================================================

ALTER TABLE public.aceite_politica ENABLE ROW LEVEL SECURITY;

-- O aceite é prova: quem aceitou, qual versão, quando, sobre qual texto. Um
-- aceite reescrito não prova nada — por isso o banco recusa UPDATE, como faz com
-- a trilha (ADR-012). DELETE fica permitido só porque a remoção da conta apaga
-- em cascata; nenhum caminho da api apaga aceite.
CREATE OR REPLACE FUNCTION public.aceite_politica_imutavel()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'aceite_politica é imutável: registre um aceite novo (F24)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS aceite_politica_imutavel ON public.aceite_politica;
CREATE TRIGGER aceite_politica_imutavel BEFORE UPDATE ON public.aceite_politica
  FOR EACH ROW EXECUTE FUNCTION public.aceite_politica_imutavel();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aceite_politica_hash_hex') THEN
    ALTER TABLE public.aceite_politica
      ADD CONSTRAINT aceite_politica_hash_hex CHECK (hash_texto ~ '^[0-9a-f]{64}$');
  END IF;
END
$$;
