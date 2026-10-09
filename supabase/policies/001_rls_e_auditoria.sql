-- =============================================================================
-- 001 — RLS, integridade e imutabilidade da trilha de auditoria
--
-- Aplicado DEPOIS de `prisma migrate` (D3). Este arquivo é IDEMPOTENTE: rodar de
-- novo é seguro e é exatamente o que se faz quando uma migration do Prisma recria
-- uma tabela e derruba o que está aqui.
--
-- Por que não fica em supabase/migrations/: aquele diretório é aplicado pelo
-- `supabase db reset` ANTES de o Prisma criar as tabelas, e falharia. Quem aplica
-- este arquivo é `pnpm db:policies`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Integridade com o schema `auth`, que o Prisma não gerencia
-- -----------------------------------------------------------------------------

-- `usuario.id` É o uuid do Supabase Auth. Sem esta FK, nada impede um registro de
-- domínio órfão, apontando para uma credencial que não existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuario_id_fkey_auth_users'
  ) THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_id_fkey_auth_users
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END
$$;

-- O `@@unique([usuarioId, instituicaoId, perfil])` do Prisma NÃO impede duplicata
-- quando `instituicao_id` é NULL, porque em Postgres dois NULLs não colidem em
-- índice único. Sem isto, o mesmo OPERADOR_PLATAFORMA pode ser inserido n vezes.
CREATE UNIQUE INDEX IF NOT EXISTS perfil_acesso_usuario_perfil_global_key
  ON public.perfil_acesso (usuario_id, perfil)
  WHERE instituicao_id IS NULL;

-- -----------------------------------------------------------------------------
-- 2. RLS — negar por padrão (D4)
--
-- A api é o único escritor e usa `service_role`, que ignora RLS. Ligar RLS aqui é
-- defesa em profundidade: se algum dia a `anon key` for usada no frontend por
-- engano, o resultado é zero linha em vez de a base inteira. Nenhuma policy
-- permissiva é criada de propósito — RLS ligada e sem policy significa "ninguém,
-- exceto quem ignora RLS".
-- -----------------------------------------------------------------------------

ALTER TABLE public.usuario           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instituicao       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_acesso     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_token     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_auditoria  ENABLE ROW LEVEL SECURITY;

-- Refresh token não deve ser legível nem pelo dono da sessão: o hash é material de
-- segurança. `FORCE` faz a RLS valer inclusive para o dono da tabela.
ALTER TABLE public.refresh_token FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Trilha append-only (ADR-007 / RNF04)
--
-- ATENÇÃO — por que REVOKE não basta: o DONO da tabela sempre mantém todos os
-- privilégios, independentemente de REVOKE, e o Prisma conecta como `postgres`,
-- que é o dono. Um REVOKE sozinho daria uma falsa sensação de imutabilidade e o
-- teste passaria por engano.
--
-- Quem realmente garante é o TRIGGER abaixo: ele recusa UPDATE e DELETE para
-- qualquer role, dono incluído. O REVOKE fica como segunda camada, para os roles
-- não-donos.
-- -----------------------------------------------------------------------------

REVOKE UPDATE, DELETE ON public.evento_auditoria FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.evento_auditoria FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.impedir_alteracao_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'evento_auditoria e append-only (ADR-007/RNF04): % nao e permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS evento_auditoria_append_only ON public.evento_auditoria;
CREATE TRIGGER evento_auditoria_append_only
  BEFORE UPDATE OR DELETE ON public.evento_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.impedir_alteracao_auditoria();

-- TRUNCATE escapa de trigger FOR EACH ROW — precisa do seu próprio gatilho.
DROP TRIGGER IF EXISTS evento_auditoria_sem_truncate ON public.evento_auditoria;
CREATE TRIGGER evento_auditoria_sem_truncate
  BEFORE TRUNCATE ON public.evento_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_alteracao_auditoria();
