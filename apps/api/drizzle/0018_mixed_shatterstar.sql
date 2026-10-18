CREATE TABLE "medication_stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"units" integer NOT NULL,
	"expires_on" date,
	"place" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_stock_entries_units_range" CHECK ("medication_stock_entries"."units" >= 1 AND "medication_stock_entries"."units" <= 99999)
);
--> statement-breakpoint
ALTER TABLE "medication_stock_entries" ADD CONSTRAINT "medication_stock_entries_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medication_stock_entries_medication_idx" ON "medication_stock_entries" USING btree ("medication_id");