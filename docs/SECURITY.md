# Segurança e LGPD

## Controles implementados

| Ameaça | Controle | Onde |
| --- | --- | --- |
| Acesso a dados de outra empresa | RLS por `tenant_id`, role `falcao_app`, FKs compostas, filtro explícito em vínculos; testes de isolamento | `0001_security.sql`, `http/context.ts`, `test/tenant-isolation.test.ts` |
| Acesso além do perfil | Permissões por perfil checadas no backend; escopo de dados (empresa, equipe, si mesmo) nas consultas | `packages/contracts/src/permissions.ts`, `employees.service.ts` |
| Exposição desnecessária de dados pessoais | CPF mascarado, nascimento, telefone e endereço ocultos sem `employees.read_sensitive`; aniversariantes sem ano; busca por CPF só para quem vê CPF | `employees.service.ts`, `dashboard.service.ts` |
| Força bruta de senha | Limite de tentativas: login 5/min, redefinição 3/5 min, TOTP 5/min, API 300/min por IP | `auth/auth.ts`, `app.ts` |
| Roubo de sessão | Cookies `HttpOnly`, `Secure` em produção, `SameSite=Lax`, prefixo próprio; sessão de 12 h; sessões revogadas ao redefinir senha | `auth/auth.ts` |
| CSRF | Cookies `SameSite=Lax` + verificação de origem do Better Auth (`trustedOrigins`) + API só aceita JSON | `auth/auth.ts`, `app.ts` |
| XSS | React escapa o conteúdo; a API responde com CSP `default-src 'none'`; nenhum HTML vindo do usuário é renderizado | `app.ts` (Helmet) |
| SQL injection | Consultas parametrizadas (Drizzle e `sql` template); nenhuma concatenação de entrada | toda a API |
| Entrada malformada | Esquemas Zod em todas as rotas; limite de corpo de 1 MB | `packages/contracts`, `app.ts` |
| Senha fraca ou reaproveitada pelo sistema | Mínimo de 10 caracteres; sem senha provisória (convite por link de uso único, 24 h) | `auth/auth.ts`, `users.service.ts` |
| Conta sem segundo fator | MFA por TOTP disponível (tela de ativação na próxima etapa; obrigatoriedade por perfil configurável depois) | `auth/auth.ts` |
| Adulteração de histórico | Auditoria e histórico funcional somente inclusão, protegidos por gatilho até contra o dono das tabelas | `0001_security.sql` |
| Vazamento por logs | Logs não gravam cookies nem cabeçalhos de autenticação; auditoria guarda nomes de campos, não valores | `server.ts`, `lib/audit.ts` |
| Mensagens de erro reveladoras | Erros internos viram 500 genérico; o detalhe só vai para o log | `app.ts` |
| Enumeração de contas | "Esqueci minha senha" responde igual exista ou não a conta | `pages/login.tsx`, Better Auth |
| Segredos no repositório | `.env` no `.gitignore`; `.env.example` sem valores; seed exige credenciais por variável | raiz |
| Arquivo malicioso disfarçado | Tipo verificado pela assinatura do conteúdo (PDF, PNG, JPEG, WEBP, DOCX, XLSX), não pela extensão; limite de 10 MB; nome higienizado | `lib/file-type.ts` |
| Documento acessível por URL pública | Nada em diretório público: download só por link assinado de 5 minutos, emitido após checar permissão; no S3, URL pré-assinada; cada download auditado | `lib/storage.ts`, `documents.service.ts` |
| Arquivo sobrescrito ou adulterado | Cada envio é uma versão nova com SHA-256; versões são imutáveis no banco; S3 com `IfNoneMatch` e criptografia no servidor | `0003_phase5_security.sql`, `lib/storage.ts` |
| Exposição de dado de saúde | Atestado: tipo e observações ocultos para o gestor, inclusive no e-mail de aprovação; categorias sensíveis só para RH e titular | `requests.service.ts`, `documents.service.ts` |
| Autoaprovação | Ninguém decide o próprio pedido, nem o RH; o RH decidir no lugar do gestor fica marcado na auditoria | `requests.service.ts` |
| Conta privilegiada sem MFA | MFA obrigatório configurável por perfil; enquanto não ativa, a pessoa só acessa a própria conta | `http/context.ts`, Configurações |
| E-mail sobre algo que não aconteceu | E-mails ficam numa caixa de saída e só saem depois do commit | `lib/notify.ts` |

## A implementar (com dono e fase)

| Item | Fase |
| --- | --- |
| Antivírus nos arquivos enviados (ex.: ClamAV no worker) | 6 |
| Criptografia em nível de coluna para CID e laudos, com chave no KMS | Antes de armazenar CID |
| Alerta de login de dispositivo novo (a tela de aparelhos conectados já existe) | 6 |
| Rate limit compartilhado (Redis) quando houver mais de uma instância | Crescimento |
| Varredura de dependências e SAST no CI | 5 |
| Teste de invasão externo antes de atender outra empresa | Antes do 2º tenant |
| Política de senhas vazadas (checagem contra base de senhas comprometidas) | 5 |

## Dependências com aviso conhecido

`npm audit` aponta um alerta moderado em uma versão antiga do `esbuild` (GHSA-67mh-4wv8-2f99) que vem apenas como dependência de desenvolvimento do `drizzle-kit`. Ele afeta o servidor de desenvolvimento do esbuild, que o projeto não usa, e não entra no build de produção. Reavaliar a cada atualização do `drizzle-kit`.

## LGPD

### Papéis

A Falcão é **controladora** dos dados dos seus colaboradores. Se o Falcão RH vier a atender outras empresas, o operador da plataforma passa a ser **operador** para elas, com contrato de tratamento (DPA) e lista de suboperadores (AWS, provedor de e-mail, monitoramento).

### Bases legais (art. 7º e 11): por finalidade, não por consentimento

Consentimento é frágil numa relação de emprego (há desequilíbrio entre as partes e ele pode ser revogado). As bases a validar com o jurídico/DPO da Falcão:

| Finalidade | Base legal provável |
| --- | --- |
| Cadastro, vínculo, jornada, férias, desligamento, obrigações trabalhistas e previdenciárias | Cumprimento de obrigação legal (art. 7º, II) e execução de contrato (art. 7º, V) |
| Dados de saúde para afastamentos e ASO | Art. 11, II, "a" (obrigação legal) e "f" (tutela da saúde, por profissional de saúde) |
| Organograma, comunicação interna, indicadores de gestão | Legítimo interesse (art. 7º, IX), com teste de balanceamento documentado |
| Aniversariantes no painel | Legítimo interesse com opção de o colaborador não aparecer (a implementar) |
| Recrutamento (candidatos) | Procedimentos preliminares de contrato (art. 7º, V) e, para banco de talentos, consentimento específico |

### Princípios aplicados no sistema

- **Necessidade e minimização:** só os campos que a operação usa; dados de saúde e biometria fora da fundação; o painel mostra agregados e, nos aniversários, só dia e nome.
- **Acesso por necessidade:** gestor vê a equipe sem dados pessoais restritos; colaborador vê só o próprio cadastro.
- **Transparência e direitos do titular:** o portal mostra ao colaborador tudo o que há sobre ele e permite corrigir contatos. Exportação dos próprios dados e registro de solicitações de titular entram na Fase 5.
- **Segurança e prevenção:** controles da tabela acima; auditoria de quem viu cada ficha.
- **Responsabilização:** trilha de auditoria imutável; ADRs registram as decisões.

### Retenção (proposta, a validar com o jurídico)

| Dado | Retenção sugerida | Motivo |
| --- | --- | --- |
| Ficha e histórico de ex-colaborador | Prazo prescricional trabalhista e previdenciário aplicável (validar; documentos de FGTS e previdência têm prazos longos) | Defesa em processos e fiscalização |
| Auditoria | 5 anos | Responsabilização |
| Candidatos não contratados | 6 a 12 meses, salvo consentimento para banco de talentos | Minimização |
| Sessões e tokens | Até expirar | Necessidade |

O expurgo será um job de sistema (Fase 5) com registro do que foi eliminado.

### Incidentes

Registro de incidentes, avaliação de risco e comunicação à ANPD e aos titulares nos prazos da Resolução CD/ANPD nº 15/2024. O plano de resposta precisa de um responsável nomeado pela Falcão (ver decisões pendentes no ROADMAP).
