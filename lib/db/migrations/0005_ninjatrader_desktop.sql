CREATE TABLE IF NOT EXISTS "integration_account_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE CASCADE,
  "external_account_id" varchar(240) NOT NULL,
  "external_account_name" varchar(120) NOT NULL,
  "trading_account_id" uuid REFERENCES "trading_accounts"("id") ON DELETE SET NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_account_mapping_external_unique" ON "integration_account_mappings" USING btree ("connection_id", "external_account_id");
CREATE INDEX IF NOT EXISTS "integration_account_mapping_workspace_idx" ON "integration_account_mappings" USING btree ("workspace_id", "last_seen_at");

CREATE TABLE IF NOT EXISTS "integration_positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "mapping_id" uuid NOT NULL REFERENCES "integration_account_mappings"("id") ON DELETE CASCADE,
  "instrument" varchar(80) NOT NULL,
  "quantity" integer NOT NULL,
  "average_price" numeric(18, 8),
  "unrealized_pnl_cents" integer,
  "captured_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_positions_mapping_instrument_unique" ON "integration_positions" USING btree ("mapping_id", "instrument");
