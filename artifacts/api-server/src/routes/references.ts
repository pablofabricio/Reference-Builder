import { Router, type IRouter } from "express";
import { db, referencesTable, referenceNodesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  CreateReferenceBody,
  UpdateReferenceBody,
  GetReferenceParams,
  UpdateReferenceParams,
  ListReferenceNodesParams,
  ListReferenceNodesQueryParams,
  CreateReferenceNodeParams,
  CreateReferenceNodeBody,
  ListReferencesQueryParams,
} from "@workspace/api-zod";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/references", optionalAuth, async (req, res): Promise<void> => {
  const query = ListReferencesQueryParams.safeParse(req.query);
  let rows;
  if (query.success && query.data.type) {
    rows = await db.select().from(referencesTable).where(eq(referencesTable.type, query.data.type as any));
  } else {
    rows = await db.select().from(referencesTable);
  }
  res.json(rows);
});

router.post("/references", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateReferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ref] = await db.insert(referencesTable).values(parsed.data as any).returning();
  res.status(201).json(ref);
});

router.get("/references/:id", async (req, res): Promise<void> => {
  const params = GetReferenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ref] = await db.select().from(referencesTable).where(eq(referencesTable.id, params.data.id));
  if (!ref) {
    res.status(404).json({ error: "Reference not found" });
    return;
  }
  res.json(ref);
});

router.put("/references/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateReferenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ref] = await db
    .update(referencesTable)
    .set(parsed.data as any)
    .where(eq(referencesTable.id, params.data.id))
    .returning();

  if (!ref) {
    res.status(404).json({ error: "Reference not found" });
    return;
  }
  res.json(ref);
});

router.get("/references/:referenceId/nodes", async (req, res): Promise<void> => {
  const params = ListReferenceNodesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = ListReferenceNodesQueryParams.safeParse(req.query);

  let condition;
  if (query.success && query.data.parentNodeId != null) {
    condition = and(
      eq(referenceNodesTable.referenceId, params.data.referenceId),
      eq(referenceNodesTable.parentNodeId, query.data.parentNodeId as number)
    );
  } else {
    condition = and(
      eq(referenceNodesTable.referenceId, params.data.referenceId),
      isNull(referenceNodesTable.parentNodeId)
    );
  }

  const nodes = await db.select().from(referenceNodesTable).where(condition).orderBy(referenceNodesTable.position);
  res.json(nodes);
});

router.post("/references/:referenceId/nodes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = CreateReferenceNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateReferenceNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [node] = await db.insert(referenceNodesTable).values({
    ...parsed.data as any,
    referenceId: params.data.referenceId,
  }).returning();

  res.status(201).json(node);
});

export default router;
