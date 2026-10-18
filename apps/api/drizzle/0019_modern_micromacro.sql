CREATE TABLE "caregivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text,
	"notify_dose" boolean DEFAULT true NOT NULL,
	"notify_late" boolean DEFAULT true NOT NULL,
	"notify_low_stock" boolean DEFAULT true NOT NULL,
	"notify_taken" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"medication_id" uuid,
	"kind" text NOT NULL,
	"slot" timestamp with time zone,
	"status" text DEFAULT 'enviando' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caregivers_profile_idx" ON "caregivers" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "caregivers_user_idx" ON "caregivers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_sends_unique_idx" ON "whatsapp_sends" USING btree ("caregiver_id","medication_id","kind","slot");