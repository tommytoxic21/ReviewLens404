import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
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
    sourceReviewId: text('source_review_id'),
    reviewText: text('review_text').notNull(),
    rating: real('rating').notNull(),
    reviewerName: text('reviewer_name'),
    reviewedAt: timestamp('reviewed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    reviewUrl: text('review_url'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reviews_analysis_target_id_idx').on(table.analysisTargetId),
    uniqueIndex('reviews_target_source_id_unique').on(
      table.analysisTargetId,
      table.sourceReviewId,
    ),
  ],
);

export const ingestionStatus = pgEnum('ingestion_status', [
  'processing',
  'succeeded',
  'failed',
]);

export const ingestionAttempts = pgTable(
  'ingestion_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisTargetId: uuid('analysis_target_id')
      .notNull()
      .references(() => analysisTargets.id, { onDelete: 'cascade' }),
    status: ingestionStatus('status').notNull(),
    reviewCount: integer('review_count').default(0).notNull(),
    rejectedReviewCount: integer('rejected_review_count').default(0).notNull(),
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
    index('ingestion_attempts_target_started_idx').on(
      table.analysisTargetId,
      table.startedAt,
    ),
  ],
);

export type AnalysisTarget = typeof analysisTargets.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type IngestionAttempt = typeof ingestionAttempts.$inferSelect;
