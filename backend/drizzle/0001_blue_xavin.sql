CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_target_id" uuid NOT NULL,
	"text" text NOT NULL,
	"rating" integer NOT NULL,
	"source_review_id" text,
	"reviewer_name" text,
	"review_date" text,
	"review_url" text,
	"source_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_text_not_empty" CHECK (length(btrim("reviews"."text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_analysis_target_id_analysis_targets_id_fk" FOREIGN KEY ("analysis_target_id") REFERENCES "public"."analysis_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_analysis_target_id_idx" ON "reviews" USING btree ("analysis_target_id");