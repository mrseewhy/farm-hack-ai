CREATE TABLE "admin_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
