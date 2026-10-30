# ADR-0003: Fastify + Zod em vez de NestJS

**Situação:** aceita, 29/10/2026

**Contexto.** Os mesmos esquemas de validação precisam valer na interface e na API. O ERP da Falcão usa NestJS.

**Decisão.** Fastify 5 com `fastify-type-provider-zod`; esquemas vindos de `@falcao-rh/contracts`. Estrutura de módulos por convenção (ARCHITECTURE.md), permissões por `preHandler`.

**Alternativas.** NestJS: estrutura pronta e familiar à Falcão, mas a validação por class-validator duplicaria os esquemas Zod, e DI/decorators adicionam complexidade sem retorno neste tamanho. Hono: excelente, mas o ecossistema de plugins de servidor Node (helmet, rate limit, multipart) é mais maduro no Fastify.

**Consequências.** As convenções de módulo são mantidas por revisão de código, já que o framework não as impõe.
