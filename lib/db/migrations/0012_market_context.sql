CREATE TABLE "market_instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"provider" varchar(80) NOT NULL,
	"instrument_key" varchar(120) NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"display_name" varchar(120),
	"instrument_kind" varchar(16) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_instruments_kind_check" CHECK ("instrument_kind" IN ('equity', 'future'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "market_instruments_workspace_provider_key_unique" ON "market_instruments" USING btree ("workspace_id", "provider", "instrument_key");
--> statement-breakpoint
CREATE INDEX "market_instruments_workspace_kind_active_idx" ON "market_instruments" USING btree ("workspace_id", "instrument_kind", "active");
--> statement-breakpoint
CREATE UNIQUE INDEX "market_instruments_workspace_id_unique" ON "market_instruments" USING btree ("workspace_id", "id");
--> statement-breakpoint
CREATE TABLE "market_instrument_metadata_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"instrument_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"sector" varchar(80),
	"market_cap_weight" numeric(12, 8),
	"source" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_instrument_metadata_weight_check" CHECK ("market_cap_weight" IS NULL OR "market_cap_weight" > 0)
);
--> statement-breakpoint
ALTER TABLE "market_instrument_metadata_versions" ADD CONSTRAINT "market_metadata_workspace_instrument_fk" FOREIGN KEY ("workspace_id", "instrument_id") REFERENCES "market_instruments"("workspace_id", "id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "market_metadata_workspace_instrument_date_unique" ON "market_instrument_metadata_versions" USING btree ("workspace_id", "instrument_id", "effective_from");
--> statement-breakpoint
CREATE INDEX "market_metadata_workspace_effective_idx" ON "market_instrument_metadata_versions" USING btree ("workspace_id", "effective_from", "effective_until");
--> statement-breakpoint
CREATE TABLE "market_instrument_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"instrument_id" uuid NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_price" numeric(18, 8) NOT NULL,
	"prior_close" numeric(18, 8),
	"bid" numeric(18, 8),
	"ask" numeric(18, 8),
	"session_volume" numeric(20, 4),
	"contract_expiry" varchar(24),
	"sequence" bigint,
	CONSTRAINT "market_snapshot_price_check" CHECK ("last_price" > 0),
	CONSTRAINT "market_snapshot_prior_close_check" CHECK ("prior_close" IS NULL OR "prior_close" > 0),
	CONSTRAINT "market_snapshot_bid_check" CHECK ("bid" IS NULL OR "bid" > 0),
	CONSTRAINT "market_snapshot_ask_check" CHECK ("ask" IS NULL OR "ask" > 0)
);
--> statement-breakpoint
ALTER TABLE "market_instrument_snapshots" ADD CONSTRAINT "market_snapshots_workspace_instrument_fk" FOREIGN KEY ("workspace_id", "instrument_id") REFERENCES "market_instruments"("workspace_id", "id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "market_snapshots_workspace_instrument_unique" ON "market_instrument_snapshots" USING btree ("workspace_id", "instrument_id");
--> statement-breakpoint
CREATE INDEX "market_snapshots_workspace_event_idx" ON "market_instrument_snapshots" USING btree ("workspace_id", "event_at");
--> statement-breakpoint
CREATE TABLE "market_minute_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
	"instrument_id" uuid NOT NULL,
	"minute_start" timestamp with time zone NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_price" numeric(18, 8) NOT NULL,
	"prior_close" numeric(18, 8),
	"session_volume" numeric(20, 4),
	"sequence" bigint,
	CONSTRAINT "market_minute_price_check" CHECK ("last_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "market_minute_aggregates" ADD CONSTRAINT "market_minute_workspace_instrument_fk" FOREIGN KEY ("workspace_id", "instrument_id") REFERENCES "market_instruments"("workspace_id", "id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "market_minute_workspace_instrument_time_unique" ON "market_minute_aggregates" USING btree ("workspace_id", "instrument_id", "minute_start");
--> statement-breakpoint
CREATE INDEX "market_minute_workspace_time_idx" ON "market_minute_aggregates" USING btree ("workspace_id", "minute_start");
