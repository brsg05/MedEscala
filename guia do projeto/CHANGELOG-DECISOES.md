# MedEscala — Changelog de decisões

Registro cronológico de **toda** decisão tomada no projeto: técnica e não técnica, de
arquitetura, estrutura, regra de negócio, interface e processo.

**Regra:** toda decisão nova entra aqui no mesmo trabalho em que é tomada — inclusive as
pequenas. Uma decisão que não está aqui não foi tomada. Quando a decisão tem
justificativa longa, ela vira ADR no [guia de desenvolvimento](DESENVOLVIMENTO-NODE.md)
e esta entrada aponta para a ADR.

**Origem**, em cada entrada:

- **Breno** — escolha feita pelo Breno entre opções apresentadas, ou por iniciativa dele.
- **Breno, sobre recomendação** — o Breno aceitou a opção que o Claude recomendou.
- **Claude** — decisão tomada pelo Claude sem perguntar, por ser pequena, reversível ou
  imposta por um problema técnico. Estas são as que mais merecem revisão.

**Situação:** `vigente`, `revista` (substituída por decisão posterior, indicada) ou
`provisória` (vale até uma condição declarada).

---

## Em aberto

Decisões que ainda **não** foram tomadas e bloqueiam alguma parte do produto.

| Tema | O que falta decidir | Bloqueia |
|---|---|---|
| Ordenação do matching (F09) | Pesos, reputação e distância. No MVP vale a ordenação em sequência da DEC-136 | Matching com reputação e distância |
| Geolocalização (F04/F09) | PostGIS ou lat/long com haversine. **Adiada** (DEC-137) | "Raio geográfico" e "proximidade" |
| Especialidade | Hoje é texto livre comparado por igualdade exata; deveria ser lista fechada? | Robustez da RN02 |
| Limite de carga horária (F08) | Regra além das 24h contíguas da RN03 | Filtro do matching |
| `StatusPagamento` | Não existe no schema; só citado em prosa (§3.2) | Sprint 4 |
| Escala da avaliação (F18) | Nota, critérios, quando fica visível. **Adiada**: não há consenso sobre a avaliação de mão dupla (DEC-123) | F18 |
| Retenção de dados (F24) | Prazos concretos | F24 mínima |
| PaaS de deploy | Provavelmente **Vercel**, sem confirmação (DEC-125) | Entrega 5 |
| Provedor de e-mail (F22) | A F22 começa só in-app (DEC-121) | Notificação por e-mail |
| Forma dos mocks de integração | Como os serviços externos da DEC-122 ficam simulados (porta + adaptador falso, ou outra) | Primeira integração simulada |
| Multi-tenant | Modelo de tenants que vai substituir o cadastro aberto (ver DEC-059) | Cadastro definitivo |

---

## 2026-09-12 — Planejamento do Sprint 0

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-001 | Escopo da primeira execução: **Sprint 0 — fundação** (monorepo, ambiente, CI, schema inicial, auth) | Breno | Terreno comum antes de 7 pessoas escreverem código | — |
| DEC-002 | Ignorar a variante Java; o guia Node é a referência de stack | Breno | — | — |
| DEC-003 | A **Entrega 1** é fonte de verdade; prevalece sobre o guia Node em divergência | Breno | O próprio guia diz isso; o .docx foi adicionado ao repositório | — |
| DEC-004 | **Supabase** para autenticação e dados | Breno | Tira do caminho senha, confirmação e rotação de refresh | ADR-009 |
| DEC-005 | **NestJS como BFF único**: toda escrita passa pela api; o web nunca fala com o Supabase | Breno, sobre recomendação | A invariante da RN01 exige transação e erro de domínio testável | ADR-010 |
| DEC-006 | **Prisma continua fonte de verdade** das tabelas; RLS, triggers e índices parciais em SQL manual aplicado depois | Breno, sobre recomendação | Mantém o ADR-003 sem fingir que o Prisma abstrai objetos de segurança | ADR-011 |
| DEC-007 | **RLS ligada** em todas as tabelas + imutabilidade da trilha de auditoria no banco | Breno, sobre recomendação | Defesa em profundidade; ADR-007 vira garantia do Postgres | ADR-012 |
| DEC-008 | Ambiente local = **`supabase start`**; Supabase Cloud só para a demo | Breno, sobre recomendação | Determinístico, offline, sem cota | — |
| DEC-009 | Banco **PostgreSQL 17** em container (o guia dizia 16) | Breno | — | ADR-019 |
| DEC-010 | Primeira migration com o **mínimo de auth** (usuário, perfil, instituição, refresh) | Breno, sobre recomendação | Sprint 1 traz as próprias tabelas; evita retrabalho | — |
| DEC-011 | `apps/web` entra já no Sprint 0, com **login real** consumindo `contracts` | Breno, sobre recomendação | Prova a tese da stack: tipos compartilhados api ↔ web | — |
| DEC-012 | Sessão em **cookie httpOnly com rotação** | Breno | Token fora do alcance de XSS | ADR-013 |
| DEC-013 | Anti-CSRF em camadas: `SameSite=Lax` + double-submit + validação de `Origin` | Breno, sobre recomendação | `Lax` e não `Strict` porque o convite chega por e-mail (F22) | ADR-013 |
| DEC-014 | **Módulo `auth` próprio**, separado de `credenciamento` | Claude | O §6 não listava `auth` embora o §9 tenha `/auth/*`; credencial de acesso ≠ credencial profissional | ADR-016 |
| DEC-015 | Perfis resolvidos por **consulta a cada requisição**, com cache curto — não por claim no JWT | Breno, sobre recomendação | Perfil revogado precisa valer na hora | ADR-014 |
| DEC-016 | Testes em **duas camadas**: Testcontainers para schema; Supabase local para fluxo com Auth | Breno | Testcontainers não tem GoTrue; Supabase é lento para testar constraint | ADR-017 |
| DEC-017 | CI no GitHub Actions do repositório `brsg05/MedEscala` | Breno | — | — |
| DEC-018 | **Monorepo na raiz** do repositório (antes escolhida a subpasta `medescala/`) | Breno, sobre recomendação | O repositório já é o MedEscala; a subpasta repetiria o nome | — |
| DEC-019 | Decisões novas vão **direto no guia**, como ADR | Breno, sobre recomendação | O guia se declara ponto único de verdade | — |
| DEC-020 | **F02** entra no MVP: parte fiscal no Sprint 1, bancária no Sprint 4 | Breno, sobre recomendação | Prioridade E na Entrega 1; estava ausente do §3.1 | — |
| DEC-021 | **F24 (LGPD)** em versão mínima dentro do MVP | Breno, sobre recomendação | Prioridade E na Entrega 1; o guia a adiava | ADR-015 |
| DEC-022 | Médico em **React mobile-first + PWA**, base única com a instituição | Breno, sobre recomendação | Atende a RNF03 sem abrir uma frente nova | — |
| DEC-023 | **Dinheiro em centavos inteiros** no wire, com tipo *branded* | Breno, sobre recomendação | Float em base de cálculo de tributo erra em silêncio | ADR-018 |
| DEC-024 | **Data em `timestamptz` UTC**; fuso `America/Recife` só na apresentação | Breno, sobre recomendação | Plantão noturno cruza a meia-noite; RN03 compara intervalos | ADR-018 |
| DEC-025 | **Seed idempotente** versionado | Breno, sobre recomendação | Serve a dev, testes e demo | — |
| DEC-026 | Tabela de auditoria e sua imutabilidade já no **Sprint 0** | Breno, sobre recomendação | Os módulos seguintes já nascem gravando evento | — |
| DEC-027 | **shadcn/ui + Tailwind** como base de UI | Breno, sobre recomendação | Componentes no repositório, acessíveis via Radix | — |
| DEC-028 | **Sem `docker-compose.yml`**; `supabase start` assume | Breno, sobre recomendação | Um caminho só para o time seguir | — |

## 2026-09-14 — Implementação do Sprint 0

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-029 | Fixar **NestJS 11, Prisma 6 e TypeScript 5.x**, como o guia especifica | Claude | `latest` resolvia para Nest 12, Prisma 8 RC e TS 7, incompatíveis entre si | — |
| DEC-030 | Imutabilidade da trilha por **trigger**, não por `REVOKE` | Claude | O dono da tabela ignora `REVOKE`, e o Prisma conecta como dono | ADR-012 |
| DEC-031 | SQL de policy em `supabase/policies/`, aplicado por `pnpm db:policies` | Claude | `supabase/migrations/` roda antes do Prisma criar as tabelas | ADR-011 |
| DEC-032 | Script `db:verificar-policies` no CI | Claude | Uma migration pode derrubar policies sem ninguém perceber | ADR-011 |
| DEC-033 | Sem `ValidationPipe` global; validação por rota com `ZodValidationPipe` | Claude | O pipe do Nest exige `class-validator`, contrário ao ADR-005 | — |
| DEC-034 | **Node 24 LTS** (o guia dizia 22) | Breno, sobre recomendação | Node 22.19 bloqueava `@nestjs/schematics` e `testcontainers`; o instalador entregou 24 | ADR-019 |
| DEC-035 | `.env` **por aplicação** (`apps/api/.env`, `apps/web/.env`) em vez de um na raiz | Claude | O Prisma procura `.env` relativo ao diretório de execução | — |
| DEC-036 | `packages/contracts` com **saída dupla CJS + ESM**, conferida no build | Claude | Só CJS deixava o navegador em tela branca; o teste em jsdom não pegava | — |

## 2026-09-14 — Frontend inicial

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-037 | Telas de domínio com **estados vazios honestos**, sem dado fictício | Breno, sobre recomendação | Dado falso na demo induziria a banca a erro | — |
| DEC-038 | Direção visual **mista**: a escala como espinha + fila de decisões, com elementos de formalização | Breno | — | — |
| DEC-039 | Fundo **tinta escura**; **cor = estado de cobertura** (turno, repasse, espera, descoberto), sem cor decorativa | Claude | O buraco na escala aparece de madrugada; a paleta carrega informação | — |
| DEC-040 | Tipografia: **Archivo** (sinalização), **Public Sans** (corpo), **IBM Plex Mono** (horários, CRM, valores) | Claude | Placa de corredor de hospital; números alinhados em coluna como na escala impressa | — |
| DEC-041 | Elementos-assinatura: **trilho de cobertura** de 24h e **cadeia tríade** titular → substituto → instituição | Claude | A cadeia torna a RN01 visível | — |
| DEC-042 | O app abre na **Escala**, não num painel | Claude | O artefato do domínio é a escala | — |
| DEC-043 | Barra inferior no celular, navegação lateral no desktop | Claude | Alcance do polegar (RNF03); a estação da chefia é um computador | — |

## 2026-09-14 — Backend dos Sprints 1 a 3

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-044 | Fatia implementada: **até o repasse aprovado**; matching (F08/F09) fica fora | Breno, sobre recomendação | Chega na tese do projeto; a fórmula de ordenação não existe | — |
| DEC-045 | Máquina de estados do `Plantao`, com **`CONTESTADO` resolvível** pela instituição | Breno, sobre recomendação | No diagrama original era beco sem saída, conflitando com a RN04 | ADR-020 |
| DEC-046 | **Escala versionada por contador**; histórico = trilha de auditoria | Breno, sobre recomendação | Evita dois históricos divergindo | ADR-021 |
| DEC-047 | **Prazos configuráveis por instituição** (antecedência 24h, convite 12h) | Breno, sobre recomendação | A RN08 fala em "prazo definido pela instituição" | ADR-022 |
| DEC-048 | **RN01 e RN03 garantidas pelo banco** (trigger e exclusion constraint) | Claude | Teste de violação só vale se a violação for impossível por qualquer caminho | ADR-023 |
| DEC-049 | Migrations por **`migrate diff`** (`pnpm db:nova-migration`); ninguém roda `migrate dev` | Claude | A FK para `auth.users` faz o `migrate dev` abortar (P4002) | ADR-024 |
| DEC-050 | `modeloContratacao` virou **enum** (era `String` no §7.2) | Claude | Typo em string não falha nada; o modelo decide a retenção | — |
| DEC-051 | `Repasse.plantaoId` **não é único**; índice parcial permite só um repasse em aberto por plantão | Claude | `@unique` impediria nova tentativa após recusa, contra o §7.3 | — |
| DEC-052 | **Chefia escala o médico diretamente** (`POST /plantoes/:id/atribuir`) até existir a candidatura (F10) | Claude | Sem atribuição não há plantão confirmado para repassar | — |
| DEC-053 | `aceitar()` percorre `SUBSTITUTO_ACEITO` e `AGUARDANDO_APROVACAO` na mesma transação | Claude | Respeita a tabela do §7.3 sem um estado invisível de zero segundo | — |
| DEC-054 | Trilha de auditoria **ordenada por sequência**, não por timestamp | Claude | Eventos da mesma transação compartilham o carimbo de tempo | — |

## 2026-10-08 — Frontend ligado aos endpoints

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-055 | Endpoints `/decisoes` e `/repasses`: **o perfil da sessão decide o que aparece**, nunca um parâmetro do cliente | Claude | Um médico não pode pedir a lista de aprovações da instituição | — |
| DEC-056 | **Dados de demonstração** no seed, relativos ao dia em que roda, num setor próprio (UTI Adulto) | Claude | A tela precisa ter o que mostrar na apresentação | — |
| DEC-057 | **Usuários e setor exclusivos da suíte e2e**, limpos no início e no fim | Claude | Testes e demonstração colidiam na RN03 e sujavam a fila da chefia | — |
| DEC-058 | Especialidade grafada **"Clínica Médica"** em seed e testes | Claude | A RN02 compara texto exato; ver "Especialidade" em aberto | — |

## 2026-10-08 — Ciclo da instituição

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-059 | **Cadastro aberto** para médico e instituição | Breno | `provisória`: o produto deve virar multi-tenant, com o operador incluindo a instituição | — |
| DEC-060 | Próxima frente: **fechar o ciclo da instituição** (publicar vaga, escalar, unidades e setores, auditoria) | Breno, sobre recomendação | Hoje a demo depende do seed para existir plantão | — |
| DEC-061 | Navegação com **troca de modo**: "como médico" ↔ "como instituição X" (↔ "como operador") | Breno | Contexto explícito para quem acumula papéis em instituições diferentes | — |
| DEC-062 | A chefia só encontra médicos **que declararam disponibilidade** cobrindo o horário: verificados, da especialidade, sem conflito, em ordem alfabética | Breno, sobre recomendação | Com cadastro aberto, uma instituição falsa não pode colher a lista de médicos (RNF06) | — |
| DEC-063 | Instituição **nasce pendente**; só publica vaga e vê médicos depois que o operador confirma o CNPJ | Breno, sobre recomendação | Mesma lógica do CRM (RN02); primeiro passo do modelo de tenants | — |
| DEC-064 | Quem cria a instituição recebe **ADMIN_INSTITUICAO e CHEFIA_ESCALA**; o admin concede chefia a outro usuário já cadastrado, por e-mail | Breno, sobre recomendação | Instituição pequena funciona com uma pessoa | — |
| DEC-065 | Changelog de decisões em **arquivo no repositório**, atualizado a cada decisão | Breno | Versionado com o código que cada decisão afeta | — |
| DEC-066 | Instituição **pendente pode montar a estrutura** (unidades, setores); o que a verificação trava é publicar vaga e enxergar médicos | Claude | A estrutura fica pronta enquanto o CNPJ é conferido | — |
| DEC-067 | `/decisoes` e `/repasses` aceitam `?modo=medico` ou `?instituicaoId=` para a tela do modo ativo — **só recortam**, nunca ampliam o que o perfil permite | Claude | Compatível com DEC-055; necessário para a troca de modo (DEC-061) | — |
| DEC-068 | Leitura de plantão, repasse e trilha **restrita a quem participa** (médicos envolvidos, admin e chefia da instituição); recurso alheio responde **404**, não 403 | Claude | Corrige furo: qualquer usuário lia nome e CRM de qualquer plantão. 404 não confirma a existência do id a quem sonda | — |
| DEC-069 | Admin só cria setor em unidade **da própria instituição** | Claude | Corrige furo: qualquer admin criava setor em qualquer unidade | — |
| DEC-070 | Candidato exige janela de disponibilidade cobrindo o **plantão inteiro** e com **valor mínimo** atendido pelo valor da vaga | Claude | O médico declarou essas condições ao se oferecer (F04) | — |
| DEC-071 | O médico pode **remover** uma janela de disponibilidade | Claude | Com DEC-062, retirar a janela é retirar-se da busca daquele horário | — |
| DEC-072 | O perfil MEDICO criado pelo cadastro **não pertence a instituição** (`instituicaoId` nulo) | Claude | O médico é da plataforma, não de um hospital | — |
| DEC-073 | Cadastro **sem confirmação de e-mail** | Claude | `provisória`: não há provedor de e-mail (F22); com e-mail, vira confirmação por link | — |
| DEC-074 | A atribuição direta (DEC-052) **não exige** disponibilidade declarada; a interface só oferece os candidatos da DEC-062 | Claude | A chefia que já conhece o médico continua podendo escalá-lo; sem listagem, o id não é descobrível | — |
| DEC-075 | Se o cadastro falha depois de criar a credencial no Supabase, a credencial é **removida** (compensação) | Claude | Supabase Auth e Postgres do domínio não compartilham transação | — |
| DEC-076 | A rota da trilha (`GET /plantoes/:id/auditoria`) passou para o módulo de escala; o serviço de auditoria só lê | Claude | A checagem de quem participa do plantão mora na escala | — |
| DEC-077 | Seed de demonstração ganha uma **instituição pendente** com a dona (`clinica@`) e **janelas de disponibilidade** do Bruno | Claude | Modo operador e busca de candidatos precisam ter o que mostrar | — |
| DEC-078 | O **modo ativo é lido da URL** (`/escala`, `/instituicao/:id/...`, `/operador`); trocar de modo é navegar | Claude | Toda tela abre por link; não há estado escondido que divirja da tela | — |
| DEC-079 | O navegador **lembra o último modo** usado (`localStorage`) para o próximo login | Claude | Conveniência por navegador, não estado de negócio; ignorado se o perfil foi revogado | — |
| DEC-080 | **Disponibilidade** vira aba própria do médico (5 abas: Escala, Disponível, Decisões, Repasses, Conta) | Claude | Com a DEC-062, declarar disponibilidade é a única forma de ser encontrado | — |
| DEC-081 | A legenda da régua muda com a **perspectiva**: "Seu turno" para o médico, "Coberto" para a chefia | Claude | Mesmas cores, leituras diferentes; para a chefia o vermelho é a crise do dia | — |
| DEC-082 | Na publicação de vaga, a **especialidade vem do setor**, não é digitada | Claude | A RN02 compara texto exato; texto livre aqui criaria vaga que ninguém cobre | — |
| DEC-083 | Durações de vaga **pré-definidas: 6h, 12h e 24h** | Claude | Cobrem os turnos reais; evitam erro de digitação no fim do plantão | — |
| DEC-084 | Diálogos como **folha inferior no celular** e modal no desktop, com `Esc`, foco inicial e retorno de foco | Claude | Ação perto do polegar (RNF03); teclado na estação da chefia | — |
| DEC-085 | A trilha mostra o **número de sequência** gravado pelo banco em cada evento | Claude | A ordem é o critério de aceite do F23 — o número informa, não decora | — |
| DEC-086 | Lista de candidatos em **ordem alfabética**, com aviso explícito de que a F09 não está definida | Claude | Ordenar por qualquer outro critério seria inventar a fórmula que está em aberto | — |
| DEC-087 | Visão do produto para encontrar o substituto, em **duas formas**: (1) **indicação direta** pelo titular — até **5 pessoas** escolhidas da lista de verificados com disponibilidade, ou **apontamento individual** por nome ou CRM; (2) **convite aberto** aos disponíveis, onde o **matching** gera a lista dos principais candidatos | Breno | Resolve o buraco do repasse pedido pela tela, que não chegava a ninguém | — |
| DEC-088 | Implementar **as duas formas** da DEC-087 agora; a Forma 2 com **matching provisório** | Breno | — | — |
| DEC-089 | Convites da Forma 1 **em fila**, na ordem do titular, com **prazo curto** | Breno | Respeita a preferência do titular sem disputa por velocidade | — |
| DEC-090 | Prazo de cada convite da fila **configurável por instituição, padrão 1h**, e nunca além do início do plantão | Breno, sobre recomendação | Mesma lógica da ADR-022 | — |
| DEC-091 | Apontamento individual por **CRM + UF exato**; busca por nome descartada | Breno, sobre recomendação | Busca por nome permitiria colher a base de médicos (DEC-062) | — |
| DEC-092 | O médico apontado individualmente **não precisa** ter declarado disponibilidade; continuam valendo RN02 e RN03 | Breno, sobre recomendação | O apontamento é para o colega que o titular conhece; o convite é a pergunta | — |
| DEC-093 | Fila da Forma 1 esgotada **vira convite aberto (Forma 2) automaticamente** | Breno | — | — |
| DEC-094 | Forma 2 = os **5 primeiros do ranking entram na mesma fila**; ordenação provisória por **vínculo com a instituição**, depois **plantões cumpridos**, com desempate fixo — **nunca pelo menor valor pedido** | Breno, sobre recomendação | Uma mecânica só; ranquear por preço empurraria o valor do plantão para baixo | — |
| DEC-095 | **Revisar o ADR-004: Redis + BullMQ** para jobs agendados (vencimento dos convites da fila) | Breno | Escolha do Breno entre sob demanda, `pg_cron`, `pg-boss` e Redis, após a explicação dos custos | ADR-027 |
| DEC-096 | Forma 2 segue em **lotes de 5 do ranking até acabarem os candidatos**; aí o repasse volta ao titular, que continua responsável | Breno, sobre recomendação | — | — |
| DEC-097 | **Postgres decide, Redis acelera**: o prazo de cada convite fica no Postgres; o job do BullMQ avança a fila na hora, e toda leitura ou ação também trata como vencido o convite com prazo passado | Breno, sobre recomendação | Neutraliza a escrita dupla que o ADR-004 evitava: job perdido não trava a fila | ADR-027 |
| DEC-098 | Volta um **`docker-compose.yml` só com o Redis** (revisa parcialmente a DEC-028) | Breno, sobre recomendação | O `supabase start` não traz Redis | — |
| DEC-099 | Recusa da chefia **não encerra o repasse**: volta a SOLICITADO e a fila segue com o próximo | Breno, sobre recomendação | A chefia recusou o substituto, não o repasse; responde quem dispara `RECUSADO_INSTITUICAO → SOLICITADO` | — |

## 2026-10-08 — Implementação da fila de convites

Decisões tomadas durante a implementação da DEC-087 a DEC-099.

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-100 | O worker do BullMQ roda **no mesmo processo** da api, não em processo separado | Claude | Um processo a menos para subir na demo; separar é mudar só o bootstrap | ADR-027 |
| DEC-101 | `ioredis` entra como **dependência explícita** da api | Claude | O BullMQ o trata como opcional e, sem ele, a api travava na subida sem erro claro | — |
| DEC-102 | O job de vencimento usa `jobId` = `convite-<id>` e dispara **1s depois** do prazo; o agendamento **não é aguardado** pela requisição | Claude | `jobId` fixo torna o reagendamento idempotente; Redis fora do ar não derruba a ação do médico (DEC-097 cobre o job perdido) | ADR-027 |
| DEC-103 | Prazo de cada convite = **o menor entre** agora + prazo da instituição e o **início do plantão** | Claude | Detalhe da DEC-090 | — |
| DEC-104 | Plantão que **começa** com o repasse em SOLICITADO: o repasse é **cancelado** e a fila encerrada; o titular segue escalado | Claude | Não há mais quem convidar a tempo; a escala nunca mudou | — |
| DEC-105 | Só o **convidado da vez** aceita; os demais da fila veem 404 até chegar a vez deles | Claude | Garante a ordem do titular (DEC-089) | ADR-026 |
| DEC-106 | Ao aceite, o resto da fila fica **dormente** (NA_FILA); só é **cancelado na aprovação** da chefia | Claude | Se a chefia recusar (DEC-099), a fila retoma de onde parou sem reconstrução | — |
| DEC-107 | Recusa do **convidado não exige justificativa** — só passa a vez; justificativa continua obrigatória para a chefia (F11) | Claude | Recusar um convite é responder "não posso", não decisão a auditar com texto | — |
| DEC-108 | A fila do repasse (quem foi chamado, em que ordem, o que respondeu) é visível ao **titular e à instituição**; para os convidados, 404 | Claude | Um convidado não precisa saber quem mais foi chamado | ADR-026 |
| DEC-109 | A busca por CRM devolve **só médico verificado**; não verificado responde como inexistente | Claude | Coerente com a RN02 e com a DEC-091 | — |
| DEC-110 | O titular **monta a fila misturando** a lista de quem se ofereceu e o apontamento por CRM, até 5, e pode reordenar | Claude | Leitura da DEC-087: as duas entradas alimentam a mesma fila | — |
| DEC-111 | Prazo do convite configurável entre **5 minutos e 24 horas**; a mudança vale para os **próximos** convites | Claude | Abaixo de 5 min ninguém responde; acima de 24h a fila deixa de ser curta | — |
| DEC-112 | `Repasse.respostaAte` **removido**; o prazo passa a ser por convite | Claude | Substituído pelo `prazoAte` de cada convite | — |
| DEC-113 | O titular pode **indicar mais pessoas** enquanto o repasse está em SOLICITADO, mesmo antes de a fila esgotar, e pode **cancelar** o repasse nesse estado | Claude | Saídas da DEC-096 para o titular, que continua responsável | — |
| DEC-114 | Redis **sem volume** no `docker-compose.yml` | Claude | O Redis só acelera (DEC-097); perder os jobs não perde nada | — |
| DEC-115 | No CI, o Redis entra como **service** do job de e2e, com a mesma imagem do compose | Claude | Os e2e da fila conferem o job agendado | — |

## 2026-10-08 — Versionamento

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-116 | Commits iniciais **direto na `main`**, separados por tema | Breno | Primeiro envio do que existia só na máquina | — |
| DEC-117 | Mensagens de commit em **inglês**, Conventional Commits, **até 2 linhas** | Breno | Fecha a pergunta do idioma deixada em aberto no planejamento | §12 |
| DEC-118 | `.claude/settings.json` **fica fora** do repositório | Claude | Guarda só permissões pontuais desta máquina, sem valor para a equipe | — |
| DEC-119 | `.gitattributes` com **`eol=lf`** para todo arquivo de texto | Breno, sobre recomendação | O Prettier exige LF; clone no Windows com `core.autocrlf=true` receberia CRLF e falharia no `pnpm verify` | — |
| DEC-120 | Commits **sem** linha de coautoria (`Co-Authored-By`) | Breno | — | — |

## 2026-10-08 — Próximas frentes

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-121 | A F22 começa **só in-app**; e-mail fica para quando houver provedor | Breno | — | — |
| DEC-122 | O produto é um **intermediário**: no futuro integra CNES/DataSUS, Receita Federal, emissor de NFS-e, assinatura eletrônica, gateway de pagamento, gov.br, geocodificação e escalas/ERP das instituições. **No MVP, as mais complicadas ficam simuladas** | Breno | — | — |
| DEC-123 | **F18 (avaliação de mão dupla) adiada** — não há consenso sobre ela | Breno | — | — |
| DEC-124 | **F14 segue como simulação**, do melhor jeito possível, sabendo que será substituída pela integração real | Breno | Coerente com a DEC-122 | — |
| DEC-125 | Hospedagem **provavelmente na Vercel** | Breno | `provisória`: sem confirmação | — |
| DEC-126 | Ordem de trabalho: primeiro os buracos do fluxo pronto (**F22 in-app** e **F16**), depois **fechar o Sprint 2**; commit por grupo ao fim de cada um | Breno | — | — |
| DEC-127 | F22 in-app entregue por **polling** (a cada ~20s e ao voltar para a aba) | Breno, sobre recomendação | Funciona em hospedagem serverless e mantém o BFF como porta única (D2) | — |
| DEC-128 | A notificação é gravada **na mesma transação** da ação de domínio, junto da trilha | Breno, sobre recomendação | Nunca existe ação sem aviso nem aviso sem ação | — |
| DEC-129 | Notificam: **fila do repasse**, **desfecho do repasse**, **escala e execução** e **verificação de cadastro** | Breno | — | — |
| DEC-130 | F16: o **executante faz check-in e check-out**; a instituição pode **contestar** dentro de um prazo | Breno, sobre recomendação | Pouco trabalho para a chefia | — |
| DEC-131 | Plantão que termina **sem check-in** fica **pendente para a instituição**, que confirma ou contesta; nada é presumido | Breno, sobre recomendação | — | — |
| DEC-132 | Prazo de contestação **72h, configurável por instituição** | Breno, sobre recomendação | Cobre fim de semana | — |
| DEC-133 | Check-in a partir de **30 min antes** do início; check-out a partir do início; **sem geolocalização** por ora | Breno, sobre recomendação | Passagem de plantão começa antes do horário; geolocalização é integração (DEC-122) | — |
| DEC-134 | CONTESTADO: a instituição contesta com justificativa, o médico pode responder e **a própria instituição fecha** como EXECUTADO ou CANCELADO; mediação pelo operador fica para depois | Breno, sobre recomendação | — | — |
| DEC-135 | F10: **convite + candidatura** — a chefia convida pela mesma fila do repasse (aceite confirma direto) e o médico vê vagas compatíveis e se candidata; a chefia escolhe | Breno, sobre recomendação | — | — |
| DEC-136 | F09 no MVP: critérios **em sequência**, sem pesos — vínculo com a instituição, plantões cumpridos (reais com a F16) e **taxa de resposta aos convites** | Breno, sobre recomendação | Não inventa pesos; quem deixa convite vencer desce | DEC-094 |
| DEC-137 | **Raio geográfico e proximidade adiados** | Breno, sobre recomendação | Sem integração real de geocodificação (DEC-122) | — |

## 2026-10-09 — F22: notificações in-app

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-138 | Módulo de notificação **global**, como o de auditoria | Claude | Todo módulo de domínio avisa alguém, dentro da própria transação (DEC-128) | — |
| DEC-139 | O texto do aviso é **gravado pronto** (título e corpo), não montado na leitura | Claude | Aviso é mensagem enviada: se o plantão mudar depois, ele continua dizendo o que disse | — |
| DEC-140 | Destinatários: aprovação pendente → **chefias** da instituição; instituição aprovada → **admins**; cadastro pendente → **todos os operadores**; o resto → o médico envolvido | Claude | Cada aviso vai para quem age sobre ele | — |
| DEC-141 | O titular é avisado de **cada** recusa e expiração de convite, não só do fim da fila | Claude | Leitura da DEC-129 ("convite venceu/recusado") | — |
| DEC-142 | O sino lista os **30 mais recentes**; nada é apagado — retenção fica com a F24 (em aberto) | Claude | — | — |
| DEC-143 | Polling **pausa com a aba escondida** e retoma ao voltar; falha de rede é silenciosa | Claude | Ninguém está olhando; o próximo foco traz tudo | DEC-127 |
| DEC-144 | Aviso de outra pessoa responde **404** ao ser marcado como lido | Claude | Mesma regra da ADR-026 | ADR-026 |
| DEC-145 | Verificação de CRM, aprovação de instituição e cadastro de médico passaram a rodar **em transação** | Claude | Exigência da DEC-128: o aviso precisa da mesma transação da ação | — |
| DEC-146 | Glifo próprio para os avisos (bloco do trilho com sinal aceso), no topo, ao lado da conta, em todos os modos | Claude | Segue a regra dos glifos do app; convite com prazo curto não pode depender da aba aberta | — |
| DEC-147 | Os e2e apagam os avisos dos plantões e cadastros que criam | Claude | Senão a demonstração mostraria avisos de coisas que já não existem | — |

## 2026-10-09 — F16: confirmação de execução

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-148 | O check-out leva o plantão **direto a EXECUTADO**, contestável até `contestavelAte`; não há estado intermediário "aguardando contestação" | Claude | A ADR-020 já tinha `EXECUTADO → CONTESTADO`; um estado a mais exigiria job para fechar a janela. Na prática: cumprido enquanto ninguém contesta | DEC-130, ADR-020 |
| DEC-149 | Duas transições novas: **CONFIRMADO → EXECUTADO** e **CONFIRMADO → CONTESTADO**, só depois do fim do plantão | Claude | É o caso "sem check-in" da DEC-131 | ADR-020 |
| DEC-150 | "Sem confirmação" é **derivado do horário**, não gravado | Claude | Não depende de job para existir; o Redis só manda o lembrete | DEC-097 |
| DEC-151 | Plantão confirmado pela própria instituição **não abre janela** de contestação | Claude | Quem contestaria é quem acabou de confirmar | — |
| DEC-152 | Plantão sem confirmação pode ser contestado **a qualquer momento**, sem prazo | Claude | Ninguém afirmou nada que precise ser contestado a tempo | DEC-131 |
| DEC-153 | Check-out continua possível **depois do fim** | Claude | Quem esqueceu de marcar ainda marca | DEC-133 |
| DEC-154 | Check-in com repasse em andamento: **recusado antes do início**; depois do início, o repasse ainda SOLICITADO é encerrado e o check-in segue | Claude | Antes do início, quem executa ainda não está decidido; depois, vale a DEC-104 | DEC-104 |
| DEC-155 | Só **CHEFIA_ESCALA** confirma, contesta e resolve; o admin só vê | Claude | Mesma regra da aprovação de repasse (F11) | — |
| DEC-156 | O médico responde **uma vez**; a decisão da instituição **exige motivo** e é **final** (a janela não reabre) | Claude | Detalhe da DEC-134; evita contestação em laço | DEC-134 |
| DEC-157 | Prazo de contestação configurável entre **1 hora e 14 dias** | Claude | Detalhe da DEC-132 | DEC-132 |
| DEC-158 | Lembretes de check-in e de "sem confirmação" por **job recorrente** do BullMQ (a cada 60s, agendador de id fixo); cada lembrete marca a linha do plantão e sai uma vez só | Claude | Sem Redis, perde-se o lembrete, nunca um estado (DEC-150) | ADR-027 |
| DEC-159 | Módulo próprio **`execucao`**, fora da escala | Claude | Depende do repasse (DEC-154), que já depende da escala: dentro da escala fecharia um ciclo | — |
| DEC-160 | "Pedir repasse" só aparece para plantão **confirmado que ainda não começou** | Claude | Antes aparecia também em plantão passado | — |
| DEC-161 | Médico que não é o executante recebe **404** nas ações de execução | Claude | ADR-026 | ADR-026 |
| DEC-162 | Seed: a Ana ganha um plantão **cumprido anteontem** (ainda contestável) e um **sem confirmação ontem** | Claude | A F16 precisa ter o que mostrar na demonstração | — |
| DEC-163 | Testes do web com **relógio fixo** (só `Date`) | Claude | Os botões dependem da hora; sem isto o mesmo teste mudaria conforme a hora em que roda | — |

## 2026-10-09 — Sprint 2: F10 e F09

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-164 | **Uma fila só** para repasse e vaga: o convite aponta para o plantão, e o repasse fica opcional (sem repasse = convite de vaga) | Breno, sobre recomendação | Um motor só — prazo, Redis, matching e varredura já testados | DEC-135 |
| DEC-165 | Convite de vaga usa **o mesmo prazo** configurável da fila; o campo `validadeConviteHoras`, nunca usado, é removido | Breno, sobre recomendação | Um ajuste só na tela Estrutura | DEC-090 |
| DEC-166 | O médico vê **por padrão as vagas compatíveis**, e **pode ver todas** se quiser | Breno | — | DEC-135 |
| DEC-167 | "Todas" = todas as vagas abertas de instituições ativas; **candidatar-se continua exigindo RN02 e RN03** — nas incompatíveis o botão fica bloqueado, com o motivo | Claude | Leitura da DEC-166: ver não é poder se candidatar | RN02, RN03 |
| DEC-168 | As vagas ficam **dentro da aba Disponível** | Breno, sobre recomendação | Declarar disponibilidade e procurar plantão são a mesma intenção; a barra continua com 5 abas | — |
| DEC-169 | Na fila da vaga, expiração e recusa de convite **não avisam a chefia um a um**; ela é avisada quando a fila acaba sem aceite ou a vaga é preenchida | Claude | Seria ruído para quem cuida da escala inteira; no repasse o titular continua avisado de cada uma (DEC-141) | — |
| DEC-170 | O motor da fila continua no módulo de repasse; o módulo de vagas depende dele | Claude | Separar o motor exigiria injeção cruzada entre módulos para um ganho só de nome | DEC-164 |
| DEC-171 | Módulo **`vagas`** é dono dos três caminhos que preenchem uma vaga (aceite do convite, candidatura escolhida, escala direta); a rota `POST /plantoes/:id/atribuir` mudou de módulo, **não de caminho**. A atribuição aceita um callback que roda na mesma transação | Claude | Preencher por um caminho fecha os outros dois atomicamente | — |
| DEC-172 | `prazoConviteRepasseMinutos` renomeado para **`prazoConviteMinutos`** (API e banco) | Claude | O prazo passou a valer para a vaga também (DEC-165) | — |
| DEC-173 | Unicidade da fila por **`UNIQUE NULLS NOT DISTINCT`** (plantão, repasse, médico); "um convidado da vez" passa a valer **por plantão** | Claude | Na fila da vaga o repasse é nulo; um UNIQUE comum trataria cada nulo como diferente | DEC-164 |
| DEC-174 | Quem aceita o convite da vaga **não** recebe "você foi escalado"; quem tem a candidatura escolhida recebe um aviso próprio | Claude | Um seria eco da própria ação; o outro diz mais que o genérico | — |
| DEC-175 | Candidatura **recusada é final**; **retirada pode voltar** | Claude | A resposta da chefia está dada; o médico pode mudar de ideia | — |
| DEC-176 | **Admin e chefia** gerem a vaga (convidar, escolher, encerrar, escalar), como já publicavam e escalavam; aprovação de repasse e execução continuam só da chefia | Claude | Mesma regra da publicação de vaga | DEC-155 |
| DEC-177 | Busca por CRM aberta também a **admin e chefia** | Claude | Para apontar um médico na fila da vaga (DEC-091) | DEC-091 |
| DEC-178 | Taxa de resposta: janela de **90 dias**; **sem histórico vale 1**; **recusar conta como resposta** | Claude | O que trava a fila de alguém é deixar vencer, não dizer não | DEC-136 |
| DEC-179 | A lista de vagas do médico traz **até 100 vagas futuras**, só de instituições ativas | Claude | — | DEC-166 |
| DEC-180 | Como anda a seleção (convidado da vez, candidaturas pendentes) **só aparece na escala da instituição** | Claude | Um convidado não precisa saber quem mais foi chamado (DEC-108) | DEC-108 |
| DEC-181 | No cartão da vaga: **Convidar**, **Escalar direto** e **Candidaturas (n)**; a seleção fica no cartão da escala, não em Decisões | Claude | É ali que a chefia olha a vaga descoberta | — |
| DEC-182 | Vaga cujo plantão começa com a fila correndo **volta a ABERTO** sem aviso extra | Claude | O turno descoberto já aparece em vermelho na escala | — |

## 2026-10-09 — Correções

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-183 | Em rota fora de um modo (Conta), a navegação e o seletor mostram **o último modo usado** | Claude | Correção: em Conta as outras abas sumiam e só saindo da conta se voltava | DEC-078, DEC-079 |
| DEC-192 | Todo diálogo (`Painel`) é renderizado **num portal, direto no `<body>`** | Claude | Correção: o painel de avisos, aberto de dentro do cabeçalho com `backdrop-filter`, ficava preso a ele e vazava da tela | DEC-084 |

## 2026-10-09 — Sprint 4: termo e fluxo financeiro

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-184 | F13 gera **dois documentos**: termo de substituição (repasse aprovado, três partes) e contrato do plantão (médico escalado e instituição) | Breno, sobre recomendação | Mesmo gerador, dois modelos | — |
| DEC-185 | **A ação é a assinatura**: pedir o repasse, aceitar e aprovar (ou escalar e aceitar a vaga) viram assinaturas com data/hora e hash do conteúdo | Breno | `provisória`: o Breno avalia que isso não se sustenta na vida real; a assinatura guarda o **método** (`ACEITE_NO_APP`) para trocar por gov.br/ICP-Brasil depois (DEC-122) sem refazer o termo | DEC-122 |
| DEC-186 | PDF gerado **no servidor com pdfkit** | Breno, sobre recomendação | Leve, sem navegador embutido; funciona em serverless | — |
| DEC-187 | Guarda-se o **retrato do conteúdo (JSON canônico) + hash SHA-256** na última assinatura; o PDF é gerado sob demanda a partir do retrato | Breno, sobre recomendação | O termo não muda se o cadastro mudar depois; o PDF sai sempre igual | — |
| DEC-188 | A cobrança nasce **quando o plantão é cumprido** (EXECUTADO): a instituição paga e o valor fica RETIDO | Breno, sobre recomendação | Só se cobra o que aconteceu | F15, F17 |
| DEC-189 | O valor retido é **liberado ao fim do prazo de contestação**, ou quando a contestação é julgada improcedente; o plantão vira LIQUIDADO | Breno, sobre recomendação | Liga a garantia (F15) à F16 | DEC-132 |
| DEC-190 | **Sem taxa da plataforma no MVP**: o split existe, com a parte da plataforma em 0% | Breno, sobre recomendação | Não inventar modelo de negócio | F17 |
| DEC-191 | Contestação procedente: **estorno integral à instituição** | Breno, sobre recomendação | — | DEC-134 |

## 2026-10-09 — F13: termos contratuais

| ID | Decisão | Origem | Motivo | Ref. |
|---|---|---|---|---|
| DEC-193 | Na escala direta, o contrato nasce com a assinatura da instituição e o **check-in vale como aceite do médico** | Breno, sobre recomendação | Na escala direta o médico não faz ação nenhuma (DEC-074) | DEC-185 |
| DEC-194 | Quem assina pela instituição: quem **escalou**, quem **escolheu a candidatura** ou quem **convidou pela fila**; pelo médico: **candidatar-se** ou **aceitar o convite** | Claude | Leitura da DEC-185 para cada caminho da F10 | DEC-185 |
| DEC-195 | Na aprovação de um repasse, os termos vigentes do plantão ficam **substituídos**; o termo de substituição passa a valer como contrato do substituto | Claude | Um plantão tem um responsável por vez (RN01) | — |
| DEC-196 | Termo **imutável no banco** depois de emitido (trigger); assinatura não se edita; o banco confere que a assinatura cobre o hash do termo | Claude | O valor do termo é não mudar (DEC-187) | ADR-007 |
| DEC-197 | Leem o termo: os médicos do plantão (titular, executante, partes de um repasse) e admin ou chefia da instituição; os demais recebem 404 | Claude | ADR-026 | ADR-026 |
| DEC-198 | **Texto das cláusulas escrito pelo Claude**, com versão do modelo no termo — **precisa de revisão jurídica** antes de qualquer uso real | Claude | `provisória`: é simulação; a versão permite trocar o texto sem tocar nos termos já emitidos | DEC-185 |
| DEC-199 | PDF com a fonte Helvetica padrão (sem arquivo de fonte no servidor); a data do PDF é a da emissão, não a do download | Claude | — | DEC-186 |
| DEC-200 | O seed cria os contratos dos plantões da Ana; o CORS expõe `Content-Disposition` para o web ler o nome do PDF | Claude | — | — |
