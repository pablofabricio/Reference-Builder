import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { referenceNodesTable } from "./referenceNodes";
import { channelsTable } from "./channels";

export const noteVisibilityEnum = ["PRIVATE", "PUBLIC", "CHANNEL"] as const;

export const notesTable = pgTable("notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  referenceNodeId: integer("reference_node_id").references(() => referenceNodesTable.id, { onDelete: "set null" }),
  channelId: integer("channel_id").references(() => channelsTable.id, { onDelete: "set null" }),
  visibility: text("visibility", { enum: noteVisibilityEnum }).notNull().default("PRIVATE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notesTable).omit({ id: true, createdAt: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notesTable.$inferSelect;
