CREATE TYPE "public"."ingestion_status" AS ENUM('processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "ingestion_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_target_id" uuid NOT NULL,
	"status" "ingestion_status" NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"rejected_review_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_target_id" uuid NOT NULL,
	"source_review_id" text,
	"review_text" text NOT NULL,
	"rating" real NOT NULL,
	"reviewer_name" text,
	"reviewed_at" timestamp with time zone,
	"review_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ADD CONSTRAINT "ingestion_attempts_analysis_target_id_analysis_targets_id_fk" FOREIGN KEY ("analysis_target_id") REFERENCES "public"."analysis_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_analysis_target_id_analysis_targets_id_fk" FOREIGN KEY ("analysis_target_id") REFERENCES "public"."analysis_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_attempts_target_started_idx" ON "ingestion_attempts" USING btree ("analysis_target_id","started_at");--> statement-breakpoint
CREATE INDEX "reviews_analysis_target_id_idx" ON "reviews" USING btree ("analysis_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_target_source_id_unique" ON "reviews" USING btree ("analysis_target_id","source_review_id");