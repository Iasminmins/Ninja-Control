CREATE TABLE "experiment_csv_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"blob_path" text NOT NULL,
	"byte_size" integer NOT NULL,
	"format" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_csv_files" ADD CONSTRAINT "experiment_csv_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_csv_files_blob_path_unique" ON "experiment_csv_files" USING btree ("blob_path");
--> statement-breakpoint
CREATE INDEX "experiment_csv_files_workspace_created_idx" ON "experiment_csv_files" USING btree ("workspace_id","created_at");
