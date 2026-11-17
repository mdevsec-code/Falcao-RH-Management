CREATE TYPE "public"."benefit_kind" AS ENUM('va', 'vr');--> statement-breakpoint
CREATE TYPE "public"."benefit_run_status" AS ENUM('draft', 'closed');--> statement-breakpoint
CREATE TYPE "public"."benefit_value_type" AS ENUM('daily', 'monthly');--> statement-breakpoint
CREATE TABLE "benefit_plan_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"value_cents" integer NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefit_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "benefit_kind" NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"value_type" "benefit_value_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefit_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"plan_id" uuid,
	"plan_name" text NOT NULL,
	"kind" "benefit_kind" NOT NULL,
	"value_type" "benefit_value_type" NOT NULL,
	"unit_value_cents" integer NOT NULL,
	"eligible_days" integer NOT NULL,
	"deducted_days" integer NOT NULL,
	"days" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"adjusted" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"competence" text NOT NULL,
	"workdays" integer NOT NULL,
	"status" "benefit_run_status" DEFAULT 'draft' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benefit_plan_values" ADD CONSTRAINT "benefit_plan_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_plan_values" ADD CONSTRAINT "benefit_plan_values_plan_id_benefit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."benefit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_plan_values" ADD CONSTRAINT "benefit_plan_values_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_plans" ADD CONSTRAINT "benefit_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_run_items" ADD CONSTRAINT "benefit_run_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_run_items" ADD CONSTRAINT "benefit_run_items_run_id_benefit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benefit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_run_items" ADD CONSTRAINT "benefit_run_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_run_items" ADD CONSTRAINT "benefit_run_items_plan_id_benefit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."benefit_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_runs" ADD CONSTRAINT "benefit_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_runs" ADD CONSTRAINT "benefit_runs_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_plan_id_benefit_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."benefit_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benefit_plan_values_plan_date_uq" ON "benefit_plan_values" USING btree ("plan_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "benefit_plans_tenant_name_uq" ON "benefit_plans" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "benefit_run_items_run_employee_uq" ON "benefit_run_items" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benefit_runs_tenant_competence_uq" ON "benefit_runs" USING btree ("tenant_id","competence");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_benefits_current_uq" ON "employee_benefits" USING btree ("tenant_id","employee_id") WHERE "employee_benefits"."end_date" is null;--> statement-breakpoint
CREATE INDEX "employee_benefits_employee_idx" ON "employee_benefits" USING btree ("employee_id");