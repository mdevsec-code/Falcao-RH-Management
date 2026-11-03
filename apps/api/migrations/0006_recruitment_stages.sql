-- Etapas personalizáveis (spec 5.8). Gerada pelo drizzle-kit em duas partes
-- (inclusões, depois remoções) e unida à mão, com a conversão dos dados
-- existentes no meio: `applications.stage` vira `status` + `stage_id`, e o
-- histórico passa a guardar a etapa por id e por rótulo. Segurança,
-- integridade e gatilhos em 0007_recruitment_stages_security.sql.

CREATE TYPE "public"."application_outcome" AS ENUM('hired', 'rejected', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('open', 'hired', 'rejected');--> statement-breakpoint
CREATE TABLE "recruitment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "from_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "from_label" text;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "to_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "to_label" text;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "outcome" "application_outcome";--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "status" "application_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "recruitment_stages" ADD CONSTRAINT "recruitment_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recruitment_stages_tenant_initial_uq" ON "recruitment_stages" USING btree ("tenant_id") WHERE "recruitment_stages"."is_initial";--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_from_stage_id_recruitment_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."recruitment_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_to_stage_id_recruitment_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."recruitment_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_stage_id_recruitment_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."recruitment_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_job_status_stage_idx" ON "applications" USING btree ("job_id","status","stage_id");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage_id");--> statement-breakpoint

-- ---------- dados existentes (escrito à mão) ----------

-- As 4 etapas iniciais para cada organização que já existe.
INSERT INTO recruitment_stages (tenant_id, name, position, is_initial)
SELECT t.id, s.name, s.position, s.position = 0
FROM tenants t
CROSS JOIN (VALUES ('Novo', 0), ('Triagem', 1), ('Entrevista', 2), ('Proposta', 3)) AS s (name, position);
--> statement-breakpoint
-- Nome da etapa padrão equivalente a cada etapa antiga; desfechos não têm etapa.
CREATE FUNCTION legacy_stage_name(p_stage application_stage) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT CASE p_stage
      WHEN 'new' THEN 'Novo'
      WHEN 'screening' THEN 'Triagem'
      WHEN 'interview' THEN 'Entrevista'
      WHEN 'offer' THEN 'Proposta'
    END
  $$;
--> statement-breakpoint
-- Contratada e recusada viram situação (sem etapa); as demais ficam em
-- andamento, na etapa de mesmo nome da organização.
UPDATE applications a SET
  status = CASE a.stage
    WHEN 'hired' THEN 'hired'::application_status
    WHEN 'rejected' THEN 'rejected'::application_status
    ELSE 'open'::application_status
  END,
  stage_id = (
    SELECT s.id FROM recruitment_stages s
    WHERE s.tenant_id = a.tenant_id AND s.name = legacy_stage_name(a.stage)
  );
--> statement-breakpoint
-- Histórico: etapa por id e rótulo; ir para contratado/recusado vira desfecho,
-- e sair dele vira "reaberta". O gatilho de imutabilidade é suspenso só aqui.
ALTER TABLE application_events DISABLE TRIGGER application_events_immutable;
--> statement-breakpoint
UPDATE application_events e SET
  from_stage_id = (
    SELECT s.id FROM recruitment_stages s
    WHERE s.tenant_id = e.tenant_id AND s.name = legacy_stage_name(e.from_stage)
  ),
  from_label = legacy_stage_name(e.from_stage),
  to_stage_id = (
    SELECT s.id FROM recruitment_stages s
    WHERE s.tenant_id = e.tenant_id AND s.name = legacy_stage_name(e.to_stage)
  ),
  to_label = legacy_stage_name(e.to_stage),
  outcome = CASE
    WHEN e.to_stage IN ('hired', 'rejected') THEN e.to_stage::text::application_outcome
    WHEN e.from_stage IN ('hired', 'rejected') THEN 'reopened'::application_outcome
  END;
--> statement-breakpoint
ALTER TABLE application_events ENABLE TRIGGER application_events_immutable;
--> statement-breakpoint
DROP FUNCTION legacy_stage_name(application_stage);
--> statement-breakpoint
-- A política de inclusão pública dependia de `stage`; é recriada na 0007.
DROP POLICY public_insert ON applications;
--> statement-breakpoint

-- ---------- remoções (geradas) ----------

DROP INDEX "applications_job_stage_idx";--> statement-breakpoint
ALTER TABLE "application_events" DROP COLUMN "from_stage";--> statement-breakpoint
ALTER TABLE "application_events" DROP COLUMN "to_stage";--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "stage";--> statement-breakpoint
DROP TYPE "public"."application_stage";
