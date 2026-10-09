-- =============================================================================
-- 002 — RN01, RN03 e integridade do repasse
--
-- Mesma regra do arquivo 001: idempotente, aplicado DEPOIS de `prisma migrate`.
--
-- O ponto deste arquivo é que as duas regras centrais do projeto deixem de ser
-- promessa de código e virem recusa do Postgres. O §12 do guia exige, para cada
-- RN01–RN10, um teste que TENTE violar a regra e espere falha — um teste assim
-- só tem valor se a violação for impossível por qualquer caminho, inclusive por
-- um UPDATE direto no banco que ninguém escreveu ainda.
-- =============================================================================

-- `btree_gist` permite combinar igualdade de uuid com sobreposição de intervalo
-- na mesma exclusion constraint. Sem ela, o Postgres só aceitaria o operador de
-- range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- 1. RLS nas tabelas novas — negar por padrão (D4)
-- -----------------------------------------------------------------------------

ALTER TABLE public.medico                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.janela_disponibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setor                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantao                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse                ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. RN01 — o executante só muda com repasse APROVADO
--
-- "Nenhum repasse se conclui sem aprovação expressa da instituição responsável
-- pela escala." O guia (§7.3) chama isto de invariante central e manda que tudo
-- passe por `RepasseService.aprovar()`. Aqui essa exigência para de depender de
-- ninguém lembrar dela.
--
-- A primeira atribuição é livre (NULL -> titular, quando o plantão é
-- preenchido). O que a regra proíbe é a TROCA de um executante já definido.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.exigir_repasse_aprovado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.medico_executante_id IS NOT DISTINCT FROM OLD.medico_executante_id THEN
    RETURN NEW;
  END IF;

  -- Preenchimento inicial da vaga: ainda não há de quem trocar.
  IF OLD.medico_executante_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.medico_executante_id IS NULL THEN
    RAISE EXCEPTION
      'RN01: executante nao pode ser removido; cancele o plantao ou abra um repasse'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.repasse r
    WHERE r.plantao_id = NEW.id
      AND r.status = 'APROVADO'
      AND r.medico_substituto_id = NEW.medico_executante_id
  ) THEN
    RAISE EXCEPTION
      'RN01: medico_executante_id so muda com repasse APROVADO para este substituto'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plantao_rn01_executante ON public.plantao;
CREATE TRIGGER plantao_rn01_executante
  BEFORE UPDATE OF medico_executante_id ON public.plantao
  FOR EACH ROW EXECUTE FUNCTION public.exigir_repasse_aprovado();

-- -----------------------------------------------------------------------------
-- 3. RN03 — sem sobreposição de horários para o mesmo executante
--
-- "O sistema bloqueia sobreposição de horários." Uma verificação em TypeScript
-- perde a corrida: dois aceites simultâneos consultam a agenda, os dois veem
-- vaga livre, os dois gravam. A exclusion constraint resolve no nível em que a
-- corrida acontece.
--
-- Plantão cancelado sai da regra: um turno cancelado não ocupa ninguém.
-- A outra metade da RN03 — alertar quando plantões contíguos passam de 24h — é
-- alerta, não bloqueio, e fica na aplicação.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantao_rn03_sem_sobreposicao'
  ) THEN
    ALTER TABLE public.plantao
      ADD CONSTRAINT plantao_rn03_sem_sobreposicao
      EXCLUDE USING gist (
        medico_executante_id WITH =,
        tstzrange(inicio, fim, '[)') WITH &&
      )
      WHERE (medico_executante_id IS NOT NULL AND status <> 'CANCELADO');
  END IF;
END
$$;

-- Intervalo inválido não deve nem entrar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantao_intervalo_valido'
  ) THEN
    ALTER TABLE public.plantao
      ADD CONSTRAINT plantao_intervalo_valido CHECK (fim > inicio);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'janela_intervalo_valido'
  ) THEN
    ALTER TABLE public.janela_disponibilidade
      ADD CONSTRAINT janela_intervalo_valido CHECK (fim > inicio);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 4. No máximo um repasse em aberto por plantão
--
-- O recorte do §7.2 marcava `plantaoId` como `@unique`, o que impediria uma
-- segunda tentativa depois de uma recusa — e o próprio §7.3 prevê
-- `RECUSADO_* -> SOLICITADO`. O índice parcial permite o histórico de tentativas
-- e ainda assim impede dois repasses disputando o mesmo turno.
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS repasse_um_em_aberto_por_plantao
  ON public.repasse (plantao_id)
  WHERE status IN ('SOLICITADO', 'SUBSTITUTO_ACEITO', 'AGUARDANDO_APROVACAO');

-- O titular não pode indicar a si mesmo como substituto: seria repasse de
-- fachada, e a RN06 diz que a contratação se redireciona ao substituto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'repasse_substituto_diferente_do_titular'
  ) THEN
    ALTER TABLE public.repasse
      ADD CONSTRAINT repasse_substituto_diferente_do_titular
      CHECK (medico_substituto_id IS NULL OR medico_substituto_id <> medico_titular_id);
  END IF;
END
$$;

-- Aprovação exige quem aprovou e quando — a trilha precisa saber de quem foi o
-- ato (ADR-007).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'repasse_aprovacao_completa'
  ) THEN
    ALTER TABLE public.repasse
      ADD CONSTRAINT repasse_aprovacao_completa
      CHECK (
        status <> 'APROVADO'
        OR (aprovado_por_id IS NOT NULL AND aprovado_em IS NOT NULL AND medico_substituto_id IS NOT NULL)
      );
  END IF;
END
$$;

-- Recusa da instituição exige justificativa (F11: "com justificativa registrada").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'repasse_recusa_justificada'
  ) THEN
    ALTER TABLE public.repasse
      ADD CONSTRAINT repasse_recusa_justificada
      CHECK (
        status <> 'RECUSADO_INSTITUICAO'
        OR (justificativa_recusa IS NOT NULL AND length(trim(justificativa_recusa)) > 0)
      );
  END IF;
END
$$;
