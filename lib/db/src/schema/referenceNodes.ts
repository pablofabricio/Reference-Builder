import { pgTable, text, serial, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { referencesTable } from "./references";

export const nodeTypeEnum = ["BOOK", "CHAPTER", "VERSE", "PAGE", "SESSION", "STANZA", "LINE", "PARAGRAPH"] as const;

export const referenceNodesTable = pgTable("reference_nodes", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: nodeTypeEnum }).notNull(),
  content: text("content"),
  label: text("label").notNull(),
  referenceId: integer("reference_id").notNull().references(() => referencesTable.id, { onDelete: "cascade" }),
  parentNodeId: integer("parent_node_id"),
  position: integer("position").notNull(),
}, (table) => [
  unique().on(table.referenceId, table.parentNodeId, table.position),
]);

export const insertReferenceNodeSchema = createInsertSchema(referenceNodesTable).omit({ id: true });
export type InsertReferenceNode = z.infer<typeof insertReferenceNodeSchema>;
export type ReferenceNode = typeof referenceNodesTable.$inferSelect;
