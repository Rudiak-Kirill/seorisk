import {
  boolean,
  date,
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const ssrChecks = pgTable('ssr_checks', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  url: text('url').notNull(),
  verdict: varchar('verdict', { length: 20 }),
  reasons: jsonb('reasons'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const llmChecks = pgTable('llm_checks', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  url: text('url').notNull(),
  verdict: varchar('verdict', { length: 20 }),
  reasons: jsonb('reasons'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const indexChecks = pgTable('index_checks', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  url: text('url').notNull(),
  verdict: varchar('verdict', { length: 20 }),
  reasons: jsonb('reasons'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const seoResearch = pgTable('seo_research', {
  id: uuid('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title'),
  h1: text('h1'),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const clusters = pgTable('clusters', {
  id: uuid('id').primaryKey(),
  researchId: uuid('research_id')
    .notNull()
    .references(() => seoResearch.id, { onDelete: 'cascade' }),
  mainQuery: text('main_query').notNull(),
  totalFrequency: integer('total_frequency').notNull().default(0),
  queriesCount: integer('queries_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const queries = pgTable('queries', {
  id: uuid('id').primaryKey(),
  researchId: uuid('research_id')
    .notNull()
    .references(() => seoResearch.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  frequency: integer('frequency').notNull().default(0),
  type: varchar('type', { length: 30 }),
  destination: varchar('destination', { length: 20 }),
  relevance: integer('relevance'),
  reason: text('reason'),
  clusterId: uuid('cluster_id').references(() => clusters.id, {
    onDelete: 'set null',
  }),
  source: varchar('source', { length: 30 }).notNull().default('seed'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const contentPlan = pgTable('content_plan', {
  id: uuid('id').primaryKey(),
  researchId: uuid('research_id')
    .notNull()
    .references(() => seoResearch.id, { onDelete: 'cascade' }),
  clusterId: uuid('cluster_id').references(() => clusters.id, {
    onDelete: 'set null',
  }),
  sourceUrl: text('source_url').notNull(),
  targetUrl: text('target_url').notNull(),
  contentType: varchar('content_type', { length: 20 }).notNull(),
  title: text('title').notNull(),
  metaDescription: text('meta_description'),
  mainQuery: text('main_query').notNull(),
  secondaryQueries: jsonb('secondary_queries'),
  generationSettings: jsonb('generation_settings'),
  requiredBlocks: jsonb('required_blocks'),
  articleOutline: jsonb('article_outline'),
  faqItems: jsonb('faq_items'),
  schemaTypes: jsonb('schema_types'),
  linkingHints: jsonb('linking_hints'),
  notesForLlm: text('notes_for_llm'),
  articlePreview: text('article_preview'),
  plannedDate: date('planned_date'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  isApproved: boolean('is_approved').notNull().default(false),
  approvedAt: timestamp('approved_at'),
  publishedAt: timestamp('published_at'),
  publishedUrl: text('published_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const ssrChecksRelations = relations(ssrChecks, ({ one }) => ({
  team: one(teams, {
    fields: [ssrChecks.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [ssrChecks.userId],
    references: [users.id],
  }),
}));

export const llmChecksRelations = relations(llmChecks, ({ one }) => ({
  team: one(teams, {
    fields: [llmChecks.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [llmChecks.userId],
    references: [users.id],
  }),
}));

export const indexChecksRelations = relations(indexChecks, ({ one }) => ({
  team: one(teams, {
    fields: [indexChecks.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [indexChecks.userId],
    references: [users.id],
  }),
}));

export const seoResearchRelations = relations(seoResearch, ({ many }) => ({
  queries: many(queries),
  clusters: many(clusters),
  contentPlan: many(contentPlan),
}));

export const queriesRelations = relations(queries, ({ one }) => ({
  research: one(seoResearch, {
    fields: [queries.researchId],
    references: [seoResearch.id],
  }),
  cluster: one(clusters, {
    fields: [queries.clusterId],
    references: [clusters.id],
  }),
}));

export const clustersRelations = relations(clusters, ({ one, many }) => ({
  research: one(seoResearch, {
    fields: [clusters.researchId],
    references: [seoResearch.id],
  }),
  queries: many(queries),
  contentPlan: many(contentPlan),
}));

export const contentPlanRelations = relations(contentPlan, ({ one }) => ({
  research: one(seoResearch, {
    fields: [contentPlan.researchId],
    references: [seoResearch.id],
  }),
  cluster: one(clusters, {
    fields: [contentPlan.clusterId],
    references: [clusters.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type SsrCheck = typeof ssrChecks.$inferSelect;
export type NewSsrCheck = typeof ssrChecks.$inferInsert;
export type LlmCheck = typeof llmChecks.$inferSelect;
export type NewLlmCheck = typeof llmChecks.$inferInsert;
export type IndexCheck = typeof indexChecks.$inferSelect;
export type NewIndexCheck = typeof indexChecks.$inferInsert;
export type SeoResearch = typeof seoResearch.$inferSelect;
export type NewSeoResearch = typeof seoResearch.$inferInsert;
export type Query = typeof queries.$inferSelect;
export type NewQuery = typeof queries.$inferInsert;
export type Cluster = typeof clusters.$inferSelect;
export type NewCluster = typeof clusters.$inferInsert;
export type ContentPlan = typeof contentPlan.$inferSelect;
export type NewContentPlan = typeof contentPlan.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
