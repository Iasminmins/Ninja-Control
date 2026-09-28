ALTER TABLE "trade_executions" ADD COLUMN "point_value" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "commission_cents" integer;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "currency" varchar(12);
--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "commission_currency" varchar(12);
