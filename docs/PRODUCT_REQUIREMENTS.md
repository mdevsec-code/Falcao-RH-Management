# Requisitos do produto

## 1. Referência: Bizneo HR

Análise feita em 29/10/2026 sobre as páginas públicas em português (home, mapa do site, preços, controle de ponto, portal RH, gestão de documentos). As páginas de férias, recrutamento, treinamento, desempenho, analytics, permissões, onboarding e comunicação não foram lidas em detalhe; o que segue sobre elas vem das páginas gerais e está marcado.

**Organização.** O Bizneo vende "suítes" (Tempo, Gestão de equipes, Talento, Recrutamento, Treinamento, Finanças) sobre um núcleo comum chamado "Bizneo Essencial (Core RH)": ficha do colaborador, portal, documentos e assinatura, onboarding e pré-folha. Cada ferramenta funciona sozinha e o cliente começa por uma e adiciona outras. Os módulos se alimentam: o ponto gera a pré-folha, as ausências condicionam as escalas, os treinamentos concluídos entram na avaliação.

**Padrões que valem para o Falcão RH:**
- Núcleo único de colaborador, e módulos que se conectam a ele em vez de manter cadastros paralelos.
- Portal do colaborador e do gestor como superfície principal, com app e acesso sem e-mail corporativo (identificador e código gerados em massa). Relevante para a Falcão: boa parte do quadro está em canteiro, sem e-mail corporativo.
- Notificações encadeadas com escalonamento (colaborador, depois gestor).
- Correções de marcação de ponto que **não sobrescrevem** o registro original e guardam autor, data e motivo. O Falcão RH já segue esse princípio no histórico funcional e na auditoria.
- Permissões por perfil e por equipe; SSO Google/Microsoft; alerta de login em dispositivo desconhecido.

**Limites declarados pelo próprio Bizneo:** não calcula folha (prepara a pré-folha e integra com parceiros). Hospeda dados na União Europeia. Alega conformidade com a Portaria 671 (REP-C, REP-A, REP-P) para o ponto.

**O que não copiamos:** identidade visual, textos, imagens, código. A referência orienta organização de produto e fluxos.

## 2. Visão

Um lugar só para gestão de pessoas da Falcão, ligando RH, Departamento Pessoal, gestores de obra e colaboradores. Primeiro para a Falcão; a arquitetura multi-tenant permite atender outras empresas depois sem reconstrução.

**Diferenças de contexto que orientam o produto:**
- Construtora: quadro dividido entre sede e canteiros, alta rotatividade em obra, contratos temporários, exigências de segurança do trabalho (treinamentos obrigatórios com validade, como NR-35 e NR-18).
- Colaborador de obra usa celular, muitas vezes sem e-mail corporativo: o portal precisa funcionar bem no telefone e, no futuro, aceitar acesso por matrícula e código.
- A Falcão já opera outros sistemas próprios (ERP de Suprimentos, Saúde Ocupacional). Integração futura com Saúde Ocupacional (ASO, afastamentos) é natural.

## 3. Perfis e o que cada um faz

| Perfil | Objetivo principal | Vê |
| --- | --- | --- |
| Administrador | Configurar a plataforma, usuários e acessos | Tudo |
| RH / DP | Manter cadastros, estrutura, movimentações | Todos os colaboradores, com dados pessoais |
| Gestor | Acompanhar a equipe, aprovar solicitações (Fase 5) | A própria equipe, sem dados pessoais sensíveis |
| Colaborador | Consultar e atualizar os próprios dados, solicitar | Só o próprio cadastro |

## 4. Mapa de módulos

| # | Módulo | Fase | Situação |
| --- | --- | --- | --- |
| 01 | Painel e visão gerencial | 4 | Entregue (indicadores de pessoal); absenteísmo, férias e solicitações chegam com os módulos 05, 06 e 04 |
| 02 | Gestão de colaboradores | 4 | Entregue: cadastro, ficha, busca, filtros, histórico. Importação/exportação na Fase 5 |
| 03 | Estrutura organizacional | 4 | Entregue, com organograma |
| 04 | Portal do colaborador | 4/5 | Ficha, contatos, documentos, férias e ausências entregues; comunicados na Fase 6 |
| 14 | Administração | 4/5 | Convites, perfis, desativação, configurações, MFA obrigatório, fluxos de aprovação. Perfis customizáveis pendentes |
| 09 | Documentos | 5 | Entregue (assinatura eletrônica por integração pendente) |
| 06 | Férias, ausências e afastamentos | 5 | Entregue: solicitações, aprovações configuráveis, saldo pela CLT, calendário, notificações |
| 05 | Jornada e escalas | 6 | Planejado; ver restrição legal na seção 7 |
| 07 | Recrutamento (ATS) | 6 | Planejado |
| 08 | Onboarding e offboarding | 6 | Planejado |
| 10 | Treinamentos | 6 | Planejado; prioridade alta para NRs |
| 11 | Avaliação de desempenho | 6 | Planejado |
| 12 | Comunicação interna | 6 | Planejado |
| 13 | People Analytics | 6 | Planejado; base já existe no painel |

## 5. Fluxos principais (fundação)

**Entrada de uma pessoa no sistema.** Administrador convida (nome, e-mail, perfil, ficha vinculada) → a pessoa recebe link de 24 h → define a senha → entra. Não existe cadastro aberto nem senha provisória.

**Admissão.** RH cadastra o colaborador (dados pessoais e vínculo) → o sistema grava o evento "Admissão" no histórico e na auditoria → o colaborador aparece no painel, no organograma e na lista do gestor.

**Movimentação.** RH altera departamento, cargo ou gestor → cada mudança vira um evento próprio no histórico funcional; alterações cadastrais viram um evento "Atualização cadastral" com a lista de campos, sem os valores.

**Desligamento ou afastamento.** RH escolhe a nova situação, a data de vigência e o motivo (obrigatório) → a data de desligamento é gravada, o evento entra no histórico e o quadro do painel se ajusta. Rescisão, verbas e eSocial continuam no sistema de folha.

**Autoatendimento.** Colaborador entra pelo celular → vê a própria ficha e trajetória → atualiza telefone, e-mail, endereço e nome social. Cargo, departamento e datas só mudam pelo RH.

## 6. Requisitos funcionais da fundação

- RF01 Autenticação por e-mail e senha, com MFA por TOTP, redefinição de senha por link e sessões revogáveis.
- RF02 Convites por administrador; sem autocadastro.
- RF03 Uma pessoa pode pertencer a várias organizações e alternar entre elas.
- RF04 Perfis com permissões e escopo de dados aplicados no backend.
- RF05 CRUD de unidades, centros de custo, cargos e departamentos (com hierarquia sem ciclos e gestor).
- RF06 Organograma navegável com gestor e quadro por departamento.
- RF07 Cadastro de colaborador com validação de CPF, matrícula e CPF únicos por organização.
- RF08 Lista com busca (nome, nome social, matrícula, e-mail; CPF para quem pode ver CPF), filtros por situação e departamento, ordenação e paginação.
- RF09 Ficha individual com dados pessoais, vínculo e histórico funcional.
- RF10 Mudança de situação (ativo, afastado, desligado) com data de vigência e motivo.
- RF11 Portal do colaborador com atualização de contatos.
- RF12 Painel com indicadores calculados no banco, filtros por período, departamento e unidade.
- RF13 Auditoria de criações, alterações, visualizações de ficha, convites e mudanças de acesso.

## 7. Restrições e premissas

- **Controle de jornada ≠ ponto eletrônico legal.** O módulo de jornada da Fase 6 será, por padrão, um **controle administrativo interno** (escalas, banco de horas, ocorrências). Registro eletrônico de ponto com validade legal exige atender à Portaria MTP nº 671/2021 (REP-C, REP-A ou REP-P; para REP-P: registro do programa no INPI, AFD, comprovante ao trabalhador, Anexo IX) e às suas alterações (ex.: Portaria MTP nº 4.198/2022). Uma pesquisa feita em 29/10/2026 não encontrou alterações de 2025-2026, mas as fontes eram de terceiros: **é preciso validar o texto consolidado no gov.br com o jurídico da Falcão antes de decidir**. O sistema nunca vai se apresentar como ponto homologado sem esse trabalho. Ver ADR-0009.
- **Folha de pagamento** fica fora do escopo (como no Bizneo). O Falcão RH alimenta a folha; não a calcula.
- **eSocial** fica fora da fundação; eventos de admissão e desligamento são candidatos a integração depois que a Falcão definir o sistema de folha.
- **IA** não toma decisões trabalhistas. Usos futuros (resumos, triagem assistida, inconsistências) sempre com revisão humana.

## 8. Requisitos não funcionais

| Tema | Requisito |
| --- | --- |
| Segurança | Isolamento por empresa no banco (RLS) e na API; menor privilégio; auditoria imutável; ver SECURITY.md |
| Privacidade | Dados pessoais mascarados para quem não precisa deles; logs sem valores pessoais |
| Desempenho | Listas paginadas no banco; índices por tenant; bundle inicial da interface abaixo de 150 KB comprimidos (atual: 127 KB) |
| Disponibilidade | MVP: 99,5% (uma instância + banco gerenciado com backup e PITR). Crescimento: Multi-AZ |
| Acessibilidade | Navegação por teclado, foco visível, rótulos ligados a campos, contraste AA, respeito a movimento reduzido |
| Responsividade | Todas as telas usáveis a partir de 360 px de largura; verificado por teste E2E em perfil de celular |
| Idioma e fuso | pt-BR; datas de calendário no fuso de São Paulo |
| Testabilidade | Testes de integração contra PostgreSQL real, E2E com Playwright |

## 9. Decisões que dependem da Falcão

Listadas, com impacto, em [ROADMAP.md](ROADMAP.md#decisões-que-dependem-da-falcão).
