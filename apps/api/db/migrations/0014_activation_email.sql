-- R3e (Round 3): onboarding emails. Expand-only: one nullable column, when the activation nudge was sent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activation_email_at" timestamp with time zone;
