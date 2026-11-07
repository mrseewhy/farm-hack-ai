CREATE TABLE "ai_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer,
	"event_type" text DEFAULT 'assessment' NOT NULL,
	"prompt_version" text NOT NULL,
	"model_requested" text NOT NULL,
	"model_used" text,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"fallback_attempts" integer DEFAULT 1 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"safety_flag_count" integer DEFAULT 0 NOT NULL,
	"image_total" integer DEFAULT 0 NOT NULL,
	"image_failed" integer DEFAULT 0 NOT NULL,
	"validation_outcome" text DEFAULT 'valid' NOT NULL,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_events_created_at_idx" ON "ai_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_events_outcome_idx" ON "ai_events" USING btree ("outcome");