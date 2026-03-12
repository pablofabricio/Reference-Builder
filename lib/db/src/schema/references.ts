import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referenceTypeEnum = ["BIBLE", "MUSIC", "POEM", "BOOK", "SERMON"] as const;

export const referencesTable = pgTable("references", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: referenceTypeEnum }).notNull(),
  title: text("title").notNull(),
  abbreviation: text("abbreviation"),
  author: text("author"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReferenceSchema = createInsertSchema(referencesTable).omit({ id: true, createdAt: true });
export type InsertReference = z.infer<typeof insertReferenceSchema>;
export type Reference = typeof referencesTable.$inferSelect;
