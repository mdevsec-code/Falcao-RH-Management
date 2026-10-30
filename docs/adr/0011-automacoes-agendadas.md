# ADR-0011: Automações agendadas em processo próprio, sem fila por enquanto

**Situação:** aceita, 29/10/2026. Ajusta o ADR-0007.

**Contexto.** As automações da Fase 5 são varreduras periódicas: documentos vencendo, aprovações paradas, férias perto do prazo legal. Não há trabalho disparado por evento que precise de fila.

**Decisão.** Um processo `worker` (o mesmo código da API) roda as varreduras a cada hora, por organização, dentro do RLS. Cada aviso dado é gravado em `automation_marks` com uma chave única (tipo, referência, faixa), então rodar de novo, ou em duas instâncias ao mesmo tempo, nunca duplica notificações. E-mails saem depois do commit.

**Alternativas.** pg-boss agora: traria uma fila sem uso real nesta fase. Cron do sistema operacional: espalha a lógica fora do código e dos testes.

**Consequências.** As automações são funções testadas diretamente (`runAutomations`). O pg-boss do ADR-0007 continua previsto para quando houver trabalho por evento: geração de relatórios pesados, integrações.
