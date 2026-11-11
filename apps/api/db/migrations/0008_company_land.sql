CREATE TABLE "company_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"license" text NOT NULL,
	"source_url" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"industry" text,
	"hq_name" text,
	"queried_country" char(2) NOT NULL,
	"country_code" char(2),
	"lat" double precision,
	"lng" double precision,
	"precision" text,
	"popularity" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"skip_reason" text,
	"plot_id" uuid,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_requests" ADD COLUMN "dns_token" text;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_sources_source_idx" ON "company_sources" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "company_sources_country_idx" ON "company_sources" USING btree ("queried_country","status","popularity");