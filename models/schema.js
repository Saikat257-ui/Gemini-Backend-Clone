const { pgTable, serial, varchar, text, integer, timestamp, boolean, date } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

// Users table
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  mobileNumber: varchar('mobile_number', { length: 15 }).unique().notNull(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 100 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).default('basic'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
  dailyUsageCount: integer('daily_usage_count').default(0),
  lastUsageReset: date('last_usage_reset').default(new Date()),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// OTPs table
const otps = pgTable('otps', {
  id: serial('id').primaryKey(),
  mobileNumber: varchar('mobile_number', { length: 15 }).notNull(),
  otp: varchar('otp', { length: 6 }).notNull(),
  purpose: varchar('purpose', { length: 20 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Chatrooms table
const chatrooms = pgTable('chatrooms', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Messages table
const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  chatroomId: integer('chatroom_id').references(() => chatrooms.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 20 }).default('user'),
  geminiResponse: text('gemini_response'),
  status: varchar('status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Subscriptions table
const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }).unique(),
  status: varchar('status', { length: 20 }).notNull(),
  tier: varchar('tier', { length: 20 }).notNull(),
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
const usersRelations = relations(users, ({ many }) => ({
  chatrooms: many(chatrooms),
  messages: many(messages),
  subscriptions: many(subscriptions),
}));

const chatroomsRelations = relations(chatrooms, ({ one, many }) => ({
  user: one(users, { fields: [chatrooms.userId], references: [users.id] }),
  messages: many(messages),
}));

const messagesRelations = relations(messages, ({ one }) => ({
  chatroom: one(chatrooms, { fields: [messages.chatroomId], references: [chatrooms.id] }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
}));

const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

module.exports = {
  users,
  otps,
  chatrooms,
  messages,
  subscriptions,
  usersRelations,
  chatroomsRelations,
  messagesRelations,
  subscriptionsRelations,
};
