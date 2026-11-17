-- Admissão digital (ADR-0004): isolamento por tenant e uma função que, a
-- partir do hash do token, devolve só a organização e o colaborador do link.
-- A rota pública nunca recebe o id da organização do navegador.

GRANT SELECT, INSERT, UPDATE ON admission_links TO falcao_app;
--> statement-breakpoint
ALTER TABLE admission_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON admission_links TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE admission_links
  ADD CONSTRAINT admission_links_employee_same_tenant_fk FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
-- Link válido: não expirado e ainda não enviado.
CREATE FUNCTION admission_link_lookup(p_hash text) RETURNS TABLE (link_id uuid, tenant_id uuid, employee_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT l.id, l.tenant_id, l.employee_id FROM admission_links l
    WHERE l.token_hash = p_hash AND l.submitted_at IS NULL AND l.expires_at > now()
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION admission_link_lookup(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admission_link_lookup(text) TO falcao_app;
