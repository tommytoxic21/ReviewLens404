-- Remove duplicate reviews saved before pagination/deduplication was fixed.
-- Preserve the earliest stored copy for each target and provider review ID.
DELETE FROM "reviews" newer
USING "reviews" older
WHERE newer."analysis_target_id" = older."analysis_target_id"
  AND newer."source_review_id" = older."source_review_id"
  AND newer."source_review_id" IS NOT NULL
  AND (newer."created_at", newer."id") > (older."created_at", older."id");
--> statement-breakpoint
-- Protect against duplicates on subsequent imports, including concurrent ones.
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_target_source_review_id_unique"
  ON "reviews" ("analysis_target_id", "source_review_id")
  WHERE "source_review_id" IS NOT NULL;
