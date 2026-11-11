CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_html_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"html" text NOT NULL,
	"bytes" integer NOT NULL,
	"status" text NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "custom_html_live" text;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "custom_html_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "custom_html_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "custom_html_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_html_versions" ADD CONSTRAINT "custom_html_versions_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_html_versions" ADD CONSTRAINT "custom_html_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_html_versions" ADD CONSTRAINT "custom_html_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_html_versions_plot_version_idx" ON "custom_html_versions" USING btree ("plot_id","version");--> statement-breakpoint
CREATE INDEX "custom_html_versions_status_idx" ON "custom_html_versions" USING btree ("status","created_at");--> statement-breakpoint
-- Custom HTML saved before G8 goes through the new review once (none of it is shown until an admin approves it).
INSERT INTO "custom_html_versions" ("plot_id", "version", "html", "bytes", "status", "notes")
  SELECT "id", 1, "custom_html", octet_length("custom_html"), 'review', '["Saved before custom HTML review existed"]'::jsonb FROM "plots" WHERE "custom_html" IS NOT NULL;--> statement-breakpoint
UPDATE "plots" SET "custom_html_status" = 'review', "custom_html_version" = 1 WHERE "custom_html" IS NOT NULL;
