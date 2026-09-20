ALTER TABLE "professionals" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "latitude" numeric;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "longitude" numeric;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "my_rating" smallint;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "rating_note" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "default_modality" "appointment_modality";--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_rating_range" CHECK ("professionals"."my_rating" IS NULL OR ("professionals"."my_rating" >= 1 AND "professionals"."my_rating" <= 5));