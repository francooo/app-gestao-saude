ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_store" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_product" text;--> statement-breakpoint
-- Contas que ja existiam ganham os mesmos 7 dias de teste, contados do lancamento
-- do plano: ninguem perde a IA de surpresa no dia em que o bloqueio entra.
UPDATE "users" SET "trial_ends_at" = now() + interval '7 days' WHERE "trial_ends_at" IS NULL;
