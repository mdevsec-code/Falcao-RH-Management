# ADR-0001: Monólito modular em monorepo

**Situação:** aceita, 29/10/2026

**Contexto.** São 14 módulos de RH que compartilham o mesmo cadastro de colaboradores e as mesmas permissões. A equipe é pequena e o produto é novo.

**Decisão.** Uma API e uma interface, organizadas por domínio (`modules/<domínio>/routes|service`), num monorepo npm workspaces com um pacote de contratos compartilhado. Módulos conversam por funções exportadas dos serviços, não pelas tabelas uns dos outros.

**Alternativas.** Microserviços por módulo: transações distribuídas, autorização duplicada, operação cara, sem ganho de escala hoje.

**Consequências.** Deploy único e transações locais. Se um módulo precisar escalar sozinho (ex.: relatórios), ele vira um worker que roda o mesmo código, não um serviço novo.
