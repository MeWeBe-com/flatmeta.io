ALTER TABLE "company_sources" ADD COLUMN "contact_url" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "contact_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "outreach_status" text DEFAULT 'not_contacted' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "outreach_notes" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD COLUMN "contacted_at" timestamp with time zone;