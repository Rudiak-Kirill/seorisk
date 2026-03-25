ALTER TABLE "content_plan" ADD COLUMN "secondary_queries" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "generation_settings" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "required_blocks" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "article_outline" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "faq_items" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "schema_types" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "linking_hints" jsonb;
--> statement-breakpoint
ALTER TABLE "content_plan" ADD COLUMN "notes_for_llm" text;
