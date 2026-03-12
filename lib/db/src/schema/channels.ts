import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { referencesTable } from "./references";

export const channelMemberRoleEnum = ["OWNER", "MODERATOR", "MEMBER", "VIEWER"] as const;

export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelReferencesTable = pgTable("channel_references", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channelsTable.id, { onDelete: "cascade" }),
  referenceId: integer("reference_id").notNull().references(() => referencesTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique().on(table.channelId, table.referenceId),
]);

export const channelMembersTable = pgTable("channel_members", {
  channelId: integer("channel_id").notNull().references(() => channelsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: channelMemberRoleEnum }).notNull().default("MEMBER"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.channelId, table.userId),
]);

export const insertChannelSchema = createInsertSchema(channelsTable).omit({ id: true, createdAt: true });
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channelsTable.$inferSelect;

export const insertChannelMemberSchema = createInsertSchema(channelMembersTable).omit({ joinedAt: true });
export type InsertChannelMember = z.infer<typeof insertChannelMemberSchema>;
export type ChannelMember = typeof channelMembersTable.$inferSelect;
