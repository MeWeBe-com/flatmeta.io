ALTER TABLE "company_sources" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_source" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_source_url" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_license" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_author" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "logo_hidden" boolean DEFAULT false NOT NULL;