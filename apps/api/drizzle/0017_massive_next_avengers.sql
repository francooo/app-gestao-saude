ALTER TABLE "medications" ADD COLUMN "day_interval" integer;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "weekdays" smallint;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "total_doses" integer;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_day_interval_range" CHECK ("medications"."day_interval" IS NULL OR ("medications"."day_interval" >= 1 AND "medications"."day_interval" <= 60));--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_weekdays_range" CHECK ("medications"."weekdays" IS NULL OR ("medications"."weekdays" >= 1 AND "medications"."weekdays" <= 127));--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_total_doses_range" CHECK ("medications"."total_doses" IS NULL OR ("medications"."total_doses" >= 1 AND "medications"."total_doses" <= 500));