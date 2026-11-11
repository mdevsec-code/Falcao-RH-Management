-- Segurança da página oficial de vagas (spec 5.9), no modelo de 0005:
-- RLS de tenant para a aplicação; a role pública lê só a versão publicada
-- da própria organização e nunca lê `career_assets` diretamente.

-- ---------- privilégios e RLS da aplicação ----------

GRANT SELECT, INSERT, UPDATE ON career_pages TO falcao_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON career_assets TO falcao_app;
--> statement-breakpoint
ALTER TABLE career_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE career_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON career_pages TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON career_assets TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE TRIGGER career_pages_updated_at BEFORE UPDATE ON career_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- ---------- role pública ----------

-- Só a versão publicada, nunca o rascunho.
GRANT SELECT (published) ON career_pages TO falcao_public;
--> statement-breakpoint
CREATE POLICY public_published ON career_pages FOR SELECT TO falcao_public
  USING (tenant_id = app_tenant_id() AND published IS NOT NULL);
--> statement-breakpoint

-- Imagem da página: só se o id estiver na versão publicada da organização
-- (capa ou fotos do "Sobre"). Imagem enviada e ainda não publicada é 404.
CREATE FUNCTION public_career_asset(p_tenant uuid, p_asset uuid)
  RETURNS TABLE (storage_key text, mime_type text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT a.storage_key, a.mime_type
    FROM career_assets a
    JOIN career_pages p ON p.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant
      AND p_tenant = app_tenant_id()
      AND a.id = p_asset
      AND p.published IS NOT NULL
      AND (
        p.published -> 'hero' ->> 'imageId' = p_asset::text
        OR (p.published -> 'about' -> 'imageIds') ? p_asset::text
      )
  $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public_career_asset(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_career_asset(uuid, uuid) TO falcao_public;
--> statement-breakpoint

-- ---------- integridade ----------

ALTER TABLE career_assets
  ADD CONSTRAINT career_assets_mime_valid CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD CONSTRAINT career_assets_size_valid CHECK (size_bytes > 0 AND size_bytes <= 5242880);
