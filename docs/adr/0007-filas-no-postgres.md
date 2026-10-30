# ADR-0007: Filas com pg-boss, sem Redis no MVP

**Situação:** aceita, 29/10/2026; implementação na Fase 5

**Contexto.** Automações (lembretes, vencimentos, relatórios) precisam de processamento assíncrono confiável.

**Decisão.** pg-boss sobre o próprio PostgreSQL, com jobs enfileirados na mesma transação dos dados (outbox). O worker é o mesmo código da API num segundo processo.

**Alternativas.** BullMQ + Redis: mais vazão, mas um serviço a mais para operar e sem transação com os dados. SQS: bom, mas sem atomicidade com o banco.

**Consequências.** O volume esperado (milhares de jobs por dia) cabe com folga no Postgres. Se passar a centenas por segundo, reavaliar.
