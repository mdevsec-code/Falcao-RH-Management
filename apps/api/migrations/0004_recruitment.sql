CREATE TYPE "public"."application_stage" AS ENUM('new', 'screening', 'interview', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."file_scan_status" AS ENUM('pending', 'clean', 'infected');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'published', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."job_visibility" AS ENUM('public', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('text', 'yes_no', 'choice');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'site', 'hybrid');--> statement-breakpoint
CREATE TABLE "application_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage" "application_stage",
	"to_stage" "application_stage",
	"actor_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"email" text NOT NULL,
	"stage" "application_stage" DEFAULT 'new' NOT NULL,
	"rejection_reason" text,
	"rating" integer,
	"talent_pool_consent" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"retention_until" date,
	"privacy_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_privacy_token_uq" UNIQUE("privacy_token")
);
--> statement-breakpoint
CREATE TABLE "candidate_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"scan_status" "file_scan_status" DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"cpf" text,
	"linkedin" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"invited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"department_id" uuid,
	"unit_id" uuid,
	"position_id" uuid,
	"contract_type" "contract_type" NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text,
	"work_mode" "work_mode" NOT NULL,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"show_salary" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"benefits" text DEFAULT '' NOT NULL,
	"openings" integer DEFAULT 1 NOT NULL,
	"hired_count" integer DEFAULT 0 NOT NULL,
	"manager_user_id" text,
	"visibility" "job_visibility" DEFAULT 'public' NOT NULL,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"share_token" text NOT NULL,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_openings_share_token_uq" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "job_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "question_kind" NOT NULL,
	"label" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_question_id_job_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."job_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_job_openings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_openings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_manager_user_id_user_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_questions" ADD CONSTRAINT "job_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_questions" ADD CONSTRAINT "job_questions_job_id_job_openings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_answers_application_question_uq" ON "application_answers" USING btree ("application_id","question_id");--> statement-breakpoint
CREATE INDEX "application_events_application_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_notes_application_idx" ON "application_notes" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_email_uq" ON "applications" USING btree ("job_id","email");--> statement-breakpoint
CREATE INDEX "applications_job_stage_idx" ON "applications" USING btree ("job_id","stage");--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "applications_tenant_retention_idx" ON "applications" USING btree ("tenant_id","retention_until");--> statement-breakpoint
CREATE INDEX "candidate_files_candidate_idx" ON "candidate_files" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_files_application_idx" ON "candidate_files" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "candidate_files_scan_idx" ON "candidate_files" USING btree ("scan_status","created_at");--> statement-breakpoint
CREATE INDEX "candidates_tenant_email_idx" ON "candidates" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "candidates_tenant_cpf_idx" ON "candidates" USING btree ("tenant_id","cpf");--> statement-breakpoint
CREATE INDEX "job_openings_tenant_status_idx" ON "job_openings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "job_openings_manager_idx" ON "job_openings" USING btree ("manager_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_questions_job_position_uq" ON "job_questions" USING btree ("job_id","position");