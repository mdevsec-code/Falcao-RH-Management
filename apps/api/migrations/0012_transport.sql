CREATE TYPE "public"."transport_mode" AS ENUM('mobility', 'chartered', 'own', 'none');--> statement-breakpoint
CREATE TABLE "employee_transport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"provider" text,
	"route_id" uuid,
	"pickup_point" text,
	"pickup_district" text,
	"pickup_city" text,
	"monthly_cost_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle" text,
	"capacity" integer,
	"driver" text,
	"shift" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_transport" ADD CONSTRAINT "employee_transport_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transport" ADD CONSTRAINT "employee_transport_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_transport" ADD CONSTRAINT "employee_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_transport_employee_uq" ON "employee_transport" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_tenant_name_uq" ON "transport_routes" USING btree ("tenant_id","name");