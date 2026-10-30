-- Segurança do banco (ADR-0004): role da aplicação, Row Level Security,
-- integridade entre tenants e trilhas append-only.
--
-- Modelo: a aplicação conecta com o usuário dono das tabelas (migrações) e,
-- em toda transação de domínio, executa `SET LOCAL ROLE falcao_app`. Essa role
-- não é dona de nada, então o RLS sempre se aplica a ela; sem `app.tenant_id`
-- definido ela não enxerga nenhuma linha.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'falcao_app') THEN
    CREATE ROLE falcao_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT falcao_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO falcao_app;
--> statement-breakpoint

-- ---------- contexto da requisição ----------

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_id(), app_user_id() TO falcao_app;
--> statement-breakpoint

-- ---------- privilégios ----------

GRANT SELECT, INSERT, UPDATE, DELETE
  ON units, cost_centers, positions, departments, employees, memberships
  TO falcao_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON tenants TO falcao_app;
--> statement-breakpoint
-- Históricos e auditoria: só inclusão e leitura.
GRANT SELECT, INSERT ON employee_events, audit_logs TO falcao_app;
--> statement-breakpoint
-- Identidade: apenas o necessário para exibir quem é quem.
GRANT SELECT (id, name, email, image) ON "user" TO falcao_app;
--> statement-breakpoint

-- ---------- Row Level Security ----------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units', 'cost_centers', 'positions', 'departments', 'employees', 'employee_events', 'audit_logs']
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

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Leitura: vínculos da organização atual, ou os do próprio usuário (para
-- listar as organizações a que ele tem acesso no login).
CREATE POLICY membership_read ON memberships FOR SELECT TO falcao_app
  USING (tenant_id = app_tenant_id() OR user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY membership_insert ON memberships FOR INSERT TO falcao_app
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY membership_update ON memberships FOR UPDATE TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY membership_delete ON memberships FOR DELETE TO falcao_app
  USING (tenant_id = app_tenant_id());
--> statement-breakpoint

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON tenants FOR SELECT TO falcao_app
  USING (
    id = app_tenant_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = tenants.id AND m.user_id = app_user_id() AND m.status = 'active'
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_update ON tenants FOR UPDATE TO falcao_app
  USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());
--> statement-breakpoint

-- ---------- integridade entre tenants ----------
-- A checagem de chave estrangeira ignora o RLS. Sem estas chaves compostas,
-- um registro poderia apontar para o departamento de outra empresa.

ALTER TABLE units ADD CONSTRAINT units_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE cost_centers ADD CONSTRAINT cost_centers_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE positions ADD CONSTRAINT positions_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE departments ADD CONSTRAINT departments_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT employees_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE departments
  ADD CONSTRAINT departments_parent_same_tenant_fk FOREIGN KEY (tenant_id, parent_id)
    REFERENCES departments (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT departments_manager_same_tenant_fk FOREIGN KEY (tenant_id, manager_employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE SET NULL (manager_employee_id),
  ADD CONSTRAINT departments_unit_same_tenant_fk FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id) ON DELETE SET NULL (unit_id),
  ADD CONSTRAINT departments_cost_center_same_tenant_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES cost_centers (tenant_id, id) ON DELETE SET NULL (cost_center_id);
--> statement-breakpoint
ALTER TABLE employees
  ADD CONSTRAINT employees_department_same_tenant_fk FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments (tenant_id, id) ON DELETE SET NULL (department_id),
  ADD CONSTRAINT employees_position_same_tenant_fk FOREIGN KEY (tenant_id, position_id)
    REFERENCES positions (tenant_id, id) ON DELETE SET NULL (position_id),
  ADD CONSTRAINT employees_manager_same_tenant_fk FOREIGN KEY (tenant_id, manager_id)
    REFERENCES employees (tenant_id, id) ON DELETE SET NULL (manager_id),
  ADD CONSTRAINT employees_unit_same_tenant_fk FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id) ON DELETE SET NULL (unit_id),
  ADD CONSTRAINT employees_cost_center_same_tenant_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES cost_centers (tenant_id, id) ON DELETE SET NULL (cost_center_id),
  ADD CONSTRAINT employees_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id);
--> statement-breakpoint
ALTER TABLE employee_events
  ADD CONSTRAINT employee_events_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE memberships
  ADD CONSTRAINT memberships_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE SET NULL (employee_id);
--> statement-breakpoint

-- ---------- updated_at automático ----------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants', 'memberships', 'units', 'cost_centers', 'positions', 'departments', 'employees']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- ---------- auditoria imutável ----------
-- Nem o dono das tabelas altera ou apaga registros, salvo um expurgo
-- deliberado da política de retenção (`SET LOCAL app.audit_purge = 'on'`).

CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'registros de auditoria são imutáveis (%)', TG_OP;
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
--> statement-breakpoint
CREATE TRIGGER employee_events_immutable BEFORE UPDATE ON employee_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
