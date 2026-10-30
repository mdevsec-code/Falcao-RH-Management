# Roadmap

## Fase 4: fundação (concluída)

Monorepo, design system, banco com RLS, autenticação, multi-tenancy, perfis e permissões, painel com dados reais, estrutura organizacional com organograma, cadastro e ficha de colaborador com histórico, portal do colaborador, gestão de usuários e auditoria.

## Fase 5: MVP operacional (concluída em 29/10/2026)

| Entrega | Situação |
| --- | --- |
| E-mail transacional por SMTP (Amazon SES ou outro) | Entregue; obrigatório em produção |
| Minha conta: MFA por TOTP com QR code e códigos de recuperação, troca de senha, aparelhos conectados | Entregue |
| MFA obrigatório por perfil, configurável pela organização | Entregue |
| Documentos: categorias com regras, armazenamento privado (disco ou S3), versões, validade, download por link temporário, envio pelo colaborador | Entregue |
| Solicitações e aprovações com fluxo configurável por tipo e departamento | Entregue |
| Férias com regras da CLT (art. 130, 134, 137), saldo, calendário em linha do tempo | Entregue |
| Ausências, com atestado médico restrito ao RH e ao titular | Entregue |
| Notificações no sistema e por e-mail | Entregue |
| Automações agendadas: documentos vencendo, aprovações paradas, férias perto do prazo | Entregue (processo `worker`) |
| Importação de colaboradores por planilha com prévia; exportação em Excel | Entregue |
| Configurações da organização | Entregue |
| Paleta de comandos (Ctrl+K), sistema de movimento, nova identidade visual | Entregue |
| CI no GitHub Actions | Entregue |

Verificação: 102 testes de unidade e integração (PostgreSQL real em memória, com RLS) e 15 testes ponta a ponta em três perfis.

### Pendências conhecidas da Fase 5

- Calendário de feriados: a regra de início de férias considera só o repouso semanal (domingo).
- Abono pecuniário (venda de 1/3 das férias) e férias coletivas.
- Criptografia em nível de coluna para dados de saúde (hoje só existe o tipo "atestado", sem CID; o arquivo fica em categoria sensível).
- Antivírus nos arquivos enviados (a validação de tipo pelo conteúdo já existe).
- Perfis customizáveis por empresa.
- Exportação em PDF dos relatórios.
- Busca assíncrona de gestor nos formulários para quadros acima de 100 pessoas.

## Fase 6: expansão

| Módulo | Observação |
| --- | --- |
| 10 Treinamentos | Prioridade alta numa construtora: NRs obrigatórias com validade, ligadas aos documentos que já vencem e avisam |
| 05 Jornada e escalas | Controle administrativo interno. Ponto legal só após validação jurídica (ADR-0009) |
| 08 Onboarding e offboarding | Checklists configuráveis ligados a documentos, treinamentos e acessos |
| 07 Recrutamento (ATS) | Kanban de etapas; triagem assistida por IA só com revisão humana |
| 11 Desempenho | Ciclos 90°/180°/360°, metas, PDI |
| 12 Comunicação | Comunicados segmentados com confirmação de leitura |
| 13 People Analytics | Horas extras, tempo de casa, custos por departamento; relatórios agendados em PDF |
| App/PWA para canteiro | Acesso por matrícula e código, sem e-mail corporativo |

## Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Tratar o controle de jornada como ponto legal | Autuação e passivo trabalhista | ADR-0009: só controle interno até validação jurídica |
| Vazamento entre empresas ao adicionar tabelas | Grave (LGPD) | Checklist em DATABASE.md; todo módulo novo estende o teste de isolamento |
| Dados de saúde sem proteção adequada | Grave (dado sensível) | Atestado restrito por perfil; CID e laudos só com criptografia por coluna |
| Regras de férias mal parametrizadas (feriados, acordos coletivos) | Pedidos recusados ou aceitos indevidamente | Regras atuais documentadas; calendário de feriados e parâmetros por CCT na próxima etapa |
| Dependência de bibliotecas jovens (Better Auth, Drizzle < 1.0) | Atualizações com quebra | Versões fixadas por faixa, testes de integração amplos |
| Tipos de resposta da API escritos à mão na interface | Divergência silenciosa | Mover esquemas de resposta para `packages/contracts` |

## Decisões que dependem da Falcão

| Decisão | Por que importa | Premissa adotada até lá |
| --- | --- | --- |
| Sistema de folha e integração (eSocial) | Formato de exportação e eventos | Falcão RH não calcula folha |
| Ponto: controle interno ou REP-P | Requisitos legais muito diferentes (Portaria 671) | Controle interno |
| Encarregado (DPO) e responsável por incidentes | Exigência da LGPD | A definir |
| Política de retenção de dados de ex-colaboradores | Expurgo automático | Proposta em SECURITY.md |
| Fluxos de aprovação reais por área | Configuração inicial | Férias: gestor e RH; ausência: gestor |
| Calendário de feriados e convenção coletiva aplicável | Regras de férias e jornada | Só repouso semanal no domingo |
| Acesso de colaboradores de obra sem e-mail | Portal para o canteiro | E-mail obrigatório |
| Conta AWS, domínio e orçamento | Deploy | Estimativa em DEPLOYMENT.md |
