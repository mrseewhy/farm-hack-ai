CREATE TABLE "knowledge_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"crop" text DEFAULT 'tomato' NOT NULL,
	"problem" text NOT NULL,
	"signs" text NOT NULL,
	"distinguishing_questions" text NOT NULL,
	"approved_actions" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"reviewer" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
