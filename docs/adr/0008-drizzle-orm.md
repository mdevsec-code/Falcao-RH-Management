# ADR-0008: Drizzle ORM

**Situação:** aceita, 29/10/2026

**Contexto.** O RLS exige fixar configurações e trocar de role dentro de cada transação, e queremos testar contra um PostgreSQL real em memória.

**Decisão.** Drizzle ORM com `node-postgres` em produção e PGlite nos testes; migrações geradas por `drizzle-kit` mais migrações SQL manuais para segurança.

**Alternativas.** Prisma: ótima experiência, mas transações com configuração de sessão exigem extensões, e ele não roda sobre PGlite. TypeORM: tipagem fraca. Kysely: excelente, mas sem gerador de migrações.

**Consequências.** O Drizzle ainda está abaixo da 1.0; atualizações são feitas com os testes de integração como rede de segurança.
