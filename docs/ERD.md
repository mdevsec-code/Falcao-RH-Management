# Diagrama entidade-relacionamento

Estado após as migrações `0000_init` e `0001_security`. Toda relação entre tabelas de domínio também é garantida por chave composta `(tenant_id, id)`, para impedir referências entre organizações.

```mermaid
erDiagram
  user ||--o{ session : "tem"
  user ||--o{ account : "credenciais"
  user ||--o| two_factor : "MFA"
  user ||--o{ memberships : "acessa"

  tenants ||--o{ memberships : "tem membros"
  tenants ||--o{ units : ""
  tenants ||--o{ cost_centers : ""
  tenants ||--o{ positions : ""
  tenants ||--o{ departments : ""
  tenants ||--o{ employees : ""
  tenants ||--o{ employee_events : ""
  tenants ||--o{ audit_logs : ""

  memberships }o--o| employees : "ficha vinculada"

  departments }o--o| departments : "subordinado a"
  departments }o--o| employees : "gestor"
  departments }o--o| units : "fica em"
  departments }o--o| cost_centers : "custeado por"

  employees }o--o| departments : "lotado em"
  employees }o--o| positions : "ocupa"
  employees }o--o| employees : "gestor direto"
  employees }o--o| units : "trabalha em"
  employees }o--o| cost_centers : "custeado por"
  employees ||--o{ employee_events : "histórico"

  tenants {
    uuid id PK
    text name
    text slug UK
    text cnpj
    jsonb settings
  }
  memberships {
    uuid id PK
    uuid tenant_id FK
    text user_id FK
    role role "admin | hr | manager | employee"
    membership_status status
    uuid employee_id FK
  }
  departments {
    uuid id PK
    uuid tenant_id FK
    text name
    uuid parent_id FK
    uuid manager_employee_id FK
    uuid unit_id FK
    uuid cost_center_id FK
  }
  employees {
    uuid id PK
    uuid tenant_id FK
    text registration "único por tenant"
    text full_name
    text social_name
    text cpf "único por tenant, restrito"
    date birth_date "restrito"
    jsonb address "restrito"
    date hire_date
    date termination_date
    contract_type contract_type
    employee_status status
  }
  employee_events {
    uuid id PK
    uuid tenant_id FK
    uuid employee_id FK
    employee_event type
    date effective_date
    jsonb before
    jsonb after
    text reason
    text actor_user_id FK
  }
  audit_logs {
    uuid id PK
    uuid tenant_id FK
    text actor_user_id
    text action
    text entity
    text entity_id
    text_array changed_fields
    text ip
  }
  units {
    uuid id PK
    uuid tenant_id FK
    text name
    text city
    text state
  }
  positions {
    uuid id PK
    uuid tenant_id FK
    text title
    text level
    text cbo
  }
  cost_centers {
    uuid id PK
    uuid tenant_id FK
    text code
    text name
  }
```

## Fase 5: documentos, solicitações e notificações

```mermaid
erDiagram
  employees ||--o{ documents : "possui"
  document_categories ||--o{ documents : "classifica"
  documents ||--|{ document_versions : "versões"
  employees ||--o{ requests : "solicita"
  requests ||--|{ request_steps : "etapas"
  request_steps }o--o| employees : "gestor que decide"
  requests }o--o| documents : "atestado anexo"
  departments ||--o{ approval_flows : "fluxo próprio"
  user ||--o{ notifications : "recebe"
  tenants ||--o{ automation_marks : "avisos dados"

  requests {
    uuid id PK
    uuid employee_id FK
    request_type type "vacation | absence"
    absence_kind absence_kind
    request_status status
    date start_date
    date end_date
    int days
  }
  request_steps {
    uuid id PK
    int position
    approver_kind approver_kind "manager | hr"
    step_status status
    text decided_by FK
    text comment
  }
  documents {
    uuid id PK
    uuid employee_id FK
    uuid category_id FK
    text title
    date expires_at
    int current_version
  }
  document_versions {
    uuid id PK
    int version
    text storage_key
    text mime_type "verificado pelo conteúdo"
    text sha256
  }
```

Saldo de férias não é tabela: é calculado a partir da admissão, das férias aprovadas ou pendentes e das faltas injustificadas (CLT art. 130), sempre igual ao que a regra diz.

Detalhes e ordem de entrega em [ROADMAP.md](ROADMAP.md).
