import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const analysisTargets = pgTable(
  'analysis_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').notNull(),
    entityName: text('entity_name').notNull(),
    platform: text('platform').notNull(),
    sourceUrl: text('source_url').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('analysis_targets_owner_id_idx').on(table.ownerId)],
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisTargetId: uuid('analysis_target_id')
      .notNull()
      .references(() => analysisTargets.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    rating: real('rating').notNull(),
    sourceReviewId: text('source_review_id'),
    reviewerName: text('reviewer_name'),
    reviewDate: text('review_date'),
    reviewUrl: text('review_url'),
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reviews_analysis_target_id_idx').on(table.analysisTargetId),
    check('reviews_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    check('reviews_text_not_empty', sql`length(btrim(${table.text})) > 0`),
  ],
);

export const ingestionAttempts = pgTable(
  'ingestion_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisTargetId: uuid('analysis_target_id')
      .notNull()
      .references(() => analysisTargets.id, { onDelete: 'cascade' }),
    status: text('status')
      .$type<'processing' | 'succeeded' | 'failed'>()
      .default('processing')
      .notNull(),
    receivedCount: integer('received_count').default(0).notNull(),
    savedCount: integer('saved_count').default(0).notNull(),
    rejectedCount: integer('rejected_count').default(0).notNull(),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    index('ingestion_attempts_target_id_idx').on(table.analysisTargetId),
    check(
      'ingestion_attempts_valid_status',
      sql`${table.status} IN ('processing', 'succeeded', 'failed')`,
    ),
    check(
      'ingestion_attempts_nonnegative_counts',
      sql`${table.receivedCount} >= 0
        AND ${table.savedCount} >= 0
        AND ${table.rejectedCount} >= 0`,
    ),
  ],
);

export type AnalysisTarget = typeof analysisTargets.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type IngestionAttempt = typeof ingestionAttempts.$inferSelect;
