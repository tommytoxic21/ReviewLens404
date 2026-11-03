import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export type AnalysisTarget = typeof analysisTargets.$inferSelect;
