-- GL4 (16 Nov Go Live): PayPal as a second way to pay one-time orders. Expand-only: new nullable columns.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "success_path" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_path" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_paypal_order_id_unique" ON "orders" ("paypal_order_id");
