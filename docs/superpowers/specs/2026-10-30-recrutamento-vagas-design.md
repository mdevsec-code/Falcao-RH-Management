# Recrutamento, página de vagas e banco de talentos

Data: 30/10/2026. Primeiro projeto da paridade com o Bizneo HR (módulo 07 do mapa em `docs/PRODUCT_REQUIREMENTS.md`).

## 1. Intenção

A Falcão quer seguir tudo o que o Bizneo oferece e, além disso, ter a sua própria página de vagas embutida no site, onde pessoas de fora se candidatam sem conta no sistema. Toda candidatura vira uma ficha num **banco de talentos próprio**, que a Falcão quer manter para reaproveitar em outras vagas.

O recrutamento é o começo da paridade porque foi o pedido mais concreto e porque abre caminho para o onboarding (módulo 08): o candidato contratado vira colaborador sem redigitação.

**Sucesso:** o RH publica uma vaga em minutos, divulga o link (site, WhatsApp, redes), recebe candidaturas organizadas num quadro de etapas, encontra talentos antigos por busca e, ao contratar, o cadastro do colaborador já nasce preenchido.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**
- Vagas criadas e geridas pelo RH, públicas ou **não listadas** (só quem tem o link se candidata).
- Página pública de vagas, hospedada pelo Falcão RH, com endereço próprio e trecho de código para embutir em qualquer site.
- Formulário de candidatura curto, bom no celular, com currículo em PDF e perguntas extras por vaga.
- Quadro de etapas (kanban) por vaga, com notas, avaliação e histórico.
- Banco de talentos: uma ficha por pessoa, somando todas as candidaturas, com busca e etiquetas.
- Retenção e consentimento conforme a LGPD, com exclusão a pedido do candidato.
- Contratação gera o cadastro de colaborador pré-preenchido.

**Não objetivos (ficam para depois)**
- Triagem ou ranking por IA (o Bizneo tem; no Falcão RH só com revisão humana, numa etapa futura).
- Entrevistas por vídeo, chat ou WhatsApp integrados; agendamento com calendário externo.
- Publicação automática em portais (LinkedIn, Indeed, InfoJobs).
- Conta ou área logada do candidato (o candidato não faz login em nada).
- Onboarding em si (módulo 08); aqui só o gancho da contratação.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Qualquer endpoint público que permita ler dados de candidatos, de colaboradores ou de outra organização.
- Formulário que vire porta de spam ou de envio de arquivos maliciosos.
- Guardar currículos sem base legal, sem prazo ou sem caminho de exclusão.
- Página pública que pareça outro produto: deve ter a identidade da Falcão e o design system atual.

## 3. Restrições

- Arquitetura existente: monólito modular Fastify + Drizzle + PostgreSQL com RLS (ADR-0001, 0003, 0004, 0008). Toda tabela nova com `tenant_id` segue o checklist de `docs/DATABASE.md`: migração manual com RLS `tenant_isolation`, `GRANT` mínimos para `falcao_app`, FKs compostas por tenant, e **o teste de isolamento passa a cobrir as tabelas novas**.
- Hoje toda rota de `/api/v1` exige sessão (`authenticate`). As rotas públicas são uma superfície nova e ficam num prefixo separado, sem cookie de sessão.
- Arquivos: armazenamento privado existente (`lib/storage`, disco ou S3), validação de tipo pelo conteúdo (`lib/file-type`), limite `MAX_UPLOAD_BYTES`. Sem antivírus hoje (pendência conhecida); este projeto adiciona o ClamAV para os envios públicos (seção 6).
- Implantação: interface estática atrás de CloudFront e Caddy (`docs/DEPLOYMENT.md`); o serviço ClamAV e os cabeçalhos das rotas `/vagas` entram nessa infraestrutura.
- E-mail transacional existente (`lib/mailer`); automações agendadas no `worker` (ADR-0011).
- Perfis e permissões em código (ADR-0006), em `packages/contracts`.
- Interface: React + TanStack Router + design system atual (tokens, tema claro/escuro, sistema de movimento GSAP).
- LGPD: candidatos são titulares de dados; base legal para o banco de talentos é consentimento específico.

## 4. Abordagens consideradas

| Abordagem | Como funciona | Troca |
| --- | --- | --- |
| **1. Página hospedada pelo Falcão RH, com opção de embutir** (escolhida) | Páginas públicas no próprio app (ex.: `vagas.falcao.com.br` ou `/vagas/:empresa`), com o design system. O sistema gera um trecho de código (iframe responsivo) para colar em qualquer site, e o link direto serve para WhatsApp e redes. | Um só lugar para manter, mesma segurança e visual. No site, aparece como bloco embutido, não como parte nativa da página. |
| 2. Widget JavaScript que se desenha dentro do site | Script carregado pelo site renderiza as vagas com o CSS do site, buscando dados por API pública com CORS. | Integração visual maior, mas conflitos de estilo, CORS e manutenção a cada mudança do site. |
| 3. Só API pública | O site da Falcão programa a página inteira. | Liberdade total de design, mas a Falcão fica dependente de quem mantém o site. |

**Escolha:** abordagem 1, decidida pela Falcão em 30/10/2026. Motivo: independe de como o site é feito e o link direto favorece a divulgação de vagas de obra pelo celular.

## 5. O que foi decidido (com a Falcão)

### 5.1 Vaga
- Campos: título, departamento, unidade/obra, cargo (opcional, da estrutura), tipo de contrato, cidade/UF, regime (presencial/canteiro/híbrido), faixa salarial opcional (com opção de ocultar), descrição, requisitos, benefícios, número de posições, gestor responsável.
- **Perguntas extras** por vaga (texto curto, sim/não, múltipla escolha), com opção de obrigatória. Exemplo: "Tem NR-35 válida?".
- Visibilidade: **pública** (aparece na lista) ou **não listada** (só pelo link).
- Situação: rascunho → publicada → pausada (não aceita candidaturas, página informa) → encerrada.
- Cada vaga tem página própria e link para divulgar.

### 5.2 Página pública e candidatura
- Lista de vagas públicas com busca e filtros por cidade e área; página por vaga; identidade da Falcão; tema claro e escuro.
- Formulário: nome, e-mail, telefone, cidade/UF, CPF (opcional; ver 5.4), currículo em PDF, LinkedIn opcional, respostas às perguntas da vaga.
- Dois consentimentos separados: (a) obrigatório para a candidatura; (b) opcional para o banco de talentos.
- Confirmação por e-mail, com link para pedir exclusão dos dados.

### 5.3 Processo seletivo (dentro do Falcão RH)
- Quadro por vaga com etapas: **Novo → Triagem → Entrevista → Proposta → Contratado**, e **Recusado** como saída de qualquer etapa (com motivo).
- Arrastar entre etapas; cada movimento fica no histórico da candidatura (quem, quando, de onde para onde).
- Notas internas e avaliação (1 a 5) por candidatura; visíveis só para quem pode ver a vaga.
- Aviso ao candidato por e-mail nas mudanças que importam (recebida, recusada, contratada); textos padrão editáveis nas configurações.
- **Contratado** abre o cadastro de colaborador pré-preenchido com os dados do candidato, para o RH completar.

### 5.4 Banco de talentos
- **Uma ficha por pessoa**, identificada pelo e-mail (e pelo CPF, quando informado). Novas candidaturas se somam à mesma ficha: histórico de vagas, etapas alcançadas, notas, currículos (o mais recente em destaque).
- Busca por nome, cidade, área, cargo pretendido, respostas (ex.: NRs informadas) e **etiquetas** livres do RH.
- A partir da ficha, o RH **convida** a pessoa para uma vaga aberta (e-mail com o link da vaga).

### 5.5 Retenção e LGPD (proposta aceita pela Falcão; prazos editáveis nas configurações)
- **Sem consentimento ao banco de talentos:** dados usados só para a vaga; apagados **6 meses após o encerramento** da vaga.
- **Com consentimento:** ficha mantida por **2 anos**; o sistema pede renovação por e-mail perto do prazo e apaga se não houver resposta.
- **Exclusão a pedido:** link no e-mail de confirmação; o pedido apaga a ficha, as candidaturas e os arquivos.
- Contratados: os dados passam a viver no cadastro do colaborador e seguem a política de colaboradores; a ficha de candidato é encerrada.
- Expurgos executados pelo `worker`; cada expurgo registrado em auditoria sem os dados apagados.

### 5.6 Quem pode o quê
- **RH e Administrador:** tudo no recrutamento e no banco de talentos.
- **Gestor:** vê e movimenta candidaturas das vagas em que é gestor responsável; não vê o banco de talentos inteiro.
- **Colaborador:** sem acesso.

### 5.7 Construção
- Dentro do monorepo atual: módulo `recruitment` na API, tabelas novas com RLS, telas no app web com o design system. Sem serviço separado.

## 6. Decisões técnicas que o desenho fixa

- **Rotas públicas** num prefixo próprio (ex.: `/api/public/v1`), registradas fora do bloco com `authenticate`, sem cookies, com limite de requisições mais rígido que o global e validação Zod em tudo.
- **Organização identificada pelo endereço** (slug da empresa ou domínio configurado), nunca por parâmetro livre de ID. A resolução slug → tenant e a gravação da candidatura rodam numa transação de tenant (`withTenant`) com um contexto de sistema "público", com privilégios mínimos: as rotas públicas só **leem vagas publicadas/não listadas por slug** e **inserem** candidatos e candidaturas. Nenhuma rota pública lê dados de candidatos.
- **Vaga não listada** acessada por um token aleatório no link (não adivinhável), não pelo ID sequencial ou UUID da vaga.
- **Anti-spam:** limite por IP, campo-armadilha (honeypot), tempo mínimo de preenchimento e desafio anti-robô (Cloudflare Turnstile ou equivalente) ligável por configuração.
- **Currículo:** só PDF, conferido pelo conteúdo, tamanho máximo do sistema, guardado no armazenamento privado; download interno só por link temporário, como os documentos.
- **Antivírus obrigatório desde o lançamento (decidido pela Falcão em 30/10/2026).**
  - Todo arquivo enviado pelo público é verificado por um serviço ClamAV na infraestrutura da AWS antes de ser liberado.
  - O arquivo nasce como **"em verificação"**: o RH vê a candidatura, mas não baixa o currículo até ele ser marcado **"limpo"**.
  - Arquivo **"infectado"** é apagado do armazenamento, a candidatura recebe um aviso e o candidato é orientado por e-mail a reenviar.
  - Se o scanner estiver fora do ar, os arquivos ficam na fila (reprocessamento pelo `worker`) e nunca são liberados sem verificação.
  - O mesmo verificador pode cobrir depois os envios internos, encerrando a pendência conhecida, mas isso fica fora deste projeto.
- **Embutir:** a rota pública da interface permite ser exibida em iframe apenas pelos domínios cadastrados nas configurações (`frame-ancestors`), e o resto do app continua proibindo iframe.
- **Interface pública** carregada sem o código do app interno (rota separada, divisão de pacote), para abrir rápido no celular.

## 6.1 Decisões do redator (marcadas como "decisão do redator"; a Falcão pode rever)

1. **Junção de fichas nunca é automática pelo formulário público.** Cada candidatura guarda uma cópia dos dados enviados. Quando o e-mail ou o CPF coincidem com uma ficha existente, o sistema **sugere** a junção ao RH, que confirma com um clique. Motivo: sem login, qualquer pessoa poderia digitar o e-mail de outra e alterar a ficha dela. Se e-mail e CPF apontarem para fichas diferentes, o RH escolhe. Na junção, os dados de contato mais recentes passam a valer, e os anteriores ficam no histórico.
2. **Consentimento e retenção por candidatura.** O consentimento ao banco de talentos é registrado em cada candidatura, com data. Cada candidatura segue a sua regra: sem consentimento, é apagada 6 meses após o encerramento da vaga; com consentimento, vale por 2 anos **a partir da data do consentimento (ou da última renovação)**. A ficha da pessoa existe enquanto tiver alguma candidatura viva. Um consentimento posterior renova o prazo da ficha toda. Uma candidatura sem consentimento não revoga o consentimento dado antes. **Nada é apagado enquanto a candidatura estiver num processo em andamento** (etapa diferente de Recusado ou Contratado, com vaga não encerrada).
3. **Contratação é uma ação explícita.** O botão **"Contratar"** no cartão abre o formulário de novo colaborador **pré-preenchido no navegador**. O CPF passa a ser obrigatório nesse momento, como já é no cadastro. Ao salvar:
   - a candidatura vai para Contratado e se liga ao colaborador criado;
   - o currículo vira um documento do colaborador, na categoria "Currículo";
   - o histórico funcional registra "Admissão via vaga X";
   - a ficha de candidato é então apagada, pois os dados passam a viver no cadastro de colaborador.

   Arrastar o cartão para Contratado sem cadastrar não é permitido. Quando todas as posições da vaga forem preenchidas, o sistema **sugere** encerrá-la, mas não encerra sozinho.
4. **Endereço por caminho nesta etapa:** `/vagas/:empresa` (ex.: `/vagas/falcao`). Domínio próprio (`vagas.falcao.com.br`) fica para depois, por envolver DNS e certificado sob demanda. Os domínios autorizados a embutir a página ficam na **configuração de implantação** (variável de ambiente aplicada pelo proxy às rotas `/vagas`), não na tela de configurações. Motivo: hoje só a Falcão precisa embutir.
5. **Papel de banco separado para as rotas públicas** (`falcao_public`, sem login). Ele só lê vagas publicadas ou não listadas e só insere candidatos, candidaturas, respostas e arquivos. A busca slug → empresa é feita por uma função `SECURITY DEFINER` que devolve apenas o id da empresa ativa. Motivo: torna verificável em teste que as rotas públicas não leem dados pessoais.
6. **Acesso do gestor:** vê apenas as candidaturas das vagas em que é o gestor responsável, com currículo, respostas e notas **dessas** vagas. Não vê CPF, outras candidaturas da mesma pessoa, nem notas de outras vagas. O gestor responsável é um usuário com perfil Gestor, RH ou Administrador.

## 7. Deixado para quem constrói

- Modelo exato das tabelas (sugestão: `job_openings`, `job_questions`, `candidates`, `candidate_tags`, `applications`, `application_answers`, `application_events`, `application_notes`, `candidate_files`), índices e nomes.
- Novas permissões em `packages/contracts` (ex.: `recruitment.read`, `recruitment.manage`, `talent_pool.read`) e escopo do gestor.
- Desenho das telas internas (lista de vagas, editor de vaga, quadro, ficha do candidato, banco de talentos) e das públicas, seguindo o design system e o padrão de movimento atuais.
- Textos padrão dos e-mails.
- Como o kanban é implementado (o projeto já tem GSAP com Draggable e Flip registrados).
- Plano de testes: unidade, integração com RLS (incluindo isolamento das tabelas novas e a impossibilidade de leitura pelas rotas públicas) e ponta a ponta do fluxo candidatar → mover → contratar.
- Atualização de `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/ROADMAP.md` e uma ADR para a superfície pública.
