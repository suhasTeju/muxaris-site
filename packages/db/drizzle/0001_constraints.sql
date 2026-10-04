DROP INDEX "users_email_idx";--> statement-breakpoint
DROP INDEX "call_turns_call_seq_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "call_turns" ADD CONSTRAINT "call_turns_call_seq_uq" UNIQUE("call_id","seq");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_range_chk" CHECK ("appointments"."ends_at" > "appointments"."starts_at");--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_range_chk" CHECK ("time_off"."ends_at" > "time_off"."starts_at");--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_weekday_chk" CHECK ("working_hours"."weekday" BETWEEN 0 AND 6);--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_range_chk" CHECK ("working_hours"."end_time" > "working_hours"."start_time");