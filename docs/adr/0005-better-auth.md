# ADR-0005: Better Auth para identidade

**Situação:** aceita, 29/10/2026

**Contexto.** Precisamos de login seguro, MFA, convites, redefinição de senha, sessões revogáveis e SSO Google/Microsoft no futuro, com os dados no Brasil.

**Decisão.** Better Auth como biblioteca dentro da API, tabelas no nosso PostgreSQL, adaptador Drizzle, plugin `twoFactor`. Cadastro aberto desligado. Convites criam a identidade e enviam um link para definir a senha, sem senha provisória.

**Alternativas.** Clerk: excelente produto, mas dados nos EUA e cobrança por usuário ativo. Supabase Auth: prende o projeto ao Supabase. Keycloak: completo, mas exige operar um servidor Java. Auth.js: pensado para Next.js e fraco em MFA.

**Consequências.** Biblioteca jovem: versão fixada por faixa e coberta por testes de integração (login, convite, sessão). A autorização não é delegada ao Better Auth (ADR-0006).
