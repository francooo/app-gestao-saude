CREATE TABLE "medication_photo_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"kind" text NOT NULL,
	"model" text,
	"outcome" text DEFAULT 'enviada' NOT NULL,
	"proposal" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_photo_reads_kind" CHECK ("medication_photo_reads"."kind" in ('receita', 'caixa')),
	CONSTRAINT "medication_photo_reads_outcome" CHECK ("medication_photo_reads"."outcome" in ('enviada', 'lida', 'vazia', 'falha'))
);
--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "package_amount" integer;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "photo_read_id" uuid;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "photo_read_item" smallint;--> statement-breakpoint
ALTER TABLE "medication_photo_reads" ADD CONSTRAINT "medication_photo_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_photo_reads" ADD CONSTRAINT "medication_photo_reads_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medication_photo_reads_user_created_idx" ON "medication_photo_reads" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_photo_read_id_medication_photo_reads_id_fk" FOREIGN KEY ("photo_read_id") REFERENCES "public"."medication_photo_reads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_granted_idx" ON "consents" USING btree ("user_id","granted_at");--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_package_amount_range" CHECK ("medications"."package_amount" IS NULL OR ("medications"."package_amount" >= 1 AND "medications"."package_amount" <= 9999));