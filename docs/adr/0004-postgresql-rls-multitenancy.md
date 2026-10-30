# ADR-0004: PostgreSQL com RLS em esquema compartilhado

**Situação:** aceita, 29/10/2026

**Contexto.** A plataforma deve atender várias empresas sem nenhum acesso cruzado, e os dados são pessoais.

**Decisão.** Um banco PostgreSQL, `tenant_id` em toda tabela de domínio, Row Level Security aplicada à role `falcao_app`, que a API assume em cada transação (`SET LOCAL ROLE`) depois de fixar `app.tenant_id`. Chaves estrangeiras compostas `(tenant_id, id)` impedem referências entre empresas, porque a checagem de FK ignora o RLS. Sem `FORCE ROW LEVEL SECURITY`: o dono das tabelas fica reservado a operações de sistema (migração, provisionamento), nunca expostas por HTTP.

**Alternativas.** Banco por cliente: isolamento físico, mas custo e operação multiplicados e migrações N vezes. Esquema por cliente: os mesmos problemas, em menor grau. Só filtro na aplicação: um `WHERE` esquecido vaza dados.

**Consequências.** Toda tabela nova com `tenant_id` precisa de política, privilégios e FKs compostas numa migração de segurança, e entra no teste de isolamento. Serviços nunca recebem o pool, só a transação já presa à organização.
