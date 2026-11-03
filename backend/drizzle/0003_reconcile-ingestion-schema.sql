-- Reconcile the origin/main ingestion schema with databases that may already
-- have applied the fixes branch's former 0001 migration.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'reviews'
			AND column_name = 'review_text'
	) AND NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'reviews'
			AND column_name = 'text'
	) THEN
		EXECUTE 'ALTER TABLE "reviews" RENAME COLUMN "review_text" TO "text"';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "review_date" text;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "source_metadata" jsonb;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'reviews'
			AND column_name = 'reviewed_at'
	) THEN
		EXECUTE 'UPDATE "reviews" SET "review_date" = COALESCE("review_date", "reviewed_at"::text)';
		EXECUTE 'ALTER TABLE "reviews" DROP COLUMN "reviewed_at"';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "rating" SET DATA TYPE real USING "rating"::real;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range'
	) THEN
		ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range"
			CHECK ("reviews"."rating" BETWEEN 1 AND 5);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reviews_text_not_empty'
	) THEN
		ALTER TABLE "reviews" ADD CONSTRAINT "reviews_text_not_empty"
			CHECK (length(btrim("reviews"."text")) > 0);
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_type
		WHERE typname = 'ingestion_status'
			AND typnamespace = 'public'::regnamespace
	) THEN
		ALTER TABLE "ingestion_attempts" ALTER COLUMN "status" DROP DEFAULT;
		ALTER TABLE "ingestion_attempts" ALTER COLUMN "status"
			SET DATA TYPE text USING "status"::text;
		DROP TYPE "public"."ingestion_status";
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'ingestion_attempts'
			AND column_name = 'review_count'
	) AND NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'ingestion_attempts'
			AND column_name = 'saved_count'
	) THEN
		EXECUTE 'ALTER TABLE "ingestion_attempts" RENAME COLUMN "review_count" TO "saved_count"';
	END IF;

	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'ingestion_attempts'
			AND column_name = 'rejected_review_count'
	) AND NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'ingestion_attempts'
			AND column_name = 'rejected_count'
	) THEN
		EXECUTE 'ALTER TABLE "ingestion_attempts" RENAME COLUMN "rejected_review_count" TO "rejected_count"';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ADD COLUMN IF NOT EXISTS "received_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ADD COLUMN IF NOT EXISTS "saved_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ADD COLUMN IF NOT EXISTS "rejected_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "ingestion_attempts"
SET "received_count" = "saved_count" + "rejected_count"
WHERE "received_count" < "saved_count" + "rejected_count";
--> statement-breakpoint
ALTER TABLE "ingestion_attempts" ALTER COLUMN "status" SET DEFAULT 'processing';
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'ingestion_attempts_valid_status'
	) THEN
		ALTER TABLE "ingestion_attempts"
			ADD CONSTRAINT "ingestion_attempts_valid_status"
			CHECK ("ingestion_attempts"."status" IN ('processing', 'succeeded', 'failed'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'ingestion_attempts_nonnegative_counts'
	) THEN
		ALTER TABLE "ingestion_attempts"
			ADD CONSTRAINT "ingestion_attempts_nonnegative_counts"
			CHECK (
				"ingestion_attempts"."received_count" >= 0
				AND "ingestion_attempts"."saved_count" >= 0
				AND "ingestion_attempts"."rejected_count" >= 0
			);
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingestion_attempts_target_id_idx"
	ON "ingestion_attempts" USING btree ("analysis_target_id");
