ALTER TYPE "public"."call_status" ADD VALUE 'abandoned';--> statement-breakpoint
ALTER TABLE "callbacks" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "outcome_source" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "analysed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "callbacks_call_idx" ON "callbacks" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "calls_clinic_outcome_idx" ON "calls" USING btree ("clinic_id","outcome");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_recording_status_chk" CHECK ("calls"."recording_status" IN ('none','pending','ready','failed'));--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_outcome_source_chk" CHECK ("calls"."outcome_source" IS NULL OR "calls"."outcome_source" IN ('gateway','worker','staff'));--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_sentiment_chk" CHECK ("calls"."sentiment" IS NULL OR "calls"."sentiment" IN ('positive','neutral','negative'));