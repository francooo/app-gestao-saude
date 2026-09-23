ALTER TABLE "profiles" ADD COLUMN "weight_kg" numeric;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_weight_range" CHECK ("profiles"."weight_kg" IS NULL OR ("profiles"."weight_kg" >= 0.5 AND "profiles"."weight_kg" <= 500));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_height_range" CHECK ("profiles"."height_cm" IS NULL OR ("profiles"."height_cm" >= 20 AND "profiles"."height_cm" <= 250));