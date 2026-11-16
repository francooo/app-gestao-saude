CREATE TABLE "health_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"systolic" smallint,
	"diastolic" smallint,
	"pulse" smallint,
	"glucose" smallint,
	"glucose_context" text,
	"weight_kg" numeric(5, 2),
	"spo2" smallint,
	"measured_at" timestamp with time zone NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_measurements_kind" CHECK ("health_measurements"."kind" in ('pressao', 'glicemia', 'peso', 'oxigenacao')),
	CONSTRAINT "health_measurements_source" CHECK ("health_measurements"."source" in ('manual', 'foto')),
	CONSTRAINT "health_measurements_pressao" CHECK ("health_measurements"."kind" <> 'pressao' OR ("health_measurements"."systolic" IS NOT NULL AND "health_measurements"."diastolic" IS NOT NULL AND "health_measurements"."systolic" BETWEEN 60 AND 260 AND "health_measurements"."diastolic" BETWEEN 30 AND 160 AND "health_measurements"."systolic" > "health_measurements"."diastolic")),
	CONSTRAINT "health_measurements_glicemia" CHECK ("health_measurements"."kind" <> 'glicemia' OR ("health_measurements"."glucose" IS NOT NULL AND "health_measurements"."glucose" BETWEEN 20 AND 600 AND ("health_measurements"."glucose_context" IS NULL OR "health_measurements"."glucose_context" in ('jejum', 'antes', 'depois', 'outro')))),
	CONSTRAINT "health_measurements_peso" CHECK ("health_measurements"."kind" <> 'peso' OR ("health_measurements"."weight_kg" IS NOT NULL AND "health_measurements"."weight_kg" >= 0.5 AND "health_measurements"."weight_kg" <= 300)),
	CONSTRAINT "health_measurements_oxigenacao" CHECK ("health_measurements"."kind" <> 'oxigenacao' OR ("health_measurements"."spo2" IS NOT NULL AND "health_measurements"."spo2" BETWEEN 50 AND 100)),
	CONSTRAINT "health_measurements_pulso" CHECK ("health_measurements"."pulse" IS NULL OR "health_measurements"."pulse" BETWEEN 30 AND 220)
);
--> statement-breakpoint
ALTER TABLE "medication_photo_reads" DROP CONSTRAINT "medication_photo_reads_kind";--> statement-breakpoint
ALTER TABLE "health_measurements" ADD CONSTRAINT "health_measurements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_measurements_profile_measured_idx" ON "health_measurements" USING btree ("profile_id","measured_at");--> statement-breakpoint
ALTER TABLE "medication_photo_reads" ADD CONSTRAINT "medication_photo_reads_kind" CHECK ("medication_photo_reads"."kind" in ('receita', 'caixa', 'visor'));