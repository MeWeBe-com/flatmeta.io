ALTER TABLE "users" ADD COLUMN "last_lat" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_lng" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_pos_at" timestamp with time zone;