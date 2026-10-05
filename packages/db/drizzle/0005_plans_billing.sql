CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"event" text NOT NULL,
	"subscription_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_plan_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_sub_uq" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_clinic_idx" ON "subscriptions" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "notifications_clinic_patient_idx" ON "notifications" USING btree ("clinic_id","patient_id");--> statement-breakpoint
INSERT INTO "plans" ("id","name","price_inr_monthly","included_call_minutes","max_concurrent_calls","features")
VALUES ('pilot','Pilot',0,500,2,ARRAY['ai_receptionist','dashboard','email_confirmations','reminders'])
ON CONFLICT ("id") DO UPDATE SET "name"=excluded."name","price_inr_monthly"=excluded."price_inr_monthly","included_call_minutes"=excluded."included_call_minutes","max_concurrent_calls"=excluded."max_concurrent_calls","features"=excluded."features";--> statement-breakpoint
INSERT INTO "plans" ("id","name","price_inr_monthly","included_call_minutes","max_concurrent_calls","features")
VALUES ('standard','Standard',4999,3000,5,ARRAY['ai_receptionist','dashboard','email_confirmations','reminders'])
ON CONFLICT ("id") DO UPDATE SET "name"=excluded."name","price_inr_monthly"=excluded."price_inr_monthly","included_call_minutes"=excluded."included_call_minutes","max_concurrent_calls"=excluded."max_concurrent_calls","features"=excluded."features";
