# MedEscala — Documento de Desenvolvimento (TypeScript / Node.js)

> Variante da stack do projeto da disciplina de IESI (CIn/UFPE).
> O escopo, o domínio e as regras de negócio são **idênticos** à versão Java — muda a
> implementação. Onde este documento diverge da Entrega 1, a Entrega 1 prevalece.
>
> **Equipe:** Aline · Breno · Henrique · Johnny · Nathan · Samuel · Stela
> **Última atualização:** setembro/2026

---

## 1. Propósito

Ponto único de verdade sobre **como** construir o sistema em Node.js: escopo do MVP,
decisões técnicas, modelo de domínio, backlog, divisão de trabalho e convenções.
A Entrega 1 responde *o que* e *por quê*; este arquivo responde *como* e *quando*.

Toda decisão técnica relevante vira uma entrada na seção 4 (ADR). Decisão que não está
aqui não foi tomada.

---

## 2. Roadmap da disciplina

| Entrega | Conteúdo | Artefato | Status |
|---|---|---|---|
| 1 | Problema e diagnóstico inicial; funções principais | `.docx` | Concluída |
| 2 | Modelagem de processos (as-is / to-be) | BPMN + relatório | A fazer |
| 3 | Arquitetura de SI e requisitos detalhados | Diagramas C4 + backlog | A fazer |
| 4 | Implementação (MVP funcional) | Código + demo | A fazer |
| 5 | Integração e implantação | Deploy + relatório final | A fazer |

Pendência herdada: **executar as entrevistas semiestruturadas** (Quadro 1 da Entrega 1).

---

## 3. Escopo do MVP

Corte idêntico ao da versão Java. Sete pessoas em um semestre entregam o núcleo que prova
a tese — que o repasse pode ser rastreável, aprovado e formalizado.

### 3.1 Dentro do MVP

| ID | Função | Observação |
|---|---|---|
| F01 | Cadastro e verificação do médico | CRM validado por formato + conferência manual, sem integração com o CFM |
| F02 | Cadastro de dados fiscais e bancários | **Faltava nesta tabela.** É prioridade `E` na Entrega 1 e o Sprint 1 já a citava. Parte fiscal (CNPJ, CNAE, regime, inscrição municipal) no Sprint 1; dados bancários no Sprint 4, quando a cifragem em repouso da RNF07 for de fato necessária |
| F03 | Cadastro da instituição | Sem consulta automática ao CNES |
| F04 | Declarar disponibilidade | Coração do produto |
| F05 | Agenda unificada | Necessária para a RN03 |
| F06 | Publicar vaga de plantão | |
| F07 | Abrir pedido de repasse | Diferencial do projeto |
| F08 / F09 | Matching e ordenação | Consulta SQL determinística, sem ML |
| F10 | Convite, aceite, recusa | Com expiração por prazo |
| F11 | **Aprovação da substituição pela chefia** | Bloqueante — não pode ser cortada |
| F12 | Atualizar escala oficial | Com histórico versionado |
| F13 | Gerar termo contratual | PDF gerado; assinatura eletrônica simulada (aceite + timestamp + hash) |
| F16 | Confirmar execução do plantão | |
| F18 | Avaliação bidirecional | |
| F22 | Notificações | In-app (feito, DEC-121); e-mail quando houver provedor; sem WhatsApp |
| F23 | Controle de acesso e auditoria | Log append-only de eventos de domínio |

### 3.2 Fora do MVP (simulado ou adiado)

- **F14 — NFS-e:** emissor municipal exige certificado A1/A3 e credenciamento. Geramos o
  rascunho com retenções calculadas, marcado como `SIMULADO`.
- **F15 / F17 — garantia e split:** exige instituição de pagamento homologada. Máquina de
  estados financeira (`PENDENTE → RETIDO → LIBERADO`) sobre um gateway fake.
- **F24 — LGPD:** **deixou de ser adiada** (ADR-015). É prioridade `E` na Entrega 1 e
  sustentada por RN10, RNF06 e pela restrição do §4.8 — mantê-la fora contrariava a regra
  de que a Entrega 1 prevalece. Entra em versão mínima: consentimento versionado com
  registro de aceite, finalidade declarada por tipo de dado e política de retenção escrita.
  Fica fora o atendimento automatizado a direitos do titular, que colide com o ADR-007
  (direito de eliminação × trilha append-only) e exige pseudonimização ou *crypto-shredding*.
- **F19, F20, F21, F25:** adiados. **Consequência registrada:** adiar a F19 deixa a
  **RN08 sem teste possível** — o §12 exige um teste de violação para cada RN01–RN10, e a
  RN08 fala em "ocorrência registrada". Também degrada a F09, cuja ordenação usa histórico
  de comparecimento, que é o que as ocorrências produzem. Avaliar um F19 mínimo (entidade
  `Ocorrencia` + contador de reputação) em vez da função inteira.
- **Consulta ao CNES (F03):** cortada junto com a do CFM, mas o corte é mais questionável:
  o DataSUS publica dados abertos de CNES com API, enquanto o CFM não tem API pública. É
  candidata barata a reentrar no escopo.
- **Alíquotas fiscais são alvo móvel.** A Entrega 1 cita a LC 214/2025 (IBS/CBS) e 2026 é
  ano de transição. Modelar as regras como **tabela versionada por vigência**, não como
  constantes no código.

---

## 4. Decisões de arquitetura (ADR)

### ADR-001 — Monolito modular, não microsserviços
Uma aplicação NestJS com módulos por domínio: `credenciamento`, `escala`, `matching`,
`repasse`, `financeiro`, `auditoria`, `notificacao`. Módulos conversam por interfaces de
serviço e eventos internos.
**Por quê:** sete desenvolvedores, um semestre, nenhuma exigência de escala real.
**Consequência:** as fronteiras já estão desenhadas, então a extração futura é possível sem
pagar hoje o custo de rede, observabilidade distribuída e consistência eventual.
*(A variante em microsserviços está documentada em `ARQUITETURA-MICROSERVICOS.md`.)*

### ADR-002 — NestJS em vez de Express/Fastify puro
NestJS traz injeção de dependência, modularização e organização de camadas prontas — o que
importa quando sete pessoas escrevem no mesmo repositório. Express puro exigiria que a
equipe inventasse essas convenções, e convenção inventada em grupo grande diverge rápido.
**Alternativa descartada:** Fastify + estrutura própria — mais leve, mas sem padrão de
projeto compartilhado.

### ADR-003 — Prisma como ORM e fonte do schema
Migrations versionadas (`prisma migrate`), tipos gerados a partir do schema e integração
natural com TypeScript. O schema Prisma é a fonte de verdade do banco.
**Alternativa considerada:** Drizzle (SQL mais explícito, melhor para consultas complexas
como o matching). Se o matching ficar difícil de expressar no Prisma, usar `$queryRaw`
tipado para essa consulta específica em vez de trocar de ORM.

### ADR-004 — PostgreSQL como único armazenamento  *(revisto pelo ADR-027)*
Sem Redis, sem broker externo, sem search engine no MVP. Eventos de domínio em tabela,
publicados por `EventEmitter2` dentro da mesma transação lógica. Rever só com gargalo medido.

### ADR-005 — Validação de entrada com Zod
Todo DTO de entrada é um schema Zod, com o tipo TypeScript inferido do schema. Uma
definição só para validação em runtime e tipo em compile time — sem DTO duplicado.

### ADR-006 — Autenticação JWT + refresh token
Usuário com um ou mais perfis: `MEDICO`, `CHEFIA_ESCALA`, `ADMIN_INSTITUICAO`,
`OPERADOR_PLATAFORMA`. Autorização por `Guard` de perfil + escopo de instituição.

### ADR-007 — Trilha de auditoria append-only
Toda transição de estado de `Plantao`, `Repasse` e `Pagamento` grava em `evento_auditoria`
(ator, ação, estado anterior, estado novo, timestamp, payload JSON). Sem `UPDATE`, sem
`DELETE`. Requisito de negócio (RNF04), não conforto de log.

### ADR-008 — Integrações externas atrás de *ports*
`EmissorFiscal` e `GatewayPagamento` são interfaces com token de injeção. No MVP existe só
a implementação `Simulado`. Trocar por real não deve tocar em regra de negócio.

> As ADRs 009 a 019 foram tomadas na sessão de implementação do Sprint 0 e **revisam
> parcialmente** as ADRs 003, 004 e 006.

### ADR-009 — Supabase como plataforma de dados e autenticação
Postgres gerenciado + GoTrue no lugar de um Postgres avulso e de autenticação escrita à mão.
**Por quê:** tira do caminho o que não é o problema do projeto — hash de senha, confirmação
de e-mail, rotação de refresh — e dá um ambiente igual para as sete máquinas via
`supabase start`.
**Consequência:** revisa o ADR-004 (o armazenamento continua sendo só Postgres, mas
gerenciado) e o ADR-006 (o JWT passa a ser emitido pelo Supabase, não pela api).

### ADR-010 — NestJS como BFF único; o web nunca fala com o Supabase
Toda escrita passa pela api, que usa a `service_role`. O frontend não recebe nem a `anon key`
para acesso a dados.
**Por quê:** a invariante central da RN01 — `medicoExecutanteId` só muda com repasse aprovado
— precisa de transação e de erro de domínio testável. Isso não se expressa em policy SQL.
**Consequência:** o ADR-001 e o ADR-002 seguem íntegros; o Supabase é infraestrutura, não
arquitetura. Se um dia o web falar direto com o banco, esta ADR é a que precisa cair primeiro.

### ADR-011 — Prisma continua fonte de verdade; policies em SQL manual
`prisma migrate` cria as tabelas de domínio; RLS, triggers, GRANTs e índices parciais ficam
em `supabase/policies/*.sql`, idempotentes, aplicados **depois**.
**Por quê:** manter o ADR-003 e os tipos gerados, sem fingir que o Prisma abstrai objetos de
segurança do banco — ele não abstrai.
**Consequência:** existe uma ordem obrigatória (`db:deploy` → `db:policies`) porque uma
migration pode recriar tabela e derrubar o que está ligado a ela. `db:verificar-policies`
roda no CI justamente para essa falha não passar silenciosa.

### ADR-012 — Imutabilidade da trilha por trigger, não por REVOKE
`evento_auditoria` tem trigger `BEFORE UPDATE OR DELETE` e outro `BEFORE TRUNCATE` que
levantam exceção. O REVOKE fica como segunda camada.
**Por quê:** REVOKE sozinho **não funcionaria**. O dono da tabela mantém todos os privilégios
independentemente de REVOKE, e o Prisma conecta como `postgres`, que é o dono. A trilha
pareceria imutável e não seria.
**Consequência:** o ADR-007 deixa de ser promessa de código e vira garantia do Postgres, com
teste que tenta `UPDATE`, `DELETE` e `TRUNCATE` e espera erro do banco (RNF04).

### ADR-013 — Sessão em cookie httpOnly com rotação e anti-CSRF em camadas
Access e refresh em cookies `httpOnly`; refresh restrito ao caminho `/auth`; rotação com
detecção de reuso por família de token. Contra CSRF: validação de `Origin` **mais**
double-submit com um cookie de CSRF legível pelo JS.
**Por quê:** `httpOnly` tira o token do alcance de XSS; a rotação limita a janela de um token
vazado; `SameSite=Lax` (e não `Strict`) porque o convite de plantão chega por e-mail (F22) e
precisa abrir o app com a sessão viva.
**Consequência:** o corpo da resposta de login não carrega token — só identidade e o token de
CSRF. Reusar um refresh já rotacionado revoga a família inteira.

### ADR-014 — Perfis resolvidos por consulta, não por claim no JWT
O `PerfisGuard` consulta `perfil_acesso` a cada requisição, com cache em memória de segundos.
**Por quê:** perfil revogado precisa valer imediatamente. Dentro do token, tirar a chefia de
alguém só teria efeito na expiração — inaceitável numa etapa bloqueante como a F11.
**Consequência:** uma query a mais por requisição protegida. Rever só com gargalo medido,
como manda o ADR-004.

### ADR-015 — F24 (LGPD) em versão mínima dentro do MVP
Ver §3.2. A Entrega 1 prevalece, e lá a F24 é essencial.

### ADR-016 — Módulo `auth` próprio
O §6 listava os módulos de domínio mas não `auth`, embora o §9 exponha `/auth/login` e
`/auth/refresh`. Agora existe `modules/auth`.
**Por quê:** `credenciamento` cuida de **quem** a pessoa é (CRM, documentos, dados fiscais);
`auth` cuida de **como** ela prova isso. São ciclos de vida diferentes.

### ADR-017 — Testes em duas camadas
Postgres puro em Testcontainers para garantias de schema; stack local do Supabase para o
fluxo com Auth real.
**Por quê:** Testcontainers não tem GoTrue, então não cobre login; a stack do Supabase é
lenta e compartilhada demais para testar constraint de banco.
**Consequência:** `pnpm test` (schema) e `pnpm test:e2e` (fluxo) são alvos distintos, e o CI
roda os dois em jobs separados.

### ADR-018 — Dinheiro em centavos inteiros; data e hora em UTC
No wire, dinheiro é inteiro de centavos com tipo *branded*; data é ISO 8601 com `Z`, e a
conversão para `America/Recife` acontece só na apresentação.
**Por quê:** ponto flutuante em base de cálculo de tributo (IRRF 1,5%, PIS/COFINS/CSLL 4,65%)
erra em silêncio. E a RN03 compara horários de plantão que cruzam a meia-noite, com médicos
que podem ter vínculo em mais de um município.
**Consequência:** os conversores moram em `packages/contracts`, porque api e web precisam
chegar ao mesmo número.

### ADR-020 — Máquina de estados do `Plantao`, com `CONTESTADO` resolvível
O §7.3 desenha o diagrama do plantão mas, ao contrário do repasse, não fornece a tabela de
transições. Ela agora existe em `modules/escala/domain/plantao.state.ts`.
**Por quê `CONTESTADO` ganhou saída:** no diagrama original ele era um beco sem saída, o que
conflita com a RN04 — um plantão travado nunca liquida nem cancela, e a regra exige documento
fiscal para todo valor liquidado. `CONTESTADO → EXECUTADO` (contestação improcedente) ou
`CONTESTADO → CANCELADO` (procedente), decidido pela instituição, que é quem tem o contrato.
**Revisão (F16, DEC-149):** `CONFIRMADO → EXECUTADO` e `CONFIRMADO → CONTESTADO`, só depois do
fim do plantão — o caso do plantão que termina sem check-in (DEC-131), em que a instituição
confirma ou contesta. O check-out leva `EM_EXECUCAO → EXECUTADO`, contestável até
`contestavelAte` (DEC-148).

### ADR-021 — Escala versionada por contador, com a trilha como histórico
`Escala.versao` incrementa a cada alteração; o histórico completo que a F12 pede é a própria
`evento_auditoria`, que já grava estado anterior e novo e já é append-only por trigger.
**Por quê:** uma tabela de snapshots seria um segundo histórico a manter em sincronia com o
primeiro, e histórico duplicado diverge.

### ADR-022 — Prazos configuráveis por instituição
`Instituicao.antecedenciaMinimaRepasseHoras` (padrão 24) e `validadeConviteHoras` (padrão 12).
**Por quê:** o §8 exige "prazo > mínimo" sem dizer qual, e a RN08 fala em "prazo definido pela
instituição" — constante no código contrariaria a regra.

### ADR-023 — RN01 e RN03 garantidas pelo banco, não pelo código
O §12 exige, para cada regra, um teste que tente violá-la e espere falha. Um teste desses só
vale se a violação for impossível por qualquer caminho — inclusive por um `UPDATE` direto que
ninguém escreveu ainda.
- **RN01:** trigger `plantao_rn01_executante` recusa alterar `medico_executante_id` sem um
  repasse `APROVADO` para aquele substituto. A primeira atribuição (de `NULL`) é livre.
- **RN03, sobreposição:** exclusion constraint com `tstzrange` e `btree_gist`. Verificação em
  TypeScript perderia a corrida entre dois aceites simultâneos; a constraint resolve no nível
  em que a corrida acontece.
- **RN03, 24h contíguas:** continua na aplicação, como **alerta**. Bloquear seria definir
  jornada, o que a RN09 proíbe.
**Consequência:** os serviços ainda verificam antes, mas só para dar mensagem de domínio — a
garantia não depende deles.

### ADR-024 — Migrations por `migrate diff`, não `migrate dev`
`pnpm db:nova-migration -- nome_da_migration`.
**Por quê:** a FK de `public.usuario` para `auth.users` (ADR-011) faz o `migrate dev` abortar
com P4002 ao introspetar o banco, pedindo que `auth` entre nos `schemas` do datasource — o que
faria o Prisma achar que gerencia o schema do Auth do Supabase. O `migrate diff` reproduz as
migrations num shadow database limpo, onde essa FK não existe, e gera o mesmo SQL.
**Consequência:** ninguém na equipe deve rodar `prisma migrate dev`. O script cuida do shadow,
do carimbo de tempo e de detectar diff vazio.

### ADR-025 — Cadastro aberto provisório, com verificação pelo operador
Qualquer pessoa cria conta (DEC-059), com duas travas: o médico nasce **não verificado** e
não entra em escala até o operador conferir o CRM (RN02); a instituição nasce **pendente** e
não publica vaga nem enxerga médicos até o operador confirmar o CNPJ (DEC-063). Quem cria a
instituição recebe ADMIN e CHEFIA (DEC-064).
**Por quê:** destrava o ciclo sem depender do seed, enquanto o modelo definitivo — multi-tenant,
com o operador incluindo a instituição — não é desenhado.
**Consequência:** a chefia só encontra médicos que **declararam disponibilidade** para o horário
(DEC-062). Com cadastro aberto, listar médicos livremente deixaria uma instituição falsa colher
nome e CRM da plataforma inteira. Esta ADR é provisória e deve ser substituída pela de tenants.

### ADR-026 — Leitura restrita a quem participa; recurso alheio responde 404
Plantão, repasse e trilha só são lidos pelos médicos envolvidos e por admin ou chefia da
instituição (DEC-068). Um id alheio responde **404, não 403**.
**Por quê:** as três rotas estavam abertas a qualquer usuário logado — inofensivo enquanto todo
usuário vinha do seed, vazamento de nome e CRM com o cadastro aberto. E 403 confirmaria a quem
sonda ids que o recurso existe.

### ADR-027 — Redis + BullMQ para jobs agendados (revisa o ADR-004)
O vencimento dos convites da fila de substitutos (DEC-089, DEC-090) é agendado em **BullMQ**
sobre **Redis**.
**Por quê:** escolha do Breno, após comparar com avaliação sob demanda, `pg_cron` e `pg-boss`.
Fila de jobs com Redis é o padrão de mercado e deixa pronto o gancho para notificar o próximo
da fila (F22).
**Consequência:** o ADR-004 deixa de valer como "PostgreSQL como único armazenamento". O Redis
passa a ser necessário na máquina dos 7, no CI e no deploy (Entrega 5). O risco que o ADR-004
evitava — escrita dupla entre dois armazenamentos — é tratado na DEC-097.

### ADR-019 — Node 24 LTS e PostgreSQL 17
Substitui o "Node 22 LTS" e o "PostgreSQL 16" do §5.
**Por quê:** o Node 22.19 da máquina de desenvolvimento bloqueou `@nestjs/schematics@12` e
`testcontainers@12`, ambos exigindo 22.22+; a linha 24 é a LTS atual e resolve de vez. O PG
17 é o que a stack local do Supabase entrega por padrão.
**Consequência:** `.nvmrc` fixa `24.19.0` e `engines.node` exige `>=24`. Quem estiver em Node
22 não consegue nem rodar `pnpm install` — falha cedo e com mensagem clara, que é o objetivo.

---

## 5. Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Runtime | Node.js 24 LTS | ADR-019 — `.nvmrc` fixa 24.19.0 |
| Linguagem | TypeScript 5.x em `strict: true` | `strict` desligado anula metade do motivo de usar TS |
| Framework | NestJS 11 | ADR-002 |
| ORM | Prisma 6 | ADR-003, ADR-011 |
| Autenticação | Supabase Auth (GoTrue) | ADR-009; sessão em cookie httpOnly pela api (ADR-013) |
| Banco | PostgreSQL 17, via Supabase | ADR-009, ADR-019 |
| Validação | Zod | ADR-005 |
| Testes | Vitest + Supertest + Testcontainers | Duas camadas — ADR-017 |
| Lint/format | ESLint + Prettier | |
| Gerenciador | pnpm | Instalação rápida e lockfile determinístico |
| PDF | `pdfkit` ou `puppeteer` (HTML → PDF) | `puppeteer` se o layout do contrato exigir |
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui | Mesmo idioma da equipe inteira; **mobile-first** por causa da RNF03 |
| Infra local | Supabase CLI (`supabase start`) | ADR-009 — **não há `docker-compose.yml`**; exige Docker em execução |
| CI | GitHub Actions (lint + typecheck + testes por PR) | |
| Deploy | Container em PaaS gratuito | Decidir na Entrega 5 |

> **Vantagem real desta stack para este grupo:** frontend e backend em TypeScript permitem
> compartilhar os tipos de contrato da API, o que elimina uma classe inteira de bug de
> integração entre as frentes. É o principal argumento a favor de Node aqui.

---

## 6. Estrutura do repositório

```
MedEscala/                      # raiz do repositório (D10)
├─ apps/
│  ├─ api/                      # NestJS
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/            # login, refresh, guards de perfil       ADR-016
│  │  │  │  ├─ credenciamento/  # médicos, instituições, documentos      F01–F03
│  │  │  │  ├─ escala/          # unidades, setores, escalas, plantões   F05, F06, F12
│  │  │  │  ├─ matching/        # disponibilidade, busca, ordenação      F04, F08, F09
│  │  │  │  ├─ repasse/         # pedido, aceite, aprovação              F07, F10, F11
│  │  │  │  ├─ financeiro/      # contrato, rascunho fiscal, pagamento   F13–F17
│  │  │  │  ├─ avaliacao/       #                                        F18
│  │  │  │  ├─ auditoria/       #                                        F23
│  │  │  │  ├─ operador/        # conferência de CRM e CNPJ              ADR-025
│  │  │  │  └─ notificacao/     #                                        F22
│  │  │  ├─ shared/             # guards, filters, erros de domínio
│  │  │  └─ main.ts
│  │  ├─ prisma/                # schema, migrations, seed, scripts de policy
│  │  └─ test/
│  │     ├─ schema/             # Testcontainers — garantias do banco
│  │     └─ e2e/                # Supabase local — fluxo com Auth real
│  └─ web/                      # React + Vite
├─ packages/
│  └─ contracts/                # schemas Zod + tipos compartilhados api ↔ web
├─ supabase/
│  ├─ config.toml
│  └─ policies/                 # SQL manual: RLS, triggers, índices  (ADR-011)
├─ .github/workflows/ci.yml
└─ pnpm-workspace.yaml
```

Cada módulo expõe um **service** público e mantém repositório e entidades privados. Módulo
não importa repositório de outro módulo — se precisar, importa o service.

---

## 7. Modelo de domínio

### 7.1 Entidades

```
Usuario ────< PerfilAcesso >──── Instituicao
   │
   ├──1:1── Medico ──< DocumentoProfissional
   │            ├──< JanelaDisponibilidade
   │            └──< Avaliacao (recebidas / emitidas)
   │
Instituicao ──< Unidade ──< Setor ──< Escala ──< Plantao
                                                   │
                                                   ├──1:1── ContratoPlantao
                                                   ├──0:1── Repasse
                                                   ├──0:1── Pagamento
                                                   └──< EventoAuditoria
Plantao ──< Candidatura >── Medico
```

### 7.2 Recorte do schema Prisma

```prisma
enum StatusPlantao {
  ABERTO
  EM_SELECAO
  CONFIRMADO
  EM_REPASSE
  EM_EXECUCAO
  EXECUTADO
  LIQUIDADO
  CONTESTADO
  CANCELADO
}

enum StatusRepasse {
  SOLICITADO
  SUBSTITUTO_ACEITO
  AGUARDANDO_APROVACAO
  APROVADO
  RECUSADO_SUBSTITUTO
  RECUSADO_INSTITUICAO
  CANCELADO
}

enum ModeloFiscal {
  A_RECONTRATACAO   // padrão — substituto contrata direto com a instituição
  B_SUBCONTRATACAO  // só se a instituição habilitar
}

model Plantao {
  id                    String        @id @default(uuid())
  setorId               String
  inicio                DateTime
  fim                   DateTime
  valor                 Decimal       @db.Decimal(10, 2)
  especialidadeExigida  String
  requisitos            String[]
  modeloContratacao     String        // PJ | RPA
  medicoTitularId       String?
  medicoExecutanteId    String?
  status                StatusPlantao @default(ABERTO)
  repasse               Repasse?
  candidaturas          Candidatura[]
  @@index([inicio, status])
}

model Repasse {
  id                    String        @id @default(uuid())
  plantaoId             String        @unique
  medicoTitularId       String
  medicoSubstitutoId    String?
  motivo                String
  modeloFiscal          ModeloFiscal  @default(A_RECONTRATACAO)
  status                StatusRepasse @default(SOLICITADO)
  aprovadoPorId         String?
  aprovadoEm            DateTime?
  justificativaRecusa   String?
  plantao               Plantao       @relation(fields: [plantaoId], references: [id])
}
```

> `modeloFiscal` referencia o Quadro 3 da Entrega 1. O padrão é `A_RECONTRATACAO`. Os
> modelos C e D do quadro não existem como valor possível — informalidade não é estado
> representável no sistema.

### 7.3 Máquinas de estado

```
Plantao:
ABERTO → EM_SELECAO → CONFIRMADO → EM_EXECUCAO → EXECUTADO → LIQUIDADO
                          │                          │
                          ├→ EM_REPASSE → CONFIRMADO └→ CONTESTADO
                          └→ CANCELADO

Repasse:
SOLICITADO → SUBSTITUTO_ACEITO → AGUARDANDO_APROVACAO → APROVADO
     │              │                      │
     └→ CANCELADO   └→ RECUSADO_SUBSTITUTO └→ RECUSADO_INSTITUICAO
```

**Invariante central:** `Plantao.medicoExecutanteId` só muda quando existe um `Repasse` em
`APROVADO`. Nenhum outro caminho de código altera esse campo — tudo passa por
`RepasseService.aprovar()`, dentro de uma transação. É a tradução da RN01 e da restrição
ética da seção 5.1 da Entrega 1, e tem teste dedicado.

Implementar as transições como função pura testável fora do Nest:

```ts
// modules/repasse/domain/repasse.state.ts
const TRANSICOES: Record<StatusRepasse, StatusRepasse[]> = {
  SOLICITADO:           ['SUBSTITUTO_ACEITO', 'CANCELADO'],
  SUBSTITUTO_ACEITO:    ['AGUARDANDO_APROVACAO', 'RECUSADO_SUBSTITUTO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'RECUSADO_INSTITUICAO'],
  APROVADO:             [],
  RECUSADO_SUBSTITUTO:  ['SOLICITADO'],
  RECUSADO_INSTITUICAO: ['SOLICITADO'],
  CANCELADO:            [],
};

export function podeTransicionar(de: StatusRepasse, para: StatusRepasse): boolean {
  return TRANSICOES[de].includes(para);
}
```

---

## 8. Fluxo principal — repasse aprovado

```mermaid
sequenceDiagram
    participant T as Médico titular
    participant S as Sistema
    participant M as Médicos compatíveis
    participant C as Chefia de escala

    T->>S: Solicita repasse (plantão, motivo, prazo)
    S->>S: Valida: plantão CONFIRMADO, titular é executante, prazo > mínimo
    S->>S: Matching — disponibilidade × requisitos × sem conflito de agenda
    S->>M: Notifica candidatos ordenados por reputação e aderência
    M->>S: Aceite do substituto
    S->>C: Solicita aprovação (bloqueante)
    alt Aprovado
        C->>S: Aprova
        S->>S: Transação — troca executante, versiona escala, gera contrato
        S->>S: Gera rascunho fiscal conforme modeloFiscal
        S-->>T: Notifica liberação de responsabilidade
        S-->>M: Notifica confirmação
    else Recusado
        C->>S: Recusa com justificativa
        S->>S: Repasse volta a SOLICITADO; titular segue responsável
    end
```

---

## 9. API do MVP

```
POST   /auth/login
POST   /auth/refresh

POST   /medicos                          F01
GET    /medicos/me
POST   /medicos/me/documentos
POST   /medicos/me/disponibilidades      F04
GET    /medicos/me/agenda                F05

POST   /instituicoes                     F03
POST   /instituicoes/:id/unidades

POST   /plantoes                         F06
GET    /plantoes?filtros                 F08
POST   /plantoes/:id/candidaturas        F10
POST   /candidaturas/:id/aceitar
POST   /candidaturas/:id/recusar

POST   /plantoes/:id/repasses            F07  (motivo + fila de até 5 indicados — DEC-089)
GET    /plantoes/:id/substitutos         (titular: quem se ofereceu para o horário — DEC-062)
GET    /medicos/busca?crm=&uf=           (apontamento por CRM + UF exato — DEC-091)
GET    /repasses/:id
GET    /repasses/:id/fila                (titular e instituição — DEC-108)
POST   /repasses/:id/indicar             (titular reforça a fila — DEC-113)
POST   /repasses/:id/cancelar            (titular, só em SOLICITADO)
POST   /repasses/:id/aceitar             (só o convidado da vez — DEC-105)
POST   /repasses/:id/recusar-convite     (convidado da vez; passa a vez)
POST   /repasses/:id/aprovar             (chefia — bloqueante)   F11
POST   /repasses/:id/recusar             (chefia, com justificativa; a fila retoma — DEC-099)
PATCH  /instituicoes/:id/configuracao    (admin: prazos do convite e da contestação — DEC-090, DEC-132)

POST   /plantoes/:id/execucao/inicio     F16  (check-in, 30 min antes — DEC-133)
POST   /plantoes/:id/execucao/fim             (check-out; abre o prazo de contestação)
POST   /plantoes/:id/execucao/confirmar       (chefia: sem confirmação → cumprido — DEC-131)
POST   /plantoes/:id/contestacao              (chefia, com justificativa)
POST   /plantoes/:id/contestacao/resposta     (executante, uma vez)
POST   /plantoes/:id/contestacao/resolucao    (chefia: IMPROCEDENTE ou PROCEDENTE — ADR-020)
POST   /plantoes/:id/avaliacoes          F18

GET    /plantoes/:id/termos              F13  (contrato e termo de substituição, com assinaturas)
GET    /termos/:id/pdf                        (PDF gerado do retrato congelado — DEC-187)
GET    /plantoes/:id/documento-fiscal    F14  (rascunho SIMULADO)
GET    /plantoes/:id/auditoria           F23

GET    /vagas?todas=                     F10  (compatíveis por padrão — DEC-166)
POST   /plantoes/:id/candidaturas             (médico se candidata)
POST   /candidaturas/:id/retirar
POST   /plantoes/:id/convite/aceitar          (convidado da vez da vaga; confirma direto)
POST   /plantoes/:id/convite/recusar
POST   /plantoes/:id/convites                 (instituição convida pela fila — DEC-164)
GET    /plantoes/:id/convites
POST   /plantoes/:id/convites/encerrar
GET    /plantoes/:id/candidaturas
POST   /candidaturas/:id/aceitar              (instituição escolhe; escala o médico)
POST   /candidaturas/:id/recusar
POST   /plantoes/:id/atribuir                 (escala direta — DEC-052; fecha fila e candidaturas)

GET    /notificacoes                     F22  (30 mais recentes + não lidas; polling — DEC-127)
POST   /notificacoes/:id/lida
POST   /notificacoes/lidas
```

Os schemas Zod de request e response ficam em `packages/contracts` e são importados pelo
`web` — o frontend não redigita nenhum tipo de API.

O matching (F09) não tem rota própria: quando a fila de indicados acaba, a própria fila
chama os 5 primeiros do ranking provisório (DEC-093, DEC-094), em lotes, até acabarem os
candidatos (DEC-096).

---

## 10. Backlog por sprint

Sprints de duas semanas. Todo item tem critério de aceite **verificável por teste**.

### Sprint 0 — Fundação  ✅ concluído
- [x] Monorepo pnpm, Supabase CLI, CI com lint + formato + typecheck + testes
  → *verificado:* `pnpm verify` é o mesmo comando local e de CI; erro de tipo ou teste
    quebrado falha o job `qualidade`
- [x] Prisma configurado, primeira migration, testes em duas camadas (ADR-017)
  → *verificado:* `pnpm test` sobe Postgres 17 em Testcontainers e prova a RNF04 —
    `UPDATE`, `DELETE` e `TRUNCATE` na trilha são recusados **pelo banco**
- [x] Auth com guards de perfil (ADR-013, ADR-014)
  → *verificado:* 15 testes e2e cobrem 401 sem cookie, 403 com perfil errado, recusa de
    CSRF (ausente, divergente e origem estranha) e rotação de refresh com detecção de reuso
- [x] Tela de login em React consumindo os schemas de `packages/contracts`
  → *verificado:* alterar o schema quebra o typecheck do `web` — é a tese da stack em ação

> Dívida deixada para o Sprint 1: nenhuma regra RN01–RN10 tem teste ainda, porque o Sprint 0
> não entrega função de negócio. O que existe é a RNF04, testada. A rota `_teste/chefia`
> usada nos e2e vive só na pasta de teste e deve ser substituída pela primeira rota real
> com `@Perfis`.

### Sprint 1 — Identidade e disponibilidade  ✅ parcial
- [x] Cadastro de médico e dados fiscais (F01, F02 — parte fiscal)
  → *verificado:* CRM fora de formato é rejeitado pelo schema Zod; médico não verificado
    não entra na escala (`MEDICO_NAO_VERIFICADO`, RN02)
- [x] Unidades e setores (F03). A instituição se cadastra (cadastro aberto, DEC-059) e é
  conferida pelo operador (DEC-063)
- [x] Janelas de disponibilidade (F04) e agenda unificada (F05)
  → *verificado:* teste que escala o mesmo médico em horários sobrepostos recebe
    `SOBREPOSICAO_DE_AGENDA` (RN03); e um segundo teste confirma que turnos que apenas
    **encostam** são aceitos — a passagem de plantão é instantânea
- [ ] Documentos comprobatórios e dados bancários — Sprint 4 (RNF07)

### Sprint 2 — Vagas e matching  ✅ concluído (matching no formato do MVP)
- [x] Publicação de vaga (F06)
- [x] Matching e ordenação (F08, F09) — critérios em sequência, sem pesos (DEC-136):
  vínculo, plantões cumpridos, taxa de resposta, nome e id
  → *verificado:* rotações da mesma massa produzem a mesma ordem (teste de unidade); só
    entra quem declarou disponibilidade, está verificado, tem a especialidade e agenda livre
    (DEC-062); e2e mostra quem deixou convite vencer descendo, mesmo antes no alfabeto
- [x] Convite pela fila e candidatura, aceite, recusa, expiração (F10, DEC-135, DEC-164)
  → *verificado:* convite não respondido no prazo passa ao próximo; fila esgotada devolve a
    vaga a ABERTO; preencher por um caminho fecha a fila e as candidaturas na mesma transação
- [ ] Raio geográfico e proximidade — adiados (DEC-137)

### Sprint 3 — Repasse (núcleo do projeto)  ✅ concluído
- [x] Pedido de repasse (F07), com antecedência mínima configurável (ADR-022)
- [x] Aprovação da chefia (F11) e versionamento da escala (F12)
  → *verificado:* **o `UPDATE` direto no banco que tenta trocar o executante sem repasse
    aprovado é recusado pelo trigger da RN01** — não pelo código da aplicação
  → *verificado:* a recusa mantém `medicoExecutanteId` no titular e devolve o plantão a
    `CONFIRMADO`; a recusa sem justificativa é rejeitada
  → *verificado:* médico não consegue aprovar o próprio repasse (403 por perfil)
- [x] Trilha de auditoria de todas as transições (F23)
  → *verificado:* após um repasse completo, a consulta devolve exatamente
    `VAGA_PUBLICADA → MEDICO_ESCALADO → REPASSE_SOLICITADO → PLANTAO_EM_REPASSE →
    REPASSE_ACEITO_PELO_SUBSTITUTO → REPASSE_ENVIADO_PARA_APROVACAO → REPASSE_APROVADO →
    EXECUTANTE_SUBSTITUIDO`. A ordenação é por sequência (`id`), não por timestamp: eventos
    da mesma transação compartilham o carimbo de tempo e ele não desempataria

### Sprint 4 — Formalização e fechamento
- [x] Contrato em PDF (F13) — contrato do plantão e termo de substituição (DEC-184 a DEC-187)
  → *verificado:* o hash recalculado do conteúdo guardado confere; o banco recusa alterar o
    termo; na escala direta o check-in completa a assinatura; quem não participa recebe 404
- [ ] Rascunho fiscal com retenções (F14, simulado)
  → *verificar:* IRRF 1,5% e demais retenções conferem com cálculo manual
- [x] Confirmação de execução (F16) — check-in, check-out, contestação (DEC-130 a DEC-134)
  → *verificado:* a janela de check-in abre 30 min antes; check-out abre prazo de 72h;
    plantão sem confirmação é decidido pela instituição; EM_EXECUCAO sem check-in é recusado
    pelo banco
- [ ] Avaliação bidirecional (F18) — **adiada**: não há consenso (DEC-123)
- [ ] Máquina de estados financeira com gateway fake (F15, F17)

### Sprint 5 — Integração, demo e relatório
- [ ] Deploy em ambiente público
- [ ] Roteiro de demonstração ponta a ponta
- [ ] Relatório de implantação e registro de IA consolidado

---

## 11. Divisão de trabalho

| Frente | Pessoas | Escopo |
|---|---|---|
| Backend — domínio e escala | 2 | Entidades, máquinas de estado, repasse, auditoria |
| Backend — matching e financeiro | 1–2 | Matching, contrato, rascunho fiscal, gateway fake |
| Frontend | 2 | Telas do médico e da instituição |
| Produto e documentação | 1 | BPMN, entrevistas, relatórios, registro de IA |

Com a stack unificada em TypeScript, quem está no frontend consegue revisar PR de backend.
Aproveitar isso na revisão cruzada. E rodar a frente de documentação entre os integrantes a
cada entrega — ninguém fica só nela.

---

## 12. Convenções

**Branches:** `main` protegida · `feat/<escopo>` · `fix/<escopo>`
**Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`), em **inglês**, com mensagem de até 2 linhas (DEC-117)
**PR:** um revisor no mínimo; CI verde; descrição indica qual função (F__) ou regra (RN__)
o PR atende.

**TypeScript:**
- `strict: true`, sem exceção. `any` só com comentário justificando.
- Tipo de domínio não sai do módulo; o que atravessa fronteira é schema de `contracts`.
- Erro de domínio é classe própria (`RepasseNaoAprovadoError`), traduzida para HTTP por um
  `ExceptionFilter` — regra de negócio não conhece código de status.

**Testes:**
- Regra de negócio nova sem teste não entra.
- Toda regra `RN01`–`RN10` da Entrega 1 tem ao menos um teste que **tenta violá-la** e
  espera falha. É o critério objetivo de "o sistema respeita o diagnóstico".
- Transição de estado testada como função pura; fluxo completo testado em e2e.

**Nomes:** domínio em português (`Plantao`, `Repasse`, `Escala`), infraestrutura em inglês.

---

## 13. Ambiente local

```bash
git clone https://github.com/brsg05/MedEscala.git && cd MedEscala
pnpm install
pnpm dev:infra                     # supabase start (Postgres 17 + Auth) + Redis (compose)

cp apps/api/.env.example apps/api/.env
pnpm exec supabase status          # copie ANON_KEY e SERVICE_ROLE_KEY para o .env

pnpm db:deploy                     # 1. tabelas    (Prisma)
pnpm db:policies                   # 2. RLS/triggers (SQL manual) — NESTA ORDEM
pnpm db:verificar-policies         # 3. confere que o passo 2 sobreviveu ao 1
pnpm db:seed

pnpm dev                           # api :3000 · web :5173
pnpm verify                        # lint + formato + tipos + testes
pnpm test:e2e                      # fluxo com Auth real
```

Variáveis em `.env.example`. Nunca commitar `.env`.

---

## 14. Riscos técnicos

| Risco | Impacto | Mitigação |
|---|---|---|
| Escopo inflar e o MVP não fechar | Alto | Seção 3 é contrato; item novo só entra tirando outro |
| Matching virar projeto de pesquisa | Médio | SQL determinístico; ML fora, sem exceção |
| Integração fiscal consumir o semestre | Alto | Simulada por ADR-008 |
| Consulta de matching ficar ilegível no Prisma | Médio | `$queryRaw` tipado só nessa consulta, com teste de regressão |
| `any` se espalhando sob pressão de prazo | Médio | Regra de lint que falha o build em `any` implícito |
| Entrevistas não acontecerem | Alto | Marcar na primeira semana; duas por integrante |
| Concentração de conhecimento | Médio | Revisão cruzada obrigatória entre frentes |

---

## 15. Definition of Done

1. Teste automatizado do caminho feliz **e** da violação da regra associada.
2. CI verde (lint, typecheck, testes).
3. Revisado por alguém de outra frente.
4. Refletido neste documento, se mudou alguma decisão.
5. No roteiro de demonstração, se for função visível ao usuário.

---

## 16. Registro de uso de IA

A disciplina exige, em cada entrega, o registro dos assistentes usados e dos pontos fortes
e fracos observados. Preencher continuamente.

| Data | Integrante | Assistente | Atividade | Ponto forte observado | Ponto fraco observado |
|---|---|---|---|---|---|
| set/2026 | — | Claude (Anthropic) | Pesquisa do domínio, enquadramento fiscal, estrutura da Entrega 1 | Rapidez em mapear domínio desconhecido; apontou falha ética na concepção inicial do repasse | Exigiu conferência de normas em fonte primária; tendência a ampliar escopo |
| set/2026 | Breno | Claude Code (Anthropic) | Implementação do Sprint 0: monorepo, Supabase, schema Prisma, auth, testes, CI; e as ADRs 009–019 | Cruzou a Entrega 1 com este guia e achou conflitos que nenhum de nós tinha visto — F02 ausente do §3.1, F24 adiada apesar de essencial, e a dependência da RN08 em relação à F19. Também corrigiu uma premissa errada nossa: `REVOKE` não tornaria a trilha imutável, porque o dono da tabela mantém privilégios | Propôs decisões estruturais (Supabase, ORM, versão de Node) que precisaram ser questionadas uma a uma antes de virar código; e a primeira tentativa de atualizar o Node instalou a major errada por seguir um alias de instalador em vez de verificar a versão |
| | | | | | |

Regra da equipe: **nenhuma norma, número ou decisão judicial entra em entrega sem
verificação na fonte primária.**
