DROP INDEX "medication_attachments_one_per_medication_idx";--> statement-breakpoint
ALTER TABLE "medication_attachments" ALTER COLUMN "kind" DROP DEFAULT;