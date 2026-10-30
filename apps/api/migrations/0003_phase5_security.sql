-- Segurança das tabelas da Fase 5 (ADR-0004): mesmo modelo de 0001_security.

-- ---------- privilégios ----------

GRANT SELECT, INSERT, UPDATE, DELETE
  ON document_categories, documents, requests, request_steps, approval_flows
  TO falcao_app;
--> statement-breakpoint
-- Versões de documento: somente inclusão. Arquivo enviado nunca é sobrescrito.
GRANT SELECT, INSERT ON document_versions TO falcao_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notifications TO falcao_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON automation_marks TO falcao_app;
--> statement-breakpoint

-- ---------- Row Level Security ----------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_categories', 'documents', 'document_versions', 'requests', 'request_steps', 'approval_flows', 'automation_marks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO falcao_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- Notificações: cada pessoa só lê e marca as próprias. Qualquer ação da
-- organização pode criar notificações para outras pessoas da mesma organização.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_read ON notifications FOR SELECT TO falcao_app
  USING (tenant_id = app_tenant_id() AND user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notification_update ON notifications FOR UPDATE TO falcao_app
  USING (tenant_id = app_tenant_id() AND user_id = app_user_id())
  WITH CHECK (tenant_id = app_tenant_id() AND user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notification_insert ON notifications FOR INSERT TO falcao_app
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = notifications.tenant_id AND m.user_id = notifications.user_id)
  );
--> statement-breakpoint

-- ---------- integridade entre tenants ----------

ALTER TABLE document_categories ADD CONSTRAINT document_categories_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE documents ADD CONSTRAINT documents_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE requests ADD CONSTRAINT requests_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE documents
  ADD CONSTRAINT documents_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT documents_category_same_tenant_fk FOREIGN KEY (tenant_id, category_id)
    REFERENCES document_categories (tenant_id, id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE document_versions
  ADD CONSTRAINT document_versions_document_same_tenant_fk FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE requests
  ADD CONSTRAINT requests_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT requests_document_same_tenant_fk FOREIGN KEY (tenant_id, document_id)
    REFERENCES documents (tenant_id, id) ON DELETE SET NULL (document_id),
  ADD CONSTRAINT requests_period_valid CHECK (end_date >= start_date AND days > 0),
  ADD CONSTRAINT requests_absence_kind_matches CHECK ((type = 'absence') = (absence_kind IS NOT NULL));
--> statement-breakpoint
ALTER TABLE request_steps
  ADD CONSTRAINT request_steps_request_same_tenant_fk FOREIGN KEY (tenant_id, request_id)
    REFERENCES requests (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT request_steps_approver_same_tenant_fk FOREIGN KEY (tenant_id, approver_employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE SET NULL (approver_employee_id);
--> statement-breakpoint
ALTER TABLE approval_flows
  ADD CONSTRAINT approval_flows_department_same_tenant_fk FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT approval_flows_steps_not_empty CHECK (cardinality(steps) BETWEEN 1 AND 2);
--> statement-breakpoint

-- ---------- updated_at e imutabilidade ----------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_categories', 'documents', 'requests', 'approval_flows']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE TRIGGER document_versions_immutable BEFORE UPDATE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
