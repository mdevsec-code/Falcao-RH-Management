-- Benefícios VA/VR (ADR-0004): mesmo modelo de 0001 e 0003.

GRANT SELECT, INSERT, UPDATE, DELETE ON benefit_plans, benefit_runs, benefit_run_items TO falcao_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON employee_benefits TO falcao_app;
--> statement-breakpoint
-- Histórico de valores programados: somente inclusão.
GRANT SELECT, INSERT ON benefit_plan_values TO falcao_app;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['benefit_plans', 'benefit_plan_values', 'employee_benefits', 'benefit_runs', 'benefit_run_items']
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

ALTER TABLE benefit_plans ADD CONSTRAINT benefit_plans_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE benefit_runs ADD CONSTRAINT benefit_runs_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE benefit_plan_values
  ADD CONSTRAINT benefit_plan_values_plan_same_tenant_fk FOREIGN KEY (tenant_id, plan_id)
    REFERENCES benefit_plans (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT benefit_plan_values_positive CHECK (value_cents > 0);
--> statement-breakpoint
ALTER TABLE employee_benefits
  ADD CONSTRAINT employee_benefits_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT employee_benefits_plan_same_tenant_fk FOREIGN KEY (tenant_id, plan_id)
    REFERENCES benefit_plans (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT employee_benefits_period_valid CHECK (end_date IS NULL OR end_date >= start_date);
--> statement-breakpoint
ALTER TABLE benefit_run_items
  ADD CONSTRAINT benefit_run_items_run_same_tenant_fk FOREIGN KEY (tenant_id, run_id)
    REFERENCES benefit_runs (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT benefit_run_items_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT benefit_run_items_values_valid CHECK (days >= 0 AND amount_cents >= 0 AND unit_value_cents >= 0);
--> statement-breakpoint

CREATE TRIGGER benefit_plans_updated_at BEFORE UPDATE ON benefit_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER benefit_plan_values_immutable BEFORE UPDATE ON benefit_plan_values
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
--> statement-breakpoint

-- Apuração fechada é o que foi pago: nenhuma linha muda depois.
CREATE FUNCTION forbid_closed_benefit_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM benefit_runs r WHERE r.id = coalesce(NEW.run_id, OLD.run_id) AND r.status = 'closed') THEN
    RAISE EXCEPTION 'apuração de benefícios fechada não pode ser alterada' USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;
--> statement-breakpoint
CREATE TRIGGER benefit_run_items_closed BEFORE INSERT OR UPDATE OR DELETE ON benefit_run_items
  FOR EACH ROW EXECUTE FUNCTION forbid_closed_benefit_run();
