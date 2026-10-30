# Banco de dados

PostgreSQL 17 (mínimo 15, pelo `ON DELETE SET NULL (coluna)` das chaves compostas). Esquema em `apps/api/src/db/schema`, migrações em `apps/api/migrations`. Diagrama em [ERD.md](ERD.md).

## Migrações

| Arquivo | Origem | Conteúdo |
| --- | --- | --- |
| `0000_init.sql` | gerada (`npm run db:generate`) | Tabelas, enums, índices, FKs simples |
| `0001_security.sql` | escrita à mão | Role `falcao_app`, funções de contexto, privilégios, RLS, FKs compostas por tenant, `updated_at` automático, imutabilidade da auditoria |
| `0002_phase5.sql` | gerada | Documentos, solicitações e aprovações, fluxos, notificações, marcas de automação |
| `0003_phase5_security.sql` | escrita à mão | RLS, privilégios mínimos e FKs compostas das tabelas da Fase 5; versões de documento imutáveis |

Fluxo para mudar o esquema:
1. Altere `src/db/schema/*.ts`.
2. `npm run db:generate -- --name descricao` cria a migração SQL. Revise o arquivo.
3. Se a tabela nova tiver `tenant_id`, crie também uma migração manual (`npx drizzle-kit generate --custom --name rls_tabela`) com `ENABLE ROW LEVEL SECURITY`, a política `tenant_isolation`, os `GRANT` para `falcao_app` e as FKs compostas. **O teste de isolamento deve cobrir a tabela nova.**
4. `npm test` aplica tudo no PGlite. `npm run db:migrate` aplica no banco.

Migrações nunca são editadas depois de aplicadas em produção: corrige-se com uma nova.

## Tabelas

### Identidade (globais, do Better Auth)

| Tabela | Conteúdo |
| --- | --- |
| `user` | Pessoa que acessa o sistema: nome, e-mail, MFA ativo |
| `account` | Credenciais (hash de senha scrypt) e futuros provedores SSO |
| `session` | Sessões ativas, IP e navegador; revogáveis |
| `verification` | Tokens de redefinição de senha (uso único, 24 h) |
| `two_factor` | Segredo TOTP e códigos de recuperação |

A role `falcao_app` só lê `user(id, name, email, image)`. Credenciais e sessões ficam fora do alcance das consultas de domínio.

### Domínio (isoladas por `tenant_id`)

| Tabela | Conteúdo | Regras |
| --- | --- | --- |
| `tenants` | Organização: nome, slug, CNPJ, configurações | Leitura: a atual e as do usuário. Criação só por operação de sistema |
| `memberships` | Vínculo usuário ↔ organização: perfil, situação, ficha | Único por (organização, usuário) e por (organização, ficha) |
| `units` | Unidades (sede, canteiros) | Nome único por organização |
| `cost_centers` | Centros de custo | Código único por organização |
| `positions` | Cargos (título, nível, CBO) | Único por (organização, título, nível) |
| `departments` | Departamentos com hierarquia (`parent_id`) e gestor | Nome único; sem ciclos (verificado no serviço por CTE recursiva); não exclui com filhos (`RESTRICT`) nem com pessoas ativas |
| `employees` | Ficha do colaborador | Matrícula e CPF únicos por organização; não é gestor de si mesmo |
| `employee_events` | Histórico funcional (antes/depois, vigência, motivo, autor) | Somente inclusão |
| `audit_logs` | Auditoria | Somente inclusão; imutável até para o dono das tabelas |
| `document_categories` | Categorias com regras: visível no portal, envio pelo colaborador, sensível, exige validade | Nome único por organização |
| `documents` | Documento de uma pessoa (ou da empresa), validade, versão atual, situação | Categoria e colaborador da mesma organização (FK composta) |
| `document_versions` | Cada arquivo enviado: chave no armazenamento, nome, tipo verificado pelo conteúdo, tamanho, SHA-256 | Somente inclusão; nada é sobrescrito |
| `requests` | Férias e ausências: período, dias corridos, situação | `CHECK` de período válido e de tipo de ausência coerente |
| `request_steps` | Etapas de aprovação (gestor, RH), quem decidiu, quando e comentário | Uma por posição |
| `approval_flows` | Fluxo por tipo de solicitação, padrão da organização ou por departamento | Único por (organização, tipo, departamento), com `NULLS NOT DISTINCT` |
| `notifications` | Avisos no sistema | Cada pessoa só lê e marca as próprias (RLS por usuário) |
| `automation_marks` | O que as automações já avisaram | Único por (organização, tipo, referência, faixa): impede aviso duplicado |

## Segurança no banco

- **`app_tenant_id()` / `app_user_id()`**: leem `current_setting` da transação; vazio → `NULL` → nenhuma linha.
- **`falcao_app`**: role `NOLOGIN`, não é dona de nada, então o RLS sempre se aplica. A API conecta com o usuário dono e faz `SET LOCAL ROLE falcao_app` em cada transação de domínio (`withTenant`/`withUser`). Operações de sistema (migração, seed, provisionamento de organização) rodam como dono, fora do RLS, e nunca são expostas por HTTP.
- **Privilégios mínimos**: `employee_events` e `audit_logs` só aceitam `INSERT` e `SELECT`; `tenants` só `SELECT` e `UPDATE`.
- **FKs compostas** `(tenant_id, coluna)` → `(tenant_id, id)` em todas as referências internas.
- **Gatilho `forbid_audit_change`**: bloqueia `UPDATE`/`DELETE` em `audit_logs` e `UPDATE` em `employee_events`. O expurgo da política de retenção usa `SET LOCAL app.audit_purge = 'on'` num job de sistema.

## Índices

- Unicidade por organização (matrícula, CPF, nomes, códigos).
- `employees (tenant_id, status)` para o painel e filtros; `department_id`, `manager_id` para escopo de gestor.
- GIN `to_tsvector('simple', full_name)` preparado para busca textual; a busca atual usa `ILIKE` e será migrada quando o volume pedir (`pg_trgm`).
- `employee_events (employee_id, effective_date)`; `audit_logs (tenant_id, created_at)`.

## Dados pessoais armazenados

| Campo | Classificação LGPD | Tratamento |
| --- | --- | --- |
| Nome, matrícula, e-mail, cargo, departamento | Pessoal | Visível conforme escopo do perfil |
| CPF, data de nascimento, telefone, endereço | Pessoal, de acesso restrito | Mascarado sem `employees.read_sensitive`; visível ao titular |
| Nome social | Pessoal | Exibido no lugar do nome civil em toda a interface |
| Ausência do tipo "atestado médico" e arquivos da categoria sensível | **Sensíveis (art. 5º, II)** | O tipo e as observações só aparecem ao RH e ao titular; o gestor vê "ausência justificada". Arquivos sensíveis: só RH e titular, download auditado |
| CID, laudos, biometria, dados sindicais | **Sensíveis** | **Não armazenados.** Só com criptografia em nível de coluna (ROADMAP.md) |

## Backup e restauração

- PITR do provedor (RDS: retenção de 7 dias no MVP, 35 no crescimento) e snapshots automáticos criptografados.
- `pg_dump` diário em formato custom, criptografado, copiado para outra conta AWS (proteção contra exclusão acidental ou conta comprometida).
- Teste de restauração mensal num banco temporário, com o resultado registrado. Backup sem restauração testada não conta.
- Procedimento completo em [DEPLOYMENT.md](DEPLOYMENT.md#backup-e-recuperação-de-desastres).
