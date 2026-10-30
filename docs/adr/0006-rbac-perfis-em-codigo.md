# ADR-0006: RBAC com perfis em código e escopo de dados

**Situação:** aceita, 29/10/2026

**Contexto.** Administrador, RH, Gestor e Colaborador veem coisas diferentes, e o gestor deve ver só a própria equipe.

**Decisão.** Permissões nomeadas (`employees.read`, `employees.read_sensitive`…) e a matriz perfil → permissões em `packages/contracts`, compartilhada por API e interface. Cada perfil tem um escopo de dados (`all`, `team`, `self`) aplicado nas consultas. Dados pessoais restritos são mascarados no serviço para quem não tem `employees.read_sensitive`.

**Alternativas.** Perfis em banco desde já: flexível, mas sem necessidade validada e mais difícil de testar.

**Consequências.** Mudar a matriz é um PR revisável e testado. Perfis customizáveis por empresa entram na Fase 5, gravados em banco sobre as mesmas permissões.
