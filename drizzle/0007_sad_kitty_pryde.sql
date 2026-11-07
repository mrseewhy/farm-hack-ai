ALTER TABLE "knowledge_articles" ADD COLUMN "provenance" text DEFAULT 'source_backed' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "source_publisher" text;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "source_title" text;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "source_accessed_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "source_license" text;