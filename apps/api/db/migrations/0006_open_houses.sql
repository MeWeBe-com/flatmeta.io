CREATE TABLE "open_house_rsvps" (
	"open_house_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_house_rsvps_open_house_id_user_id_pk" PRIMARY KEY("open_house_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "open_houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"notified_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_house_rsvps" ADD CONSTRAINT "open_house_rsvps_open_house_id_open_houses_id_fk" FOREIGN KEY ("open_house_id") REFERENCES "public"."open_houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_house_rsvps" ADD CONSTRAINT "open_house_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_houses" ADD CONSTRAINT "open_houses_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_houses" ADD CONSTRAINT "open_houses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_houses_starts_idx" ON "open_houses" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "open_houses_plot_idx" ON "open_houses" USING btree ("plot_id","starts_at");