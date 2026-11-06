CREATE INDEX "assessments_conversation_id_idx" ON "assessments" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_message_id_unique" ON "assessments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "follow_ups_conversation_id_idx" ON "follow_ups" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "message_images_message_id_idx" ON "message_images" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");