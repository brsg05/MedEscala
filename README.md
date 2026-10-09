# MedEscala

Plataforma de intermediação, formalização e rastreabilidade de plantões médicos e de
**repasses entre médicos**.

Projeto da disciplina de Introdução à Engenharia de Sistemas de Informação (IESI) —
CIn/UFPE. Equipe: Aline · Breno · Henrique · Johnny · Nathan · Samuel · Stela.

> O diferencial não é ser mais um quadro de vagas: é transformar o repasse — hoje o elo
> mais informal da cadeia — em operação rastreável, aprovada e contratualizada.

## Documentos

| Documento                                                                          | Papel                                                                                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Entrega 1](guia%20do%20projeto/IESI_Entrega1_Problema_e_Diagnostico_Inicial.docx) | Problema, diagnóstico, funções F01–F25, regras RN01–RN10. **Prevalece em caso de divergência.** |
| [Guia de desenvolvimento](guia%20do%20projeto/DESENVOLVIMENTO-NODE.md)             | Stack, ADRs, modelo de domínio, backlog por sprint                                              |

## Ambiente local

Pré-requisitos: **Node 24** (ver `.nvmrc`), **pnpm 10** e **Docker** em execução.

```bash
pnpm install
pnpm dev:infra                    # supabase start (Postgres 17 + Auth + Studio) + Redis

cp apps/api/.env.example apps/api/.env
pnpm exec supabase status         # copie ANON_KEY e SERVICE_ROLE_KEY para o .env

pnpm db:deploy                    # 1. tabelas   (Prisma — fonte de verdade)
pnpm db:policies                  # 2. RLS, triggers e índices  (SQL manual)
pnpm db:verificar-policies        # 3. confere que o passo 2 sobreviveu ao 1
pnpm db:seed

pnpm dev                          # api em :3000 · web em :5173
```

`pnpm dev:infra:parar` derruba os dois. O Redis só agenda o vencimento dos convites da
fila de substitutos; se ele cair, a fila continua andando a cada leitura, só que não na
hora exata (DEC-097).

> **A ordem dos passos de banco importa.** Uma migration do Prisma pode recriar tabela e
> derrubar as policies ligadas a ela. Por isso `db:policies` é idempotente e sempre roda
> **depois** de `db:deploy` — e `db:verificar-policies` existe para não descobrirmos isso
> tarde demais.

Usuários do seed (senha `medescala123`):

| E-mail                         | Papel            | Para quê                                                                       |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------ |
| `medico@medescala.test`        | Médica           | Ana — tem plantões de demonstração                                             |
| `substituto@medescala.test`    | Médico           | Bruno — disponível nos próximos 14 dias; substituto no repasse de demonstração |
| `naoverificado@medescala.test` | Médica           | CRM ainda não conferido — aparece na fila do operador                          |
| `chefia@medescala.test`        | Chefia de escala | Hospital Escola — aprova repasses, publica vagas, escala médicos               |
| `admin@medescala.test`         | Administração    | Hospital Escola — unidades, setores e chefias                                  |
| `clinica@medescala.test`       | Admin e chefia   | Clínica Nova Esperança, **pendente** de verificação                            |
| `operador@medescala.test`      | Operador         | Confere CRM e CNPJ                                                             |
| `terceiro.e2e@medescala.test`  | Médico           | Clínica Médica, CRM 70003 — para apontar por CRM na fila de convites           |

Os dados de demonstração são **relativos ao dia em que o seed roda**. Rodar `pnpm db:seed`
de novo atualiza as datas.

### Roteiro de demonstração

1. **Chefia monta a escala.** Entre como `chefia@` → Escala → navegue +3 dias →
   **Publicar vaga** → **Escalar direto**. Só o Bruno aparece: ele é o único que declarou
   disponibilidade. Abra a **Trilha** do plantão.
2. **Vaga aberta (F10).** Ainda como `chefia@`, no cartão da vaga: **Convidar** (indique
   ou deixe o matching chamar) ou espere candidaturas. Como `medico@` → **Disponível** →
   _Vagas abertas_: **Candidatar-me** (o filtro "Todas" mostra também as incompatíveis, com
   o motivo). De volta à chefia, **Candidaturas** → **Escolher**.
3. **Médica pede repasse.** Entre como `medico@` → Escala → navegue até um plantão
   confirmado → **Pedir repasse**. Monte a fila: **Adicionar** o Bruno (ofereceu-se para o
   horário) e/ou **apontar por CRM** (`70003`/PE). Os convites saem um por vez, cada um com
   o prazo da instituição (padrão 1h, em **Estrutura**). Sem ninguém na fila, o convite é
   aberto e o matching chama os candidatos. Entre como `substituto@` → **Decisões** →
   aceite ou recuse; em **Repasses**, a titular vê quem tem o convite agora e a fila
   completa.
4. **Chefia decide.** Volte como `chefia@` → **Decisões** → aprove o repasse da UTI Adulto
   (já aceito pelo Bruno). A cadeia de três partes fecha e a escala oficial muda.
5. **Execução (F16).** Como `medico@`, no plantão de hoje: **Fazer check-in** (abre 30 min
   antes do início) e depois **Fazer check-out**. Como `chefia@` → Escala: ontem aparece
   **sem confirmação** (confirme ou conteste); anteontem está cumprido e ainda
   **contestável**. A Ana responde à contestação pela própria Escala, e a chefia decide.
   Os avisos de cada passo chegam pelo **sino** no topo.
6. **Cadastro aberto e verificação.** Na tela de entrada, **Criar conta** → "Represento uma
   instituição". A instituição nasce pendente e não publica vaga. Entre como `operador@` →
   **Verificações** → aprove.

> A suíte e2e usa usuários próprios (`titular.e2e@`, `substituto.e2e@`) e um setor
> próprio, e limpa o que criou ao terminar — não mexe na demonstração.

## Verificação

```bash
pnpm verify        # lint + formato + tipos + testes  (o mesmo que o CI roda)
pnpm test          # camada de schema (Testcontainers)
pnpm test:e2e      # camada de fluxo  (exige supabase start + db:seed)
```

## Estrutura

```
apps/api            NestJS 11 — BFF, única porta de escrita
apps/web            React 19 + Vite + Tailwind 4 + shadcn/ui, mobile-first
packages/contracts  schemas Zod compartilhados api ↔ web
supabase/policies   SQL de RLS, triggers e integridade
```

Nunca commitar `.env`. `.env.example` é a documentação das variáveis exigidas.
