-- Segurança das etapas personalizáveis (spec 5.8), no modelo de 0005:
-- RLS e privilégios de `recruitment_stages`, chaves compostas, política de
-- inclusão pública refeita sobre `status`/`stage_id` e endurecimentos
-- apontados na revisão da Task 2.

-- ---------- privilégios e RLS ----------

GRANT SELECT, INSERT, UPDATE, DELETE ON recruitment_stages TO falcao_app;
--> statement-breakpoint
ALTER TABLE recruitment_stages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON recruitment_stages TO falcao_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- A role pública só enxerga o id da etapa inicial, para a candidatura nascer nela.
GRANT SELECT (id) ON recruitment_stages TO falcao_public;
--> statement-breakpoint
CREATE POLICY public_initial_stage ON recruitment_stages FOR SELECT TO falcao_public
  USING (tenant_id = app_tenant_id() AND is_initial);
--> statement-breakpoint

-- ---------- integridade ----------

-- A posição é única por organização, conferida no fim da transação: reordenar
-- troca posições entre etapas. A inicial é sempre a de posição 0.
ALTER TABLE recruitment_stages
  ADD CONSTRAINT recruitment_stages_tenant_id_id_uq UNIQUE (tenant_id, id),
  ADD CONSTRAINT recruitment_stages_tenant_position_uq UNIQUE (tenant_id, position) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT recruitment_stages_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  ADD CONSTRAINT recruitment_stages_position_valid CHECK (position >= 0),
  ADD CONSTRAINT recruitment_stages_initial_first CHECK (is_initial = (position = 0));
--> statement-breakpoint
-- Em andamento exige etapa; encerrada guarda onde parou (ou nulo se a etapa saiu).
-- Etapa com candidatura não é apagada (RESTRICT): a API trata antes.
ALTER TABLE applications
  ADD CONSTRAINT applications_stage_same_tenant_fk FOREIGN KEY (tenant_id, stage_id)
    REFERENCES recruitment_stages (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT applications_open_has_stage CHECK (status <> 'open' OR stage_id IS NOT NULL);
--> statement-breakpoint
-- A CHECK antiga caiu junto com `to_stage` na 0006.
ALTER TABLE application_events DROP CONSTRAINT IF EXISTS application_events_has_content;
--> statement-breakpoint
ALTER TABLE application_events
  ADD CONSTRAINT application_events_from_stage_same_tenant_fk FOREIGN KEY (tenant_id, from_stage_id)
    REFERENCES recruitment_stages (tenant_id, id) ON DELETE SET NULL (from_stage_id),
  ADD CONSTRAINT application_events_to_stage_same_tenant_fk FOREIGN KEY (tenant_id, to_stage_id)
    REFERENCES recruitment_stages (tenant_id, id) ON DELETE SET NULL (to_stage_id),
  ADD CONSTRAINT application_events_has_content CHECK (to_label IS NOT NULL OR outcome IS NOT NULL OR note IS NOT NULL),
  ADD CONSTRAINT application_events_labels CHECK (
    (from_stage_id IS NULL OR from_label IS NOT NULL) AND (to_stage_id IS NULL OR to_label IS NOT NULL)
  );
--> statement-breakpoint

-- ---------- gatilhos ----------

CREATE TRIGGER recruitment_stages_updated_at BEFORE UPDATE ON recruitment_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- A etapa inicial não muda de nome, não deixa de ser inicial e não é apagada
-- (só some quando a organização é apagada, em cascata: aí o tenant já não existe).
CREATE FUNCTION recruitment_stages_protect_initial() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_initial AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = OLD.tenant_id) THEN
      RAISE EXCEPTION 'a etapa inicial não pode ser removida';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_initial AND (NEW.name <> OLD.name OR NOT NEW.is_initial) THEN
    RAISE EXCEPTION 'a etapa inicial não pode ser alterada';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER recruitment_stages_protect_initial BEFORE UPDATE OR DELETE ON recruitment_stages
  FOR EACH ROW EXECUTE FUNCTION recruitment_stages_protect_initial();
--> statement-breakpoint
-- Rótulos do histórico: vêm sempre do banco, a partir do id da etapa (quem
-- grava não escolhe o texto). SECURITY DEFINER porque a role pública não lê
-- o nome das etapas; a busca é presa ao tenant do próprio evento.
CREATE FUNCTION application_events_fill_labels() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
BEGIN
  IF NEW.from_stage_id IS NOT NULL THEN
    NEW.from_label := (SELECT s.name FROM recruitment_stages s WHERE s.id = NEW.from_stage_id AND s.tenant_id = NEW.tenant_id);
  END IF;
  IF NEW.to_stage_id IS NOT NULL THEN
    NEW.to_label := (SELECT s.name FROM recruitment_stages s WHERE s.id = NEW.to_stage_id AND s.tenant_id = NEW.tenant_id);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION application_events_fill_labels() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER application_events_fill_labels BEFORE INSERT ON application_events
  FOR EACH ROW EXECUTE FUNCTION application_events_fill_labels();
--> statement-breakpoint
-- O histórico segue imutável. A única alteração aceita é a da chave
-- estrangeira ao remover uma etapa: o id vira nulo e o rótulo fica.
CREATE FUNCTION application_events_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (to_jsonb(NEW) - 'from_stage_id' - 'to_stage_id') = (to_jsonb(OLD) - 'from_stage_id' - 'to_stage_id')
     AND (NEW.from_stage_id IS NULL OR NEW.from_stage_id = OLD.from_stage_id)
     AND (NEW.to_stage_id IS NULL OR NEW.to_stage_id = OLD.to_stage_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'registros de auditoria são imutáveis (%)', TG_OP;
END
$$;
--> statement-breakpoint
DROP TRIGGER application_events_immutable ON application_events;
--> statement-breakpoint
CREATE TRIGGER application_events_immutable BEFORE UPDATE ON application_events
  FOR EACH ROW EXECUTE FUNCTION application_events_guard();
--> statement-breakpoint

-- ---------- inclusão pública ----------

-- Candidatura: vaga publicada, em andamento, na etapa inicial da organização
-- (a única etapa que a role pública enxerga) e sem dados que só o RH define.
CREATE POLICY public_insert ON applications FOR INSERT TO falcao_public
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND status = 'open'
    AND rejection_reason IS NULL
    AND rating IS NULL
    AND EXISTS (SELECT 1 FROM job_openings j WHERE j.id = applications.job_id AND j.status = 'published')
    AND EXISTS (SELECT 1 FROM recruitment_stages s WHERE s.id = applications.stage_id)
  );
--> statement-breakpoint
-- Evento: só a entrada na etapa inicial, sem origem, desfecho nem autor.
-- (Conferido depois do gatilho de rótulos.)
DROP POLICY public_insert ON application_events;
--> statement-breakpoint
CREATE POLICY public_insert ON application_events FOR INSERT TO falcao_public
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND actor_user_id IS NULL
    AND from_stage_id IS NULL
    AND from_label IS NULL
    AND outcome IS NULL
    AND EXISTS (SELECT 1 FROM recruitment_stages s WHERE s.id = application_events.to_stage_id)
  );
--> statement-breakpoint

-- ---------- funções públicas ----------

-- Duplicata só na organização da transação (antes aceitava qualquer tenant).
CREATE OR REPLACE FUNCTION public_application_exists(p_tenant uuid, p_job uuid, p_email text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM applications a
      WHERE p_tenant = app_tenant_id()
        AND a.tenant_id = p_tenant AND a.job_id = p_job AND a.email = lower(btrim(p_email))
    )
  $$;
