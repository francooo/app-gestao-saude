CREATE TABLE "medication_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"photo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_attachments_photo_size" CHECK (length("medication_attachments"."photo") <= 700000),
	CONSTRAINT "medication_attachments_photo_format" CHECK ("medication_attachments"."photo" LIKE 'data:image/jpeg%')
);
--> statement-breakpoint
ALTER TABLE "medication_attachments" ADD CONSTRAINT "medication_attachments_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medication_attachments_one_per_medication_idx" ON "medication_attachments" USING btree ("medication_id");