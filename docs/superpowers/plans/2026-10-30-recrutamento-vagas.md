# Recrutamento, página de vagas e banco de talentos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vagas geridas pelo RH, página pública de vagas embutível com candidatura sem login, quadro de etapas, banco de talentos com LGPD, antivírus nos currículos e contratação que gera o cadastro de colaborador.

**Architecture:** Novo módulo `recruitment` no monólito Fastify, tabelas novas com RLS por tenant, e uma superfície pública separada (`/api/public/v1`) que roda sob uma role de banco própria (`falcao_public`) com privilégios mínimos. A verificação de antivírus e os expurgos da LGPD rodam no `worker`. A interface ganha rotas públicas leves (`/vagas/...`), fora do app autenticado, e telas internas no design system atual.

**Tech Stack:** TypeScript, Fastify 5, Drizzle ORM, PostgreSQL 16 (PGlite nos testes), Zod 4, React 19 + TanStack Router/Query, Tailwind 4, GSAP (Draggable/Flip já registrados em `apps/web/src/lib/gsap.ts`), ClamAV (clamd por TCP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-recrutamento-vagas-design.md`

## Global Constraints

- Toda tabela nova com `tenant_id`: RLS `tenant_isolation`, `GRANT` mínimos a `falcao_app`, FKs compostas `(tenant_id, col) → (tenant_id, id)`, e cobertura em `apps/api/test/tenant-isolation.test.ts` (checklist de `docs/DATABASE.md`).
- Rotas públicas: prefixo `/api/public/v1`, fora do `authenticate`, sem cookies, role `falcao_public`; **nunca** leem candidatos, candidaturas, notas ou arquivos.
- Organização resolvida pelo slug da URL (`/vagas/:empresa`), nunca por id enviado pelo cliente. Vaga acessada pelo `share_token` aleatório (32 bytes, base64url), nunca pelo UUID.
- Currículo: só PDF (`sniffMimeType`), até `MAX_UPLOAD_BYTES` (10 MB), armazenamento privado. Estado `pending` → `clean` | `infected`; download interno **só** de `clean`; `infected` é removido do armazenamento.
- Retenção (padrões editáveis em configurações): sem consentimento ao banco de talentos, 6 meses após o encerramento da vaga; com consentimento, 24 meses desde o consentimento ou a última renovação. Nada é apagado com processo em andamento (etapa ≠ `rejected`/`hired` e vaga ≠ `closed`).
- Junção de fichas nunca automática pelo formulário público; o RH confirma.
- Contratação só pelo botão "Contratar" (endpoint dedicado). Arrastar para `hired` é recusado com 400.
- Gestor (`manager`) vê só candidaturas das vagas em que é `manager_user_id`; sem CPF, sem outras candidaturas da pessoa, sem notas de outras vagas; sem banco de talentos.
- Etapas e rótulos (pt-BR): `new` Novo, `screening` Triagem, `interview` Entrevista, `offer` Proposta, `hired` Contratado, `rejected` Recusado.
- Interface: design system atual (tokens, tema claro/escuro, `Panel`, `DataTable`, `Drawer`, `TabList`, `RevealScope`); textos em pt-BR.
- Trabalhar num branch novo (`feat/recrutamento`): o `main` local tem o rework visual ainda sem commit; não misturar.

## Review Focus

1. **Candidatura repetida para a mesma vaga com o mesmo e-mail** — o candidato espera não criar duas candidaturas; a API responde 409 "Você já se candidatou a esta vaga." (teste na Task 4).
2. **Vaga pausada ou encerrada aberta por link antigo** — a página mostra a vaga com o aviso "Esta vaga não está recebendo candidaturas", e o envio responde 409 (teste na Task 4).
3. **Scanner fora do ar** — arquivos ficam `pending`, o RH vê "Em verificação" e nada é liberado; a próxima rodada do worker tenta de novo (teste na Task 10).
4. **Gestor tentando abrir candidato pelo id de outra vaga** — 404, nunca 403 com dados (teste na Task 7).
5. **Pedido de exclusão com token já usado ou inválido** — resposta 200 genérica, sem revelar se existia (teste na Task 5).

---

### Task 1: Contratos (permissões, esquemas e rótulos)

**Files:**
- Create: `packages/contracts/src/recruitment.ts`
- Modify: `packages/contracts/src/index.ts` (export), `packages/contracts/src/permissions.ts` (novas permissões), `packages/contracts/src/phase5.ts` (`tenantSettingsInput` ganha `recruitment`)
- Test: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces:
  - `APPLICATION_STAGES = ['new','screening','interview','offer','hired','rejected'] as const`, `ApplicationStage`, `APPLICATION_STAGE_LABELS`, `OPEN_STAGES` (`new`..`offer`)
  - `JOB_STATUSES = ['draft','published','paused','closed']`, `JOB_VISIBILITIES = ['public','unlisted']`, `WORK_MODES = ['onsite','site','hybrid']` (+ `_LABELS`: Presencial, Canteiro de obras, Híbrido)
  - `QUESTION_KINDS = ['text','yes_no','choice']`
  - `jobInput` (Zod): title(3–120), departmentId/unitId/positionId uuid|null, contractType (CONTRACT_TYPES), city, state(2), workMode, salaryMin/salaryMax number|null (max ≥ min), showSalary bool, description(≥20), requirements, benefits, openings int 1–99, managerUserId string|null, visibility, questions: `{ kind, label(3–200), options?: string[] (2–10, só para choice), required }[]` (máx. 10)
  - `applicationForm` (Zod): fullName(3–120), email, phone(10–20 dígitos), city, state(2), cpf opcional (validado por `isValidCpf`), linkedin url opcional, answers `Record<questionId, string>`, privacyConsent `literal(true)`, talentPoolConsent bool, website (honeypot) `max(0)`, startedAt number
  - `stageMove`: `{ stage: Exclude<ApplicationStage,'hired'>, reason?: string }` com `reason` obrigatório (3–300) quando `stage==='rejected'`
  - `candidateFilters`: q, city, state, tag, consent ('yes'|'all'), page, pageSize
  - `RECRUITMENT_DEFAULTS = { retentionMonthsWithoutConsent: 6, talentPoolMonths: 24, rejectionMessage: 'Agradecemos seu interesse. Neste momento seguimos com outros perfis para esta vaga, mas seus dados podem ser considerados em oportunidades futuras.', hiredMessage: 'Parabéns! Você foi selecionado(a). O RH da Falcão vai entrar em contato com os próximos passos.' }`; `tenantSettingsInput.recruitment` aceita esses quatro campos (meses 1–60; textos 20–1000)
  - Permissões: `recruitment.read` (admin, hr, manager), `recruitment.manage` (admin, hr), `talent_pool.read` (admin, hr)

- [ ] **Step 1: Write the failing tests** em `contracts.test.ts`:
  - `can('manager','recruitment.read')` true; `can('manager','recruitment.manage')` false; `can('manager','talent_pool.read')` false; `can('hr','talent_pool.read')` true; `can('employee','recruitment.read')` false.
  - `stageMove.safeParse({ stage: 'rejected' }).success` false; com `reason: 'Perfil não aderente'` true; `stageMove.safeParse({ stage: 'hired' }).success` false.
  - `applicationForm` recusa `privacyConsent: false`, recusa `website: 'x'`, recusa CPF `'111.111.111-11'`, aceita CPF ausente.
  - `jobInput` recusa `salaryMax < salaryMin` e `choice` sem `options`.
- [ ] **Step 2:** `npm test -w packages/contracts` → FAIL (exports inexistentes).
- [ ] **Step 3:** Implementar `recruitment.ts` e as alterações listadas.
- [ ] **Step 4:** `npm test -w packages/contracts` → PASS; `npm run build -w packages/contracts` sem erro.
- [ ] **Step 5: Commit** `feat(contracts): recrutamento — permissões, etapas e esquemas`

---

### Task 2: Esquema, migrações e isolamento

**Files:**
- Create: `apps/api/src/db/schema/recruitment.ts`; migrações `apps/api/migrations/0004_recruitment.sql` (gerada: `npm run db:generate -w apps/api -- --name recruitment`) e `0005_recruitment_security.sql` (manual: `npx drizzle-kit generate --custom --name recruitment_security`)
- Modify: `apps/api/src/db/schema/index.ts`
- Test: `apps/api/test/tenant-isolation.test.ts`, `apps/api/test/recruitment-db.test.ts` (novo)

**Interfaces:**
- Produces (tabelas Drizzle, todas com `tenantId`, `createdAt`, `updatedAt` quando mutáveis):
  - `jobOpenings`: title, departmentId, unitId, positionId, contractType, city, state, workMode, salaryMin, salaryMax (numeric), showSalary, description, requirements, benefits, openings, hiredCount (int, default 0), managerUserId (text → user.id, set null), visibility, status, shareToken (text, unique), publishedAt, closedAt, createdBy
  - `jobQuestions`: jobId, position, kind, label, options (jsonb string[]), required
  - `candidates`: fullName, email (lower), phone, city, state, cpf (null), linkedin, tags (text[] default `{}`), invitedAt (null); índices `(tenant_id, email)`, `(tenant_id, cpf)`
  - `applications`: jobId, candidateId (cascade), email (minúsculo, cópia do formulário), stage, rejectionReason, rating (1–5 null), talentPoolConsent, consentAt, retentionUntil (date null), privacyToken (text unique); **unique `(job_id, email)`**
  - `applicationAnswers`: applicationId (cascade), questionId, value
  - `applicationEvents` (somente INSERT/SELECT): applicationId (cascade), fromStage, toStage, actorUserId (null = candidato/sistema), note
  - `applicationNotes`: applicationId (cascade), authorUserId, body
  - `candidateFiles`: candidateId (cascade), applicationId (set null), storageKey, filename, sizeBytes, scanStatus (`pending|clean|infected`), scannedAt
- `0005_recruitment_security.sql`:
  - RLS + `tenant_isolation` + FKs compostas em todas as tabelas acima; `GRANT SELECT, INSERT, UPDATE, DELETE` a `falcao_app` (exceto `application_events`: `SELECT, INSERT`).
  - `CREATE ROLE falcao_public NOLOGIN; GRANT falcao_public TO CURRENT_USER;`
  - `falcao_public`: `SELECT` em `job_openings` e `job_questions` com política `public_jobs` (`tenant_id = app_tenant_id() AND status IN ('published','paused') `); `INSERT` em `candidates`, `applications`, `application_answers`, `application_events`, `candidate_files` com política `public_insert` (`WITH CHECK tenant_id = app_tenant_id()`); `SELECT (id) ON applications` **não** concedido. `SELECT, UPDATE (hired_count) ON job_openings` **não** concedido.
  - `public_tenant_id(p_slug text) RETURNS uuid SECURITY DEFINER SET search_path = public` → id do tenant pelo slug; `GRANT EXECUTE … TO falcao_public`.
  - `public_application_exists(p_tenant uuid, p_job uuid, p_email text) RETURNS boolean SECURITY DEFINER` (para o 409 de duplicata sem dar SELECT).
  - `public_erase_by_token(p_token text) RETURNS text[] SECURITY DEFINER`: apaga o candidato dono da candidatura com o token (e tudo em cascata), devolve as `storage_key` apagadas; token inexistente devolve `{}`.
  - `public_renew_consent(p_token text) RETURNS boolean SECURITY DEFINER`: `consent_at = now()`, `talent_pool_consent = true` nas candidaturas daquele candidato que já tinham consentimento.

- [ ] **Step 1: Write the failing tests**
  - Em `tenant-isolation.test.ts`, estender a lista de tabelas verificadas com as 8 novas (empresa A não lê nem grava linhas da B).
  - Em `recruitment-db.test.ts`, com `set local role falcao_public` e `app.tenant_id` da empresa A:
    - `select count(*) from candidates` lança erro de permissão;
    - `select * from job_openings` devolve só `published`/`paused` da A (cria uma `draft` e uma `published` como dono);
    - `insert into candidates` com tenant da B falha;
    - `public_tenant_id('alfa')` = id de A; `public_tenant_id('nao-existe')` é null;
    - `public_erase_by_token('invalido')` devolve array vazio.
- [ ] **Step 2:** `npm test -w apps/api -- recruitment-db tenant-isolation` → FAIL.
- [ ] **Step 3:** Escrever o esquema, gerar `0004`, escrever `0005`.
- [ ] **Step 4:** Mesmos testes → PASS; `npm test -w apps/api` inteiro verde.
- [ ] **Step 5: Commit** `feat(api): tabelas do recrutamento com RLS e role pública`

---

### Task 3: Armazenamento (remoção) e antivírus

**Files:**
- Create: `apps/api/src/lib/scanner.ts`
- Modify: `apps/api/src/lib/storage.ts` (`remove`), `apps/api/src/env.ts`, `apps/api/src/app.ts` (`AppDeps.scanner`), `apps/api/test/harness.ts`, `.env.example`
- Test: `apps/api/src/lib/scanner.test.ts`, `apps/api/src/lib/files.test.ts`

**Interfaces:**
- Produces:
  - `Storage.remove(key: string): Promise<void>` (Local: `rm` ignorando inexistente; S3: `DeleteObjectCommand`) e `Storage.read(key: string): Promise<Buffer>` na interface (Local já tem; S3: `GetObjectCommand`).
  - `type ScanResult = 'clean' | 'infected'`; `interface Scanner { scan(body: Buffer): Promise<ScanResult> }`
  - `class ClamdScanner implements Scanner` (`constructor(host: string, port: number, timeoutMs = 15_000)`): protocolo clamd `zINSTREAM\0`, blocos com prefixo de 4 bytes big-endian, terminador `0000`; resposta `stream: OK` → clean, `… FOUND` → infected, qualquer outra coisa ou timeout → **lança** erro (o arquivo continua `pending`).
  - `class MemoryScanner implements Scanner`: infected se o buffer contém a assinatura EICAR (`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`); `failing = false` público para simular indisponibilidade (lança quando true).
  - `createScanner(env): Scanner` — `MemoryScanner` em `test`; `ClamdScanner(env.CLAMAV_HOST, env.CLAMAV_PORT)` caso contrário.
  - Env: `CLAMAV_HOST` (default `127.0.0.1`), `CLAMAV_PORT` (default `3310`), `TURNSTILE_SECRET` (opcional), `PUBLIC_EMBED_ORIGINS` (lista separada por vírgula, opcional).
  - Harness expõe `scanner: MemoryScanner`.

- [ ] **Step 1: Write the failing tests**
  - `scanner.test.ts`: `MemoryScanner` → `clean` para PDF comum, `infected` para buffer com EICAR, lança com `failing = true`. `ClamdScanner` contra um servidor `net` falso no teste: responde `stream: OK\0` → `clean`; `stream: Eicar-Signature FOUND\0` → `infected`; servidor que não responde → rejeita em `timeoutMs = 200`.
  - `files.test.ts`: `LocalStorage.put` → `remove` → `read` rejeita; `remove` de chave inexistente não lança.
- [ ] **Step 2:** `npm test -w apps/api -- scanner files` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): antivírus (clamd) e remoção no armazenamento`

---

### Task 4: API pública — vagas e candidatura

**Files:**
- Create: `apps/api/src/modules/recruitment/public.routes.ts`, `apps/api/src/modules/recruitment/public.service.ts`, `apps/api/src/lib/turnstile.ts`
- Modify: `apps/api/src/db/client.ts` (`withPublic`), `apps/api/src/app.ts` (registro do prefixo `/api/public/v1`), `apps/api/src/modules/documents/documents.routes.ts` (extrair `readUpload` para `apps/api/src/lib/upload.ts` e reutilizar)
- Test: `apps/api/test/recruitment-public.test.ts`

**Interfaces:**
- Consumes: Task 1 (`applicationForm`), Task 2 (tabelas, funções SQL), Task 3 (`Storage`, nada de scan aqui).
- Produces:
  - `withPublic<T>(db, slug: string, fn: (tx: Tx, tenantId: string) => Promise<T>): Promise<T>` — transação que chama `public_tenant_id(slug)` (404 `not_found` "Página de vagas não encontrada." se null), fixa `app.tenant_id` e faz `set local role falcao_public`.
  - Rotas (rate limit próprio: GET 120/min, POST 10/min por IP):
    - `GET /api/public/v1/:slug/jobs` → `{ company: { name }, jobs: PublicJob[] }` só `visibility='public'` e `status='published'`, ordenado por `publishedAt desc`.
    - `GET /api/public/v1/:slug/jobs/:token` → `PublicJob & { questions, accepting: boolean }` (`accepting = status==='published'`); 404 se não existe.
    - `POST /api/public/v1/:slug/jobs/:token/applications` (multipart: campos de `applicationForm` + `answers` como JSON + `file`; Turnstile `cf-turnstile-response` quando `TURNSTILE_SECRET` definido) → 201 `{ ok: true }`.
  - `PublicJob = { token, title, city, state, workMode, contractType, departmentName, salary: { min, max } | null, description, requirements, benefits, publishedAt }` (salário só se `showSalary`).
  - Na candidatura: valida com `applicationForm`; `website` preenchido ou `Date.now() - startedAt < 3000` → responde 201 **sem gravar**; respostas obrigatórias faltando → 400; arquivo não-PDF → 400 "Envie o currículo em PDF."; duplicata (`public_application_exists`) → 409 "Você já se candidatou a esta vaga."; vaga não `published` → 409 "Esta vaga não está recebendo candidaturas.". Grava candidato, candidatura (`stage='new'`, `privacyToken` aleatório, `consentAt` se consentiu, `email` minúsculo), respostas, evento `null → new`, arquivo `scanStatus='pending'` (chave `recruitment/{tenantId}/{uuid}.pdf`). E-mail ao candidato (`mailer.send`): assunto "Recebemos sua candidatura: {título}", com link `${WEB_ORIGIN}/vagas/privacidade/{privacyToken}`. Notificação no sistema ao gestor da vaga e a usuários `hr`.

- [ ] **Step 1: Write the failing tests** (`recruitment-public.test.ts`; vagas criadas direto no banco como dono):
  - lista devolve a vaga pública publicada e **não** a não listada, a rascunho nem a da outra empresa;
  - detalhe por token da não listada funciona; por UUID → 404; slug inexistente → 404;
  - candidatura válida → 201, cria 1 candidato, 1 candidatura `new`, 1 arquivo `pending`, 1 e-mail no `MemoryMailer` com o link de privacidade;
  - **mesmo e-mail na mesma vaga (com maiúsculas diferentes) → 409** (Review Focus 1);
  - **vaga `paused` → detalhe com `accepting: false` e envio 409** (Review Focus 2);
  - honeypot preenchido → 201 e nada gravado; `startedAt` há 1 s → 201 e nada gravado;
  - arquivo EXE renomeado `.pdf` → 400;
  - nenhuma rota pública devolve campos de candidato (verificar o JSON das GETs não tem `email`/`phone`).
- [ ] **Step 2:** `npm test -w apps/api -- recruitment-public` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS; suíte inteira verde.
- [ ] **Step 5: Commit** `feat(api): página pública de vagas e candidatura`

---

### Task 5: Privacidade do candidato (excluir e renovar)

**Files:**
- Modify: `apps/api/src/modules/recruitment/public.routes.ts`, `public.service.ts`
- Test: `apps/api/test/recruitment-public.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/public/v1/privacy/:token/erase` → sempre 200 `{ ok: true }`; chama `public_erase_by_token` (como dono do banco, transação de sistema) e `storage.remove` de cada chave devolvida; registra auditoria `candidate.erased_by_request` sem dados pessoais.
  - `POST /api/public/v1/privacy/:token/renew` → sempre 200 `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**
  - erase com token válido apaga candidato, candidaturas, respostas e o arquivo do armazenamento (`storage.read` rejeita);
  - **erase com o mesmo token de novo e com token inventado → 200 idêntico** (Review Focus 5);
  - renew atualiza `consentAt` só onde havia consentimento.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): exclusão e renovação de consentimento pelo candidato`

---

### Task 6: Vagas internas (CRUD, situação, escopo do gestor)

**Files:**
- Create: `apps/api/src/modules/recruitment/jobs.routes.ts`, `jobs.service.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/recruitment.test.ts`

**Interfaces:**
- Produces (todas sob `/api/v1`):
  - `GET /jobs?status=` (`recruitment.read`; gestor só vê as suas) → `JobListItem[]` com contagem por etapa `{ counts: Record<ApplicationStage, number> }`, `hiredCount`, `openings`, `shareUrl` (`${WEB_ORIGIN}/vagas/{slug}/{token}`).
  - `POST /jobs` (`recruitment.manage`, body `jobInput`) → 201 `JobDetail` (status `draft`, `shareToken` gerado).
  - `GET /jobs/:id`, `PUT /jobs/:id` (`jobInput`; perguntas substituídas inteiras, respostas antigas mantidas por `question_id` set null não — perguntas com respostas não podem ser removidas: 409 "Esta pergunta já tem respostas.").
  - `POST /jobs/:id/status` `{ status: JobStatus }` — transições: draft→published; published↔paused; published|paused→closed; closed é final (400). `published` define `publishedAt`; `closed` define `closedAt` e calcula `retentionUntil = closedAt + retentionMonthsWithoutConsent` nas candidaturas **sem** consentimento e sem processo aberto.
  - Auditoria em criar, editar e mudar situação.

- [ ] **Step 1: Write the failing tests:** RH cria, publica, pausa e encerra; encerrar duas vezes → 400; gestor responsável lista só a sua vaga; gestor não cria (403); colaborador não lista (403); `PUT` removendo pergunta respondida → 409; encerrar preenche `retentionUntil` = `closedAt + 6 meses` só nas sem consentimento.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): vagas internas com escopo do gestor`

---

### Task 7: Candidaturas (quadro, etapas, notas, avaliação, currículo)

**Files:**
- Create: `apps/api/src/modules/recruitment/applications.routes.ts`, `applications.service.ts`
- Test: `apps/api/test/recruitment.test.ts`

**Interfaces:**
- Produces:
  - `GET /jobs/:id/applications` (`recruitment.read` + escopo) → `BoardCard[] = { id, stage, candidate: { id, fullName, city, state }, rating, createdAt, fileStatus: 'pending'|'clean'|'infected'|null, tags }`.
  - `GET /applications/:id` → `ApplicationDetail` com respostas (rótulo + valor), eventos, notas **desta** vaga, arquivo; para `hr`/`admin` inclui `candidate.cpf`, `candidate.email`, `candidate.phone` e `otherApplications: { id, jobTitle, stage, createdAt }[]`; para gestor omite `cpf` e `otherApplications` (e-mail e telefone visíveis, para contato).
  - `POST /applications/:id/stage` (`stageMove`) → grava evento; `rejected` exige motivo, grava `rejectionReason`, envia e-mail "Sobre sua candidatura: {título}" com texto padrão das configurações; voltar de `rejected` para etapa aberta é permitido e limpa o motivo.
  - `PATCH /applications/:id` `{ rating: 1..5 | null }`; `POST /applications/:id/notes` `{ body: 1..2000 }`.
  - `GET /candidate-files/:id/download` → `{ url }` (link temporário de `storage.downloadUrl`) só se `clean`; `pending` → 409 "O currículo ainda está em verificação de segurança."; `infected` → 410.
  - Gestor e RH podem mover etapas, avaliar e anotar nas vagas que enxergam.

- [ ] **Step 1: Write the failing tests:** mover `new→screening→interview` gera 2 eventos com autor; `rejected` sem motivo → 400; com motivo envia e-mail; `stage: 'hired'` → 400; download `pending` → 409, após marcar `clean` direto no banco → 200 com `url`; **gestor abrindo candidatura de vaga de outro gestor → 404** (Review Focus 4); gestor não recebe `cpf` nem `otherApplications`; RH recebe.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): quadro de candidaturas, notas e currículo verificado`

---

### Task 8: Contratação

**Files:**
- Modify: `applications.routes.ts`, `applications.service.ts`; `apps/api/src/modules/employees/employees.service.ts` (aceitar `hiredReason?: string` no evento `hired`)
- Test: `apps/api/test/recruitment.test.ts`

**Interfaces:**
- Consumes: `createEmployee(tx, ctx, input: EmployeeInput)` de `employees.service.ts`.
- Produces: `POST /applications/:id/hire` (`recruitment.manage` + `employees.create`; body `employeeInput`) → 201 `{ employeeId, suggestCloseJob: boolean }`. Em uma transação: exige etapa `offer` ou `interview` (senão 409 "Mova o candidato até Proposta antes de contratar."); cria o colaborador com evento `hired` motivo `Admissão via vaga {título}`; se o currículo estiver `clean`, cria documento do colaborador na categoria **"Currículo"** (criada se não existir: não sensível, visível ao colaborador, sem validade) reaproveitando a `storageKey`; incrementa `hiredCount`; `suggestCloseJob = hiredCount >= openings`; envia ao candidato o e-mail "Boas notícias sobre a vaga {título}" com `recruitment.hiredMessage`; apaga o candidato (cascata), **sem** remover o arquivo do armazenamento quando ele virou documento; auditoria `application.hired` com `employeeId` e `jobId`.
- Pré-preenchimento: a interface monta o `employeeInput` a partir do `ApplicationDetail` (nome, e-mail, telefone, CPF, cargo/departamento/unidade/contrato da vaga); a API não cria nada antes do envio.

- [ ] **Step 1: Write the failing tests:** contratar da etapa `new` → 409; da `offer` com CPF válido → 201, colaborador existe com evento "Admissão via vaga …", documento "Currículo" existe e baixa, candidato não existe mais, `hiredCount` = 1, `suggestCloseJob` true quando `openings = 1`; CPF já cadastrado → 409 vindo do cadastro e **nada** muda na candidatura (transação).
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): contratação gera colaborador e leva o currículo`

---

### Task 9: Banco de talentos

**Files:**
- Create: `apps/api/src/modules/recruitment/talent.routes.ts`, `talent.service.ts`
- Test: `apps/api/test/recruitment.test.ts`

**Interfaces:**
- Produces (`talent_pool.read`; edições com `recruitment.manage`):
  - `GET /candidates` (`candidateFilters`) → `Page<CandidateListItem>`; `q` busca em nome, e-mail e respostas; `consent='yes'` → só quem tem candidatura com consentimento vigente; item: `{ id, fullName, city, state, tags, lastApplicationAt, applications: number, consentUntil: string|null, duplicateOf: string[] }`.
  - `GET /candidates/:id` → ficha com dados, etiquetas, todas as candidaturas (vaga, etapa, datas, notas), arquivos.
  - `PATCH /candidates/:id` `{ tags: string[] (máx. 20, cada 1–40) }`.
  - `GET /candidates/:id/duplicates` → fichas da mesma empresa com o mesmo e-mail (minúsculo) ou CPF.
  - `POST /candidates/:id/merge` `{ sourceId }` → move candidaturas e arquivos da `source` para o `id`, mantém os dados de contato da candidatura mais recente, une etiquetas, apaga a `source`; auditoria.
  - `POST /candidates/:id/invite` `{ jobId }` (vaga `published`) → e-mail "A Falcão tem uma vaga para você: {título}" com o link da vaga; grava `invitedAt` na ficha (coluna em `candidates`, adicionar na Task 2 se faltar).

- [ ] **Step 1: Write the failing tests:** busca por cidade e etiqueta; `consent=yes` exclui quem não consentiu; duplicatas acham pelo e-mail em maiúsculas; merge deixa uma ficha com as 2 candidaturas e etiquetas unidas; convite para vaga `draft` → 400; gestor → 403 em `/candidates`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(api): banco de talentos com busca, junção e convite`

---

### Task 10: Worker — antivírus, retenção e renovação

**Files:**
- Create: `apps/api/src/automations/recruitment.ts`
- Modify: `apps/api/src/automations/automations.ts` (incluir no `runAutomations` e no `AutomationResult`), `apps/api/src/worker.ts` (passar `storage` e `scanner`; varredura de arquivos a cada **5 minutos**, demais a cada hora)
- Test: `apps/api/test/recruitment-automations.test.ts`

**Interfaces:**
- Produces:
  - `scanPendingFiles(db, storage, scanner, mailer, webOrigin): Promise<{ clean: number; infected: number; failed: number }>` — lê até 50 arquivos `pending` (sistema), `storage.read` → `scanner.scan`; `clean` marca; `infected` remove do armazenamento, marca, grava evento na candidatura ("Currículo removido: arquivo inseguro") e envia e-mail pedindo reenvio pelo link da vaga; erro do scanner mantém `pending` e conta em `failed`.
  - `purgeExpired(tx, tenantId, storage, today): Promise<number>` — apaga candidaturas com `retentionUntil < today` cuja etapa seja `rejected`/`hired` ou vaga `closed` (nunca processo aberto), remove arquivos órfãos do armazenamento, apaga candidatos sem candidaturas; auditoria `recruitment.purged` com a contagem.
  - `consentRenewals(tx, tenantId, outbox, today): Promise<number>` — candidaturas com consentimento vencendo em 30 dias recebem um e-mail único (marca em `automation_marks`, chave `consent-renewal:{applicationId}:{retentionUntil}`) com links de renovar e excluir. Consentimento em candidatura: `retentionUntil = consentAt + talentPoolMonths`.

- [ ] **Step 1: Write the failing tests:** arquivo com EICAR → removido, `infected`, e-mail enviado; PDF comum → `clean`; **`scanner.failing = true` → continua `pending`, `failed = 1`, e na rodada seguinte sem falha vira `clean`** (Review Focus 3); expurgo apaga candidatura recusada vencida, **mantém** candidatura vencida em `interview` de vaga aberta; renovação envia 1 e-mail e não repete na segunda rodada.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(worker): antivírus, expurgo e renovação de consentimento`

---

### Task 11: Interface pública (`/vagas`)

**Files:**
- Create: `apps/web/src/public/careers.tsx` (lista), `apps/web/src/public/job-page.tsx` (vaga + formulário), `apps/web/src/public/privacy.tsx`, `apps/web/src/public/public-api.ts`, `apps/web/src/public/public-frame.tsx` (cabeçalho com marca, tema, rodapé "Dados protegidos pela LGPD")
- Modify: `apps/web/src/router.tsx` (rotas `/vagas/$empresa`, `/vagas/$empresa/$token`, `/vagas/privacidade/$token` filhas do root, **sem** `appRoute`, com `lazyRouteComponent`)
- Test: `apps/web/src/public/public-api.test.ts`

**Interfaces:**
- Consumes: Task 4 e 5.
- Produces:
  - `publicApi.jobs(slug)`, `publicApi.job(slug, token)`, `publicApi.apply(slug, token, form: FormData)`, `publicApi.erase(token)`, `publicApi.renew(token)` — `fetch` em `/api/public/v1`, sem `credentials`, erros como `ApiError`.
  - Lista: busca por texto e filtros cidade/regime; cartões com título, local, regime, contrato; vazio "No momento não há vagas abertas. Cadastre-se no banco de talentos" (só se houver vaga pública aberta; senão apenas o texto).
  - Vaga: descrição, requisitos, benefícios, salário se houver; formulário com campos do `applicationForm`, perguntas, `FileInput` (accept `.pdf`), consentimentos com textos: "Autorizo o uso dos meus dados para este processo seletivo." (obrigatório) e "Quero fazer parte do banco de talentos da Falcão por até 2 anos." (opcional); honeypot invisível `website`; `startedAt` gravado na montagem; Turnstile carregado só se `import.meta.env.VITE_TURNSTILE_SITE_KEY` existir; sucesso troca o formulário por "Candidatura enviada" + aviso do e-mail.
  - Vaga com `accepting: false`: formulário substituído por "Esta vaga não está recebendo candidaturas."
  - Privacidade: dois botões (renovar / excluir) com confirmação; mensagem neutra depois.
  - O código destas rotas não importa `app-shell`, `lib/session` nem `auth-client`.

- [ ] **Step 1: Write the failing test** (`public-api.test.ts`, `fetch` simulado): `apply` envia `FormData` sem `credentials: 'include'`; 409 vira `ApiError` com a mensagem da API.
- [ ] **Step 2:** `npm test -w apps/web` → FAIL. **Step 3:** implementar telas e cliente.
- [ ] **Step 4:** `npm test -w apps/web` e `npm run build -w apps/web` → PASS; conferir no `vite build` que existe um chunk separado para `/vagas` e que ele não contém `better-auth`.
- [ ] **Step 5: Commit** `feat(web): página pública de vagas e privacidade do candidato`

---

### Task 12: Interface interna (vagas, quadro, candidato, contratação, banco de talentos, configurações)

**Files:**
- Create: `apps/web/src/pages/recruitment.tsx` (lista de vagas), `apps/web/src/pages/job-board.tsx` (quadro), `apps/web/src/features/job-form.tsx` (gaveta de vaga com perguntas), `apps/web/src/features/candidate-drawer.tsx`, `apps/web/src/features/hire-drawer.tsx` (usa `EmployeeForm` com valores iniciais), `apps/web/src/pages/talent-pool.tsx`
- Modify: `apps/web/src/components/navigation.ts` (seção "Gestão": "Recrutamento" `/recrutamento` ícone `BriefcaseBusiness`, permissão `recruitment.read`; "Banco de talentos" `/talentos` ícone `Contact`, `talent_pool.read`), `apps/web/src/router.tsx`, `apps/web/src/lib/types.ts`, `apps/web/src/features/employee-form.tsx` (prop `initial?: Partial<FormValues>`), `apps/web/src/pages/settings.tsx` (painel "Recrutamento": prazos de retenção, textos de e-mail de recusa e o trecho para embutir `<iframe src="{WEB_ORIGIN}/vagas/{slug}" …>` com botão copiar)
- Test: `e2e/recruitment.spec.ts`

**Interfaces:**
- Consumes: Tasks 6–9.
- Produces:
  - Lista de vagas: `DataTable` com título, situação (`Badge`), candidatos por etapa (mini barra), link copiável; ações Nova vaga, Publicar/Pausar/Encerrar.
  - Quadro: 5 colunas abertas + coluna "Recusados" recolhível; cartões com `Avatar`, cidade, nota (estrelas), selo "Em verificação" quando `fileStatus='pending'`; arrastar com `Draggable` (soltar sobre coluna chama `POST /stage`; atualização otimista revertida em erro; `Flip` reposiciona os cartões); teclado: menu "Mover para…" em cada cartão (acessível sem arrastar). Soltar em "Contratado" não existe como alvo; a coluna mostra o botão "Contratar" nos cartões de Proposta.
  - Gaveta do candidato: dados, respostas, currículo (botão baixar desabilitado com "Em verificação de segurança" se `pending`), linha do tempo de eventos, notas, nota 1–5, "Recusar" (pede motivo), "Contratar".
  - Banco de talentos: busca, filtros, etiquetas editáveis, aviso de duplicata com botão "Juntar fichas", "Convidar para vaga".
  - Quando `suggestCloseJob`, toast com ação "Encerrar vaga".

- [ ] **Step 1: Write the failing e2e** (`e2e/recruitment.spec.ts`, ambiente com seed): RH cria vaga com uma pergunta sim/não e publica; abre `/vagas/{slug}` sem login (contexto novo), candidata-se com PDF; volta logado, vê o cartão em "Novo" com "Em verificação"; move para Triagem pelo menu "Mover para…"; recusa outro candidato com motivo; o banco de talentos encontra o candidato por cidade.
- [ ] **Step 2:** `npm run test:e2e -- recruitment` → FAIL.
- [ ] **Step 3:** Implementar telas.
- [ ] **Step 4:** e2e → PASS; `npm run validate` verde; conferir telas em claro/escuro e 390 px.
- [ ] **Step 5: Commit** `feat(web): recrutamento, quadro de candidatos e banco de talentos`

---

### Task 13: Implantação e documentação

**Files:**
- Modify: `docs/DEPLOYMENT.md` (serviço `clamd` no EC2 ou container `clamav/clamav` com `freshclam`, porta 3310 só local; Caddy: em `/vagas*`, `Content-Security-Policy: frame-ancestors 'self' {PUBLIC_EMBED_ORIGINS}` e no resto `frame-ancestors 'none'`; rate limit/WAF para `/api/public/*`), `docs/DATABASE.md` (tabelas, role `falcao_public`, funções), `docs/SECURITY.md` (superfície pública, antivírus, retenção de candidatos), `docs/ROADMAP.md` (módulo 07 entregue; domínio próprio e antivírus nos envios internos como pendências), `.env.example` (`CLAMAV_HOST`, `CLAMAV_PORT`, `TURNSTILE_SECRET`, `PUBLIC_EMBED_ORIGINS`, `VITE_TURNSTILE_SITE_KEY`)
- Create: `docs/adr/0013-superficie-publica-recrutamento.md` (contexto, decisão: role separada + funções `SECURITY DEFINER` + token de vaga + antivírus obrigatório; alternativas descartadas: widget JS, API só pública, junção automática)
- Modify: `apps/api/src/db/demo-data.ts` (2 vagas e 6 candidaturas fictícias no seed DEMO; arquivos já `clean`)

- [ ] **Step 1:** Escrever os documentos e o seed.
- [ ] **Step 2:** `npm run validate` → verde; `npm run db:seed` num banco local cria as vagas DEMO.
- [ ] **Step 3: Commit** `docs: recrutamento — implantação, banco, segurança e ADR-0013`
