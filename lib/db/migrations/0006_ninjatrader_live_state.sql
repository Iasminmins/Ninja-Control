ALTER TABLE "integration_positions" ADD COLUMN "last_sync_id" varchar(80);
--> statement-breakpoint
CREATE TABLE "integration_sync_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE cascade,
	"mapping_id" uuid NOT NULL REFERENCES "public"."integration_account_mappings"("id") ON DELETE cascade,
	"sync_id" varchar(80) NOT NULL,
	"status" varchar(24) DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"position_count" integer,
	"order_count" integer,
	"execution_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_risk_snapshots" ADD COLUMN "provider_values" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "account_risk_snapshots" ADD COLUMN "currency" varchar(12);
--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "provider_order_id" text;
--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "voided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "filled_quantity" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "average_fill_price" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "provider_status" varchar(48);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "order_type" varchar(40);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "limit_price" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "stop_price" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "time_in_force" varchar(24);
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "oco_id" text;
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "trading_orders" SET "is_active" = "status" NOT IN ('filled', 'cancelled', 'rejected');
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "last_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "trading_orders" ADD COLUMN "last_sync_id" varchar(80);
--> statement-breakpoint
DROP INDEX "trading_orders_provider_external_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "trading_orders_provider_external_unique" ON "trading_orders" USING btree ("account_id", "provider", "external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_sync_batch_mapping_sync_unique" ON "integration_sync_batches" USING btree ("mapping_id", "sync_id");
