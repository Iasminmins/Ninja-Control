CREATE TABLE "account_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category" varchar(40) NOT NULL,
	"description" varchar(240),
	"amount_cents" integer NOT NULL,
	"incurred_at" timestamp with time zone NOT NULL,
	"origin" "data_origin" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_risk_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"balance_cents" integer,
	"equity_cents" integer,
	"peak_balance_cents" integer,
	"max_drawdown_cents" integer,
	"current_drawdown_cents" integer,
	"remaining_drawdown_cents" integer,
	"daily_loss_cents" integer,
	"contracts_open" integer,
	"exposure_cents" integer,
	"source" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"entry_price" numeric(18, 8),
	"exit_price" numeric(18, 8),
	"mae_cents" integer,
	"mfe_cents" integer,
	"risk_reward" numeric(10, 4),
	"duration_seconds" integer,
	"hunter_family" varchar(20),
	"setup_code" varchar(80),
	"pattern_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hunter_version" varchar(80),
	"master_node" varchar(120),
	"slave_node" varchar(120),
	"dd_before_cents" integer,
	"dd_after_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_costs" ADD CONSTRAINT "account_costs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_costs" ADD CONSTRAINT "account_costs_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_risk_snapshots" ADD CONSTRAINT "account_risk_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_risk_snapshots" ADD CONSTRAINT "account_risk_snapshots_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_contexts" ADD CONSTRAINT "trade_contexts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_contexts" ADD CONSTRAINT "trade_contexts_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_costs_workspace_time_idx" ON "account_costs" USING btree ("workspace_id","incurred_at");--> statement-breakpoint
CREATE INDEX "account_costs_account_idx" ON "account_costs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_risk_snapshot_time_idx" ON "account_risk_snapshots" USING btree ("workspace_id","account_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_context_trade_unique" ON "trade_contexts" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "trade_context_workspace_family_idx" ON "trade_contexts" USING btree ("workspace_id","hunter_family");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_unique" ON "workspaces" USING btree ("owner_id");