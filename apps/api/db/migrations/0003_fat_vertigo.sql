CREATE TABLE "email_suppressions" (
	"email" "citext" PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
