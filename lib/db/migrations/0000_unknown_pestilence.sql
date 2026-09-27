CREATE TYPE "public"."account_kind" AS ENUM('evaluation', 'funded', 'combine');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'paused', 'archived', 'breached');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('not_configured', 'connected', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('manual', 'import', 'provider', 'calculated');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"idempotency_key" varchar(240) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid,
	"provider" varchar(80),
	"external_id" text,
	"event_type" varchar(100) NOT NULL,
	"status" varchar(40) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" "data_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text,
	"status" varchar(40) NOT NULL,
	"amount_cents" integer NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"origin" "data_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_firm_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prop_firm_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"stage" varchar(80) NOT NULL,
	"starting_capital_cents" integer NOT NULL,
	"daily_loss_limit_cents" integer,
	"trailing_drawdown_limit_cents" integer,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prop_firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"website_url" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid,
	"name" varchar(120) NOT NULL,
	"condition" varchar(80) NOT NULL,
	"threshold" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"order_id" uuid,
	"external_id" text,
	"instrument" varchar(40) NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"price" varchar(40) NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"origin" "data_origin" NOT NULL,
	"provider" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"strategy_version_id" uuid,
	"instrument" varchar(40) NOT NULL,
	"side" "order_side" NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"net_pnl_cents" integer,
	"setup" varchar(120),
	"session" varchar(80),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"origin" "data_origin" NOT NULL,
	"source" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prop_firm_plan_id" uuid,
	"name" varchar(120) NOT NULL,
	"external_id" text,
	"kind" "account_kind" NOT NULL,
	"stage" varchar(80) NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"starting_capital_cents" integer NOT NULL,
	"connection_status" "connection_status" DEFAULT 'not_configured' NOT NULL,
	"origin" "data_origin" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text,
	"instrument" varchar(40) NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"status" "order_status" NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"origin" "data_origin" NOT NULL,
	"provider" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prop_firm_plans" ADD CONSTRAINT "prop_firm_plans_prop_firm_id_prop_firms_id_fk" FOREIGN KEY ("prop_firm_id") REFERENCES "public"."prop_firms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_order_id_trading_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."trading_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_prop_firm_plan_id_prop_firm_plans_id_fk" FOREIGN KEY ("prop_firm_plan_id") REFERENCES "public"."prop_firm_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_orders" ADD CONSTRAINT "trading_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_orders" ADD CONSTRAINT "trading_orders_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_records_workspace_time_idx" ON "audit_records" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_idempotency_unique" ON "integration_events" USING btree ("workspace_id","provider","idempotency_key");--> statement-breakpoint
CREATE INDEX "integration_events_unprocessed_idx" ON "integration_events" USING btree ("workspace_id","received_at") WHERE "integration_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "operation_events_workspace_time_idx" ON "operation_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_events_provider_external_unique" ON "operation_events" USING btree ("workspace_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "payouts_workspace_requested_idx" ON "payouts" USING btree ("workspace_id","requested_at");--> statement-breakpoint
CREATE INDEX "prop_firm_plans_firm_idx" ON "prop_firm_plans" USING btree ("prop_firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_firms_name_unique" ON "prop_firms" USING btree ("name");--> statement-breakpoint
CREATE INDEX "risk_rules_workspace_idx" ON "risk_rules" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_workspace_name_unique" ON "strategies" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_unique" ON "strategy_versions" USING btree ("strategy_id","version");--> statement-breakpoint
CREATE INDEX "trade_executions_workspace_time_idx" ON "trade_executions" USING btree ("workspace_id","executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_executions_provider_external_unique" ON "trade_executions" USING btree ("workspace_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "trades_workspace_opened_idx" ON "trades" USING btree ("workspace_id","opened_at");--> statement-breakpoint
CREATE INDEX "trading_accounts_workspace_idx" ON "trading_accounts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_external_unique" ON "trading_accounts" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE INDEX "trading_orders_workspace_time_idx" ON "trading_orders" USING btree ("workspace_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_orders_provider_external_unique" ON "trading_orders" USING btree ("workspace_id","provider","external_id");