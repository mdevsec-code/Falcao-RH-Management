# Decisões de tecnologia

Pesquisa e versões de outubro de 2026. Notas de 1 (pior) a 5 (melhor) para este produto: SaaS B2B, multi-tenant, dados pessoais, equipe pequena, usuários no Brasil. Preços de terceiros estão marcados como estimativa.

## Contexto que pesou

- A Falcão já mantém um ERP próprio em React + NestJS + Prisma + PostgreSQL numa VPS. Familiaridade conta, mas não decidiu sozinha.
- O sistema vive atrás de login: SEO e renderização no servidor não trazem ganho.
- Isolamento entre empresas e dados pessoais exigem controle fino sobre o SQL e as transações.

## Frontend

| Critério | React + Vite (SPA) | Next.js (App Router) | Vue + Vite | Nuxt |
| --- | --- | --- | --- | --- |
| Adequação a app autenticado | 5 | 3 | 5 | 3 |
| Simplicidade de deploy | 5 (estáticos) | 3 (servidor Node) | 5 | 3 |
| Ecossistema de componentes corporativos | 5 | 5 | 4 | 4 |
| Disponibilidade de profissionais no Brasil | 5 | 5 | 3 | 3 |
| Separação clara da API | 5 | 3 (tentação de lógica em server actions) | 5 | 3 |

**Escolha: React 19 + Vite**, com TanStack Router (rotas e parâmetros de busca tipados, essenciais para filtros de tabela), TanStack Query (estado do servidor), React Hook Form + Zod (formulários), Tailwind CSS 4 + Radix (design system próprio e acessível), Recharts (gráficos). Next.js perdeu porque seus pontos fortes (SSR, SEO, edge) não servem a um sistema interno, e misturar backend no framework de interface enfraqueceria a separação de camadas pedida. ADR-0002.

## Backend

| Critério | Fastify | NestJS | Hono | Rotas do Next.js |
| --- | --- | --- | --- | --- |
| Desempenho | 5 | 4 | 5 | 3 |
| Estrutura para monólito modular | 4 (convenção própria) | 5 | 3 | 2 |
| Validação e contratos tipados | 5 (Zod type provider) | 3 (class-validator) | 4 | 3 |
| Maturidade em Node no servidor | 5 | 5 | 4 | 4 |
| Peso e "mágica" | 5 (pouca) | 3 (decorators, DI) | 5 | 4 |
| Integração com Better Auth | 5 (documentada) | 3 | 5 | 5 |

**Escolha: Fastify 5 + Zod** com convenção de módulos (`routes` → `service`, ADR-0003). NestJS foi o segundo colocado e é usado no ERP; perdeu por depender de class-validator (duplicando os esquemas Zod que a interface usa) e pelo custo de DI/decorators sem benefício claro neste tamanho. A convenção de módulos fica documentada em ARCHITECTURE.md.

## Banco de dados

| Critério | PostgreSQL | MySQL 8 | MongoDB |
| --- | --- | --- | --- |
| Modelo relacional e integridade (FK compostas, CHECK) | 5 | 4 | 2 |
| Isolamento multi-tenant nativo (RLS) | 5 | 1 (não tem) | 2 |
| JSON quando necessário | 5 (jsonb) | 3 | 5 |
| Consultas analíticas (séries, janelas, CTE recursiva) | 5 | 4 | 3 |
| Oferta gerenciada no Brasil | 5 | 5 | 4 |

**Escolha: PostgreSQL 17.** O dado de RH é relacional por natureza (pessoa, vínculo, departamento, gestor, histórico) e a Row Level Security é o que permite isolar empresas no próprio banco. MongoDB não se justifica. ADR-0004.

### Provedor do PostgreSQL

| Critério | Amazon RDS | Supabase | Neon | Google Cloud SQL |
| --- | --- | --- | --- | --- |
| Região em São Paulo | Sim (sa-east-1) | Sim (sa-east-1) | Não confirmada na pesquisa | Sim (southamerica-east1) |
| Backup e restauração no tempo (PITR) | 5 | 4 (PITR é complemento pago) | 5 | 5 |
| Postgres "puro", sem acoplamento | 5 | 4 (bom, mas o valor está em Auth/Storage, que não usamos) | 5 | 5 |
| Alta disponibilidade (Multi-AZ) | 5 | 3 | 4 | 5 |
| Custo de entrada (estimativa) | ~US$ 25/mês (db.t4g.micro Single-AZ) | US$ 25/mês + computação | Por uso; computação suspensa causa "partida a frio" | Semelhante ao RDS |

**Recomendação: Amazon RDS for PostgreSQL 17 em sa-east-1.** Região no Brasil confirmada, PITR e criptografia em repouso (KMS) nativos, caminho direto para Multi-AZ e réplicas, e nenhuma dependência de recurso proprietário (é Postgres puro: dá para migrar para qualquer provedor com `pg_dump`). O Supabase é uma boa segunda opção se a Falcão preferir painel mais simples; não o escolhemos porque o diferencial dele (Auth, Storage) não é usado aqui. O Neon foi descartado por não haver confirmação de região em São Paulo e pela partida a frio. Fontes de preço: [Bytebase](https://www.bytebase.com/dbcost/rds/instance/db.t4g.micro/), [Sparecores](https://sparecores.com/database/aws/db.t4g.micro), [Supabase](https://supabase.com/pricing), [Neon](https://neon.com/pricing); todas a confirmar na calculadora oficial antes de contratar.

## ORM

| Critério | Drizzle | Prisma | TypeORM | Kysely |
| --- | --- | --- | --- | --- |
| Controle sobre SQL e transações (RLS por transação) | 5 | 3 | 3 | 5 |
| Migrações versionadas em SQL legível e editável | 5 | 4 | 3 | 3 |
| Tipagem | 5 | 5 | 3 | 5 |
| Testes com PostgreSQL em memória (PGlite) | 5 | 2 | 2 | 4 |
| Integração com Better Auth | 5 | 5 | 2 | 5 |

**Escolha: Drizzle ORM** (ADR-0008). Fixar `app.tenant_id` e trocar de role dentro de cada transação é natural no Drizzle; no Prisma exige extensões e cuidado com o pool. As migrações geradas são SQL comum, e as de segurança (RLS, FKs compostas, gatilhos) ficam em migrações SQL escritas à mão no mesmo fluxo.

**Estratégia de dados:**
- Migrações: `drizzle-kit generate` para o esquema + migrações SQL manuais para segurança; aplicadas por `npm run db:migrate` no deploy, nunca automaticamente pela API.
- Integridade: FKs, FKs compostas por tenant, `UNIQUE` por organização, `CHECK`, enums.
- Transações: toda escrita de domínio + auditoria na mesma transação.
- Seeds: só desenvolvimento, dados fictícios, bloqueado em produção.
- Backup: PITR do provedor (7 a 35 dias) + `pg_dump` diário exportado para outra conta/região (DEPLOYMENT.md).

## Autenticação e autorização

| Critério | Better Auth | Supabase Auth | Clerk | Keycloak | Auth.js |
| --- | --- | --- | --- | --- | --- |
| Dados de identidade no nosso banco (LGPD, portabilidade) | 5 | 3 | 1 (EUA) | 5 | 5 |
| MFA, convites, redefinição, sessões | 5 | 4 | 5 | 5 | 2 |
| SSO Google/Microsoft no futuro | 5 (plugins OAuth/SSO) | 4 | 5 | 5 | 4 |
| Custo por usuário | 0 | Incluído | Por usuário ativo | 0 (mas operação pesada) | 0 |
| Operação | Biblioteca, sem servidor extra | Atrelado ao Supabase | SaaS | Servidor Java dedicado | Feito para Next.js |

**Escolha: Better Auth** (ADR-0005), com e-mail e senha, MFA por TOTP, sessões em banco revogáveis e cadastro aberto desligado. **Autorização é nossa**: perfis e permissões em `packages/contracts`, escopo de dados no serviço e RLS no banco (ADR-0006). Keycloak é a alternativa se um cliente grande exigir IdP corporativo completo; o SSO entra por plugin sem trocar a base.

## Hospedagem

Resumo aqui; números e plano em [DEPLOYMENT.md](DEPLOYMENT.md).

| Critério | AWS sa-east-1 | Google Cloud SP | Azure Brazil South | Vercel + banco à parte | Render / Railway | VPS (Hostinger) |
| --- | --- | --- | --- | --- | --- | --- |
| Dados e computação no Brasil | 5 | 5 | 5 | 3 (funções em gru1; plataforma nos EUA) | 1 (sem região na América do Sul) | 4 |
| Banco gerenciado na mesma região | 5 | 5 | 5 | depende | 2 | 1 (autogerido) |
| Rede privada app ↔ banco | 5 | 5 | 5 | 2 | 2 | 1 |
| Custo de entrada | 3 | 3 | 3 | 4 | 4 | 5 |
| Caminho de crescimento | 5 | 5 | 5 | 3 | 3 | 2 |

**Recomendação: AWS sa-east-1** para tudo no MVP (aplicação, banco, arquivos, e-mail), em uma rede privada, ADR-0010. A VPS seria mais barata e a Falcão já a opera, mas obrigaria a autogerir o banco de dados pessoais (backup, PITR, criptografia, atualizações), que é exatamente o risco que não vale correr para economizar dezenas de reais por mês.

## Serviços complementares

| Serviço | Decisão | Por quê |
| --- | --- | --- |
| Fila e jobs | pg-boss (Fase 5) | Fila no próprio PostgreSQL, transacional; evita Redis no MVP |
| Redis / cache | Não no MVP | Sem gargalo que o justifique; rate limit em memória com uma instância. Entra com várias instâncias (ElastiCache) |
| Arquivos | Amazon S3 sa-east-1, bucket privado, URLs assinadas de curta duração (Fase 5) | Documentos pessoais nunca públicos |
| E-mail transacional | Amazon SES sa-east-1 | Mesma conta e região; custo por mensagem baixo |
| Monitoramento de erros | Sentry (ou equivalente) com scrubbing de dados pessoais | Erros com contexto, sem PII |
| Logs | Pino estruturado → CloudWatch Logs, com cookies e cabeçalhos de auth removidos | Já configurado na API |
| CI/CD | GitHub Actions: typecheck, testes, build, migrações no deploy | Próxima etapa |
| CDN | CloudFront na fase de crescimento | No MVP, o proxy serve estáticos com cache longo |
| PDF / Excel | Geração no worker (Fase 5/6) | Relatórios pesados fora do ciclo da requisição |
