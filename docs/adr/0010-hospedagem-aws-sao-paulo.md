# ADR-0010: Hospedagem na AWS São Paulo

**Situação:** proposta, 29/10/2026. Depende de conta, domínio e orçamento da Falcão.

**Contexto.** Usuários no Brasil, dados pessoais de trabalhadores, equipe pequena para operar infraestrutura.

**Decisão proposta.** AWS sa-east-1 para aplicação (EC2 no MVP, ECS Fargate no crescimento), banco (RDS PostgreSQL com PITR e criptografia), arquivos (S3 privado) e e-mail (SES), em rede privada. Custo estimado: ~US$ 60/mês no MVP e ~US$ 340/mês no crescimento (DEPLOYMENT.md).

**Alternativas.** VPS da Falcão com banco local: ~US$ 45/mês mais barata, mas com o banco de dados pessoais autogerido. Render e Railway: sem região na América do Sul. Vercel: bom para a interface, mas a API e o banco ficariam em outro lugar. Google Cloud e Azure: equivalentes técnicos; a escolha é por familiaridade e preço.

**Consequências.** O código não depende de serviço proprietário (Postgres puro, S3 compatível, SMTP), então a troca de provedor continua possível.
