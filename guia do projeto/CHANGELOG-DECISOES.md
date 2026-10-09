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
| Ordenação do matching (F09) | Pesos de aderência, reputação, comparecimento e distância. Até lá vale a ordenação **provisória** da DEC-094 | Matching definitivo |
| Geolocalização (F04/F09) | PostGIS ou lat/long com haversine | "Raio geográfico" e "proximidade" |
| Especialidade | Hoje é texto livre comparado por igualdade exata; deveria ser lista fechada? | Robustez da RN02 |
| Limite de carga horária (F08) | Regra além das 24h contíguas da RN03 | Filtro do matching |
| `StatusPagamento` | Não existe no schema; só citado em prosa (§3.2) | Sprint 4 |
| Escala da avaliação (F18) | Nota, critérios, quando fica visível | F18 |
| Retenção de dados (F24) | Prazos concretos | F24 mínima |
| PaaS de deploy | Explicitamente para a Entrega 5 | Entrega 5 |
| Provedor de e-mail (F22) | — | Notificações |
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
