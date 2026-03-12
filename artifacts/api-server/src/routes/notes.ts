import { Router, type IRouter } from "express";
import { db, notesTable, usersTable, referenceNodesTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import {
  CreateNoteBody,
  UpdateNoteBody,
  GetNoteParams,
  UpdateNoteParams,
  DeleteNoteParams,
  ListNotesQueryParams,
} from "@workspace/api-zod";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

async function formatNote(note: typeof notesTable.$inferSelect) {
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, note.userId));

  let referenceNode = null;
  if (note.referenceNodeId) {
    const [node] = await db.select({
      id: referenceNodesTable.id,
      label: referenceNodesTable.label,
      referenceId: referenceNodesTable.referenceId,
    }).from(referenceNodesTable).where(eq(referenceNodesTable.id, note.referenceNodeId));
    referenceNode = node || null;
  }

  return {
    ...note,
    user: user || { id: note.userId, name: "Unknown", email: "", createdAt: new Date() },
    referenceNode,
  };
}

router.get("/notes", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const query = ListNotesQueryParams.safeParse(req.query);

  const conditions = [];

  if (req.userId) {
    conditions.push(
      or(
        eq(notesTable.userId, req.userId),
        eq(notesTable.visibility, "PUBLIC")
      )
    );
  } else {
    conditions.push(eq(notesTable.visibility, "PUBLIC"));
  }

  if (query.success && query.data.referenceNodeId) {
    conditions.push(eq(notesTable.referenceNodeId, query.data.referenceNodeId));
  }

  if (query.success && query.data.visibility) {
    conditions.push(eq(notesTable.visibility, query.data.visibility as any));
  }

  const rows = await db.select().from(notesTable).where(and(...conditions)).orderBy(notesTable.createdAt);
  const notes = await Promise.all(rows.map(formatNote));
  res.json(notes);
});

router.post("/notes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db.insert(notesTable).values({
    ...parsed.data as any,
    userId: req.userId!,
  }).returning();

  const formatted = await formatNote(note);
  res.status(201).json(formatted);
});

router.get("/notes/:id", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [note] = await db.select().from(notesTable).where(eq(notesTable.id, params.data.id));
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  if (note.visibility === "PRIVATE" && note.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const formatted = await formatNote(note);
  res.json(formatted);
});

router.put("/notes/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(notesTable).where(eq(notesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db
    .update(notesTable)
    .set(parsed.data as any)
    .where(eq(notesTable.id, params.data.id))
    .returning();

  const formatted = await formatNote(note);
  res.json(formatted);
});

router.delete("/notes/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(notesTable).where(eq(notesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(notesTable).where(eq(notesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
