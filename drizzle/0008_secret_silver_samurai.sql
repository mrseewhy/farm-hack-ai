CREATE TABLE "assessment_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"language" text DEFAULT 'English' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "error_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'server' NOT NULL,
	"route" text DEFAULT 'unknown' NOT NULL,
	"method" text DEFAULT 'unknown' NOT NULL,
	"route_path" text,
	"error_name" text,
	"message" text NOT NULL,
	"digest" text,
	"stack_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_key" text NOT NULL,
	"severity" text NOT NULL,
	"metric" text NOT NULL,
	"value" text NOT NULL,
	"threshold" text NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"delivery_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"conversations_deleted" integer DEFAULT 0 NOT NULL,
	"images_deleted" integer DEFAULT 0 NOT NULL,
	"telemetry_deleted" integer DEFAULT 0 NOT NULL,
	"errors_deleted" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"admin_id" text NOT NULL,
	"decision" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"consent_key" text DEFAULT 'data_processing' NOT NULL,
	"policy_version" text NOT NULL,
	"source" text DEFAULT 'signup' NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "failure_kind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "estimated_cost_micro_usd" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "image_bytes_original" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "image_bytes_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_events" ADD COLUMN "image_optimized" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_jobs" ADD CONSTRAINT "assessment_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_jobs" ADD CONSTRAINT "assessment_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reviews" ADD CONSTRAINT "safety_reviews_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_jobs_message_id_unique" ON "assessment_jobs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "assessment_jobs_status_available_idx" ON "assessment_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "error_events_created_at_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operational_alerts_key_created_idx" ON "operational_alerts" USING btree ("alert_key","created_at");--> statement-breakpoint
CREATE INDEX "retention_runs_created_at_idx" ON "retention_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safety_reviews_assessment_id_idx" ON "safety_reviews" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "safety_reviews_created_at_idx" ON "safety_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_consents_user_id_idx" ON "user_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_consents_key_idx" ON "user_consents" USING btree ("consent_key");--> statement-breakpoint
CREATE INDEX "ai_events_failure_kind_idx" ON "ai_events" USING btree ("failure_kind");