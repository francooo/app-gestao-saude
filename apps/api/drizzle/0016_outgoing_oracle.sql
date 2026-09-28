CREATE TABLE "symptom_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"intensity" smallint NOT NULL,
	"temperature_c" numeric(4, 1),
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symptom_entries_kind" CHECK ("symptom_entries"."kind" in ('febre', 'dor', 'nausea', 'tosse', 'humor', 'sono')),
	CONSTRAINT "symptom_entries_intensity" CHECK ("symptom_entries"."intensity" between 1 and 5),
	CONSTRAINT "symptom_entries_temperature" CHECK ("symptom_entries"."temperature_c" IS NULL OR ("symptom_entries"."kind" = 'febre' AND "symptom_entries"."temperature_c" >= 30 AND "symptom_entries"."temperature_c" <= 45))
);
--> statement-breakpoint
ALTER TABLE "symptom_entries" ADD CONSTRAINT "symptom_entries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "symptom_entries_profile_occurred_idx" ON "symptom_entries" USING btree ("profile_id","occurred_at");