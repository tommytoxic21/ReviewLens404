CREATE TABLE "ingestion_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_target_id" uuid NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"received_count" integer DEFAULT 0 NOT NULL,
	"saved_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ingestion_attempts_valid_status" CHECK ("ingestion_attempts"."status" IN ('processing', 'succeeded', 'failed')),
	CONSTRAINT "ingestion_attempts_nonnegative_counts" CHECK ("ingestion_attempts"."received_count" >= 0
        AND "ingestion_attempts"."saved_count" >= 0
        AND "ingestion_attempts"."rejected_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ADD CONSTRAINT "ingestion_attempts_analysis_target_id_analysis_targets_id_fk" FOREIGN KEY ("analysis_target_id") REFERENCES "public"."analysis_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_attempts_target_id_idx" ON "ingestion_attempts" USING btree ("analysis_target_id");