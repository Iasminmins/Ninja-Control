CREATE TABLE "account_simulator_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"source_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"calculation_version" varchar(24) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_simulator_scenarios" ADD CONSTRAINT "account_simulator_scenarios_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_simulator_scenarios_workspace_updated_idx" ON "account_simulator_scenarios" USING btree ("workspace_id","updated_at");