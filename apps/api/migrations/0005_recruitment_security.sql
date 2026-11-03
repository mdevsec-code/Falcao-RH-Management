-- Segurança do recrutamento (ADR-0004): mesmo modelo de 0001/0003 para a
-- role da aplicação, mais a role pública `falcao_public`.
--
-- `falcao_public` (NOLOGIN) é a role das rotas públicas (`/api/public/v1`):
-- a API faz `SET LOCAL ROLE falcao_public` com `app.tenant_id` resolvido pelo
-- slug. Ela só lê vagas publicadas/pausadas (e perguntas e nomes de
-- departamento dessas vagas) e só insere candidaturas. Nunca lê candidatos,
-- candidaturas, respostas, eventos, notas ou arquivos. O que precisa além
-- disso passa por funções SECURITY DEFINER estreitas, no fim deste arquivo.

-- ---------- privilégios da aplicação ----------

GRANT SELECT, INSERT, UPDATE, DELETE
  ON job_openings, job_questions, candidates, applications, application_answers, application_notes, candidate_files
  TO falcao_app;
--> statement-breakpoint
-- Histórico de etapas: só inclusão e leitura.
GRANT SELECT, INSERT ON application_events TO falcao_app;
--> statement-breakpoint

-- ---------- Row Level Security ----------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_openings', 'job_questions', 'candidates', 'applications', 'application_answers', 'application_events', 'application_notes', 'candidate_files']
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

-- ---------- role pública ----------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'falcao_public') THEN
    CREATE ROLE falcao_public NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT falcao_public TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO falcao_public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_id() TO falcao_public;
--> statement-breakpoint

-- Leitura: vagas publicadas ou pausadas (a pausada mostra o aviso de que não
-- recebe candidaturas), suas perguntas e o nome do departamento.
GRANT SELECT ON job_openings, job_questions TO falcao_public;
--> statement-breakpoint
GRANT SELECT (id, name) ON departments TO falcao_public;
--> statement-breakpoint
CREATE POLICY public_jobs ON job_openings FOR SELECT TO falcao_public
  USING (tenant_id = app_tenant_id() AND status IN ('published', 'paused'));
--> statement-breakpoint
-- A subconsulta roda sob o RLS de falcao_public em job_openings.
CREATE POLICY public_jobs ON job_questions FOR SELECT TO falcao_public
  USING (
    tenant_id = app_tenant_id()
    AND EXISTS (SELECT 1 FROM job_openings j WHERE j.id = job_questions.job_id)
  );
--> statement-breakpoint
CREATE POLICY public_department_names ON departments FOR SELECT TO falcao_public
  USING (
    tenant_id = app_tenant_id()
    AND EXISTS (SELECT 1 FROM job_openings j WHERE j.department_id = departments.id)
  );
--> statement-breakpoint

-- Inclusão: a candidatura e o que vem com ela. Sem SELECT, a API gera os ids
-- (nada de RETURNING) e a candidatura repetida é checada por
-- `public_application_exists`.
GRANT INSERT ON candidates, applications, application_answers, application_events, candidate_files TO falcao_public;
--> statement-breakpoint
CREATE POLICY public_insert ON candidates FOR INSERT TO falcao_public
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Só em vaga publicada (visível pela política acima e não pausada), na etapa
-- inicial e sem dados que só o RH define.
CREATE POLICY public_insert ON applications FOR INSERT TO falcao_public
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND stage = 'new'
    AND rejection_reason IS NULL
    AND rating IS NULL
    AND EXISTS (SELECT 1 FROM job_openings j WHERE j.id = applications.job_id AND j.status = 'published')
  );
--> statement-breakpoint
CREATE POLICY public_insert ON application_answers FOR INSERT TO falcao_public
  WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY public_insert ON application_events FOR INSERT TO falcao_public
  WITH CHECK (tenant_id = app_tenant_id() AND actor_user_id IS NULL);
--> statement-breakpoint
CREATE POLICY public_insert ON candidate_files FOR INSERT TO falcao_public
  WITH CHECK (tenant_id = app_tenant_id() AND scan_status = 'pending' AND scanned_at IS NULL);
--> statement-breakpoint

-- ---------- integridade entre tenants ----------

ALTER TABLE job_openings ADD CONSTRAINT job_openings_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE job_questions ADD CONSTRAINT job_questions_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE candidates ADD CONSTRAINT candidates_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE applications ADD CONSTRAINT applications_tenant_id_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE job_openings
  ADD CONSTRAINT job_openings_department_same_tenant_fk FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments (tenant_id, id) ON DELETE SET NULL (department_id),
  ADD CONSTRAINT job_openings_unit_same_tenant_fk FOREIGN KEY (tenant_id, unit_id)
    REFERENCES units (tenant_id, id) ON DELETE SET NULL (unit_id),
  ADD CONSTRAINT job_openings_position_same_tenant_fk FOREIGN KEY (tenant_id, position_id)
    REFERENCES positions (tenant_id, id) ON DELETE SET NULL (position_id),
  ADD CONSTRAINT job_openings_salary_valid CHECK (
    (salary_min IS NULL OR salary_min >= 0)
    AND (salary_max IS NULL OR salary_max >= 0)
    AND (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
  ),
  ADD CONSTRAINT job_openings_counts_valid CHECK (openings >= 1 AND hired_count >= 0);
--> statement-breakpoint
ALTER TABLE job_questions
  ADD CONSTRAINT job_questions_job_same_tenant_fk FOREIGN KEY (tenant_id, job_id)
    REFERENCES job_openings (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE candidates
  ADD CONSTRAINT candidates_email_lowercase CHECK (email = lower(email));
--> statement-breakpoint
ALTER TABLE applications
  ADD CONSTRAINT applications_job_same_tenant_fk FOREIGN KEY (tenant_id, job_id)
    REFERENCES job_openings (tenant_id, id),
  ADD CONSTRAINT applications_candidate_same_tenant_fk FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES candidates (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT applications_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT applications_rating_valid CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE application_answers
  ADD CONSTRAINT application_answers_application_same_tenant_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT application_answers_question_same_tenant_fk FOREIGN KEY (tenant_id, question_id)
    REFERENCES job_questions (tenant_id, id);
--> statement-breakpoint
ALTER TABLE application_events
  ADD CONSTRAINT application_events_application_same_tenant_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT application_events_has_content CHECK (to_stage IS NOT NULL OR note IS NOT NULL);
--> statement-breakpoint
ALTER TABLE application_notes
  ADD CONSTRAINT application_notes_application_same_tenant_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE candidate_files
  ADD CONSTRAINT candidate_files_candidate_same_tenant_fk FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES candidates (tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT candidate_files_application_same_tenant_fk FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications (tenant_id, id) ON DELETE SET NULL (application_id);
--> statement-breakpoint

-- ---------- updated_at e imutabilidade ----------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_openings', 'job_questions', 'candidates', 'applications', 'application_notes', 'candidate_files']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Apagar segue permitido: a exclusão da candidatura (LGPD) leva o histórico junto.
CREATE TRIGGER application_events_immutable BEFORE UPDATE ON application_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
--> statement-breakpoint

-- ---------- funções públicas (SECURITY DEFINER) ----------
-- Rodam como o dono das tabelas, fora do RLS. Cada uma faz uma coisa só,
-- com `search_path` fixo, e só `falcao_public` pode executá-las.

-- Organização pelo slug da URL (tenants não têm situação: qualquer slug existente vale).
CREATE FUNCTION public_tenant_id(p_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT t.id FROM tenants t WHERE t.slug = p_slug $$;
--> statement-breakpoint
-- Id e nome da organização, para o cabeçalho da página de vagas.
CREATE FUNCTION public_tenant(p_slug text) RETURNS TABLE (id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT t.id, t.name FROM tenants t WHERE t.slug = p_slug $$;
--> statement-breakpoint
-- Candidatura repetida (mesma vaga, mesmo e-mail), sem dar SELECT em applications.
CREATE FUNCTION public_application_exists(p_tenant uuid, p_job uuid, p_email text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM applications a
      WHERE a.tenant_id = p_tenant AND a.job_id = p_job AND a.email = lower(btrim(p_email))
    )
  $$;
--> statement-breakpoint
-- Exclusão a pedido (link do e-mail): apaga a ficha do dono do token e, em
-- cascata, candidaturas, respostas, eventos, notas e arquivos. Devolve as
-- chaves de armazenamento a remover (menos as que viraram documento de
-- colaborador). Token inexistente devolve '{}'.
CREATE FUNCTION public_erase_by_token(p_token text) RETURNS text[]
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  v_candidate uuid;
  v_keys text[];
BEGIN
  SELECT a.candidate_id INTO v_candidate FROM applications a WHERE a.privacy_token = p_token;
  IF v_candidate IS NULL THEN
    RETURN '{}'::text[];
  END IF;
  SELECT coalesce(array_agg(f.storage_key ORDER BY f.created_at), '{}'::text[]) INTO v_keys
    FROM candidate_files f
    WHERE f.candidate_id = v_candidate
      AND NOT EXISTS (SELECT 1 FROM document_versions d WHERE d.storage_key = f.storage_key);
  DELETE FROM candidates c WHERE c.id = v_candidate;
  RETURN v_keys;
END
$$;
--> statement-breakpoint
-- Renovação do consentimento ao banco de talentos: renova `consent_at` nas
-- candidaturas da pessoa que já tinham consentimento (nunca cria
-- consentimento novo). Devolve true se alguma foi renovada. O novo
-- `retention_until` é calculado pela API (configuração da organização).
CREATE FUNCTION public_renew_consent(p_token text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  v_candidate uuid;
BEGIN
  SELECT a.candidate_id INTO v_candidate FROM applications a WHERE a.privacy_token = p_token;
  IF v_candidate IS NULL THEN
    RETURN false;
  END IF;
  UPDATE applications a SET consent_at = now(), talent_pool_consent = true
    WHERE a.candidate_id = v_candidate AND a.talent_pool_consent;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION
  public_tenant_id(text), public_tenant(text), public_application_exists(uuid, uuid, text),
  public_erase_by_token(text), public_renew_consent(text)
  FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  public_tenant_id(text), public_tenant(text), public_application_exists(uuid, uuid, text),
  public_erase_by_token(text), public_renew_consent(text)
  TO falcao_public;
