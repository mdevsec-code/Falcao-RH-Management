-- Segurança da mobilidade e transporte (ADR-0004): mesmo modelo de 0001 e 0003.
-- Sem acesso para falcao_public: nada daqui é público.

GRANT SELECT, INSERT, UPDATE, DELETE ON transport_routes, employee_transport TO falcao_app;
--> statement-breakpoint
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_transport ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON transport_routes TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_transport TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE transport_routes ADD CONSTRAINT transport_routes_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE employee_transport
  ADD CONSTRAINT employee_transport_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT employee_transport_route_same_tenant_fk FOREIGN KEY (tenant_id, route_id)
    REFERENCES transport_routes (tenant_id, id) ON DELETE SET NULL (route_id);
--> statement-breakpoint
CREATE TRIGGER transport_routes_updated_at BEFORE UPDATE ON transport_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER employee_transport_updated_at BEFORE UPDATE ON employee_transport
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
