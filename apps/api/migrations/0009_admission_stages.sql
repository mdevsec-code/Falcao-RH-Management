-- Etapas de contratação da Falcão (pedido de 09/11/2026), escrito à mão.
-- Organizações existentes: as etapas padrão antigas são renomeadas (mantêm o
-- id, então candidaturas e histórico seguem ligados), as que faltam entram e
-- tudo é renumerado na ordem nova. Etapas criadas pelo RH ficam no fim.

-- A etapa inicial é protegida contra renomear; aqui é a própria migração.
ALTER TABLE recruitment_stages DISABLE TRIGGER recruitment_stages_protect_initial;
--> statement-breakpoint
UPDATE recruitment_stages SET name = 'Cadastro do candidato' WHERE is_initial AND name = 'Novo';
--> statement-breakpoint
UPDATE recruitment_stages s SET name = r.next
FROM (VALUES ('Entrevista', 'Entrevista/agendamento'), ('Proposta', 'Resultados da seleção')) AS r (previous, next)
WHERE s.name = r.previous
  AND NOT EXISTS (SELECT 1 FROM recruitment_stages o WHERE o.tenant_id = s.tenant_id AND lower(o.name) = lower(r.next));
--> statement-breakpoint
ALTER TABLE recruitment_stages ENABLE TRIGGER recruitment_stages_protect_initial;
--> statement-breakpoint
INSERT INTO recruitment_stages (tenant_id, name, position, is_initial)
SELECT t.id, d.name, 1000 + d.ord, false
FROM tenants t
CROSS JOIN (VALUES
  ('Triagem', 1), ('Entrevista/agendamento', 2), ('Teste prático', 3), ('Pesquisa de referência', 4),
  ('Exame admissional', 5), ('Solicitação de documentos', 6), ('Resultados da seleção', 7), ('Admissão', 8)
) AS d (name, ord)
WHERE NOT EXISTS (SELECT 1 FROM recruitment_stages s WHERE s.tenant_id = t.id AND lower(s.name) = lower(d.name));
--> statement-breakpoint
-- Posição única por organização é verificada no fim da transação (DEFERRABLE).
WITH ordered AS (
  SELECT s.id,
    row_number() OVER (
      PARTITION BY s.tenant_id
      ORDER BY CASE WHEN s.is_initial THEN 0 ELSE coalesce(d.ord, 100) END, s.position
    ) - 1 AS next_position
  FROM recruitment_stages s
  LEFT JOIN (VALUES
    ('triagem', 1), ('entrevista/agendamento', 2), ('teste prático', 3), ('pesquisa de referência', 4),
    ('exame admissional', 5), ('solicitação de documentos', 6), ('resultados da seleção', 7), ('admissão', 8)
  ) AS d (name, ord) ON d.name = lower(s.name)
)
UPDATE recruitment_stages s SET position = o.next_position FROM ordered o WHERE o.id = s.id AND s.position <> o.next_position;
