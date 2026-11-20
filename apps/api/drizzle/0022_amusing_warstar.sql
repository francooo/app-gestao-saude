ALTER TABLE "caregivers" ADD COLUMN "notify_appointment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "dose_lead_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "whatsapp_sends" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_sends_consulta_idx" ON "whatsapp_sends" USING btree ("caregiver_id","appointment_id","kind") WHERE "whatsapp_sends"."appointment_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_dose_lead" CHECK ("caregivers"."dose_lead_minutes" in (0, 15, 30, 60));