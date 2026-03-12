import { Router, type IRouter } from "express";
import { db, channelsTable, channelMembersTable, channelReferencesTable, referencesTable, usersTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import {
  CreateChannelBody,
  UpdateChannelBody,
  GetChannelParams,
  UpdateChannelParams,
  JoinChannelParams,
  LeaveChannelParams,
  ListChannelReferencesParams,
  AddChannelReferenceBody,
  AddChannelReferenceParams,
  ListChannelMembersParams,
} from "@workspace/api-zod";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

async function getChannelWithMeta(channelId: number, userId?: number) {
  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!channel) return null;

  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(channelMembersTable)
    .where(eq(channelMembersTable.channelId, channelId));

  let myRole = null;
  if (userId) {
    const [member] = await db
      .select()
      .from(channelMembersTable)
      .where(and(eq(channelMembersTable.channelId, channelId), eq(channelMembersTable.userId, userId)));
    myRole = member?.role || null;
  }

  return { ...channel, memberCount: Number(memberCount), myRole };
}

router.get("/channels", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const channels = await db.select().from(channelsTable);

  const result = await Promise.all(channels.map(async (ch) => {
    const [{ value: memberCount }] = await db
      .select({ value: count() })
      .from(channelMembersTable)
      .where(eq(channelMembersTable.channelId, ch.id));

    let myRole = null;
    if (req.userId) {
      const [member] = await db
        .select()
        .from(channelMembersTable)
        .where(and(eq(channelMembersTable.channelId, ch.id), eq(channelMembersTable.userId, req.userId)));
      myRole = member?.role || null;
    }

    return { ...ch, memberCount: Number(memberCount), myRole };
  }));

  res.json(result);
});

router.post("/channels", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [channel] = await db.insert(channelsTable).values({
    ...parsed.data,
    createdBy: req.userId!,
  }).returning();

  await db.insert(channelMembersTable).values({
    channelId: channel.id,
    userId: req.userId!,
    role: "OWNER",
  });

  const result = await getChannelWithMeta(channel.id, req.userId);
  res.status(201).json(result);
});

router.get("/channels/:id", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const channelWithMeta = await getChannelWithMeta(params.data.id, req.userId);
  if (!channelWithMeta) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const refs = await db
    .select({ reference: referencesTable })
    .from(channelReferencesTable)
    .innerJoin(referencesTable, eq(channelReferencesTable.referenceId, referencesTable.id))
    .where(eq(channelReferencesTable.channelId, params.data.id));

  const members = await db
    .select({
      channelId: channelMembersTable.channelId,
      userId: channelMembersTable.userId,
      role: channelMembersTable.role,
      joinedAt: channelMembersTable.joinedAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      },
    })
    .from(channelMembersTable)
    .innerJoin(usersTable, eq(channelMembersTable.userId, usersTable.id))
    .where(eq(channelMembersTable.channelId, params.data.id));

  res.json({
    ...channelWithMeta,
    references: refs.map(r => r.reference),
    members,
  });
});

router.put("/channels/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [member] = await db
    .select()
    .from(channelMembersTable)
    .where(and(eq(channelMembersTable.channelId, params.data.id), eq(channelMembersTable.userId, req.userId!)));

  if (!member || (member.role !== "OWNER" && member.role !== "MODERATOR")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [channel] = await db
    .update(channelsTable)
    .set(parsed.data)
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const result = await getChannelWithMeta(channel.id, req.userId);
  res.json(result);
});

router.post("/channels/:id/join", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = JoinChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, params.data.id));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(channelMembersTable)
    .where(and(eq(channelMembersTable.channelId, params.data.id), eq(channelMembersTable.userId, req.userId!)));

  if (existing) {
    res.status(409).json({ error: "Already a member" });
    return;
  }

  const [member] = await db.insert(channelMembersTable).values({
    channelId: params.data.id,
    userId: req.userId!,
    role: "MEMBER",
  }).returning();

  res.json(member);
});

router.post("/channels/:id/leave", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = LeaveChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(channelMembersTable)
    .where(and(eq(channelMembersTable.channelId, params.data.id), eq(channelMembersTable.userId, req.userId!)));

  res.sendStatus(204);
});

router.get("/channels/:id/references", optionalAuth, async (req, res): Promise<void> => {
  const params = ListChannelReferencesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const refs = await db
    .select({ reference: referencesTable })
    .from(channelReferencesTable)
    .innerJoin(referencesTable, eq(channelReferencesTable.referenceId, referencesTable.id))
    .where(eq(channelReferencesTable.channelId, params.data.id));

  res.json(refs.map(r => r.reference));
});

router.post("/channels/:id/references", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = AddChannelReferenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [member] = await db
    .select()
    .from(channelMembersTable)
    .where(and(eq(channelMembersTable.channelId, params.data.id), eq(channelMembersTable.userId, req.userId!)));

  if (!member || (member.role !== "OWNER" && member.role !== "MODERATOR")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = AddChannelReferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [channelRef] = await db.insert(channelReferencesTable).values({
    channelId: params.data.id,
    referenceId: parsed.data.referenceId,
  }).returning();

  res.status(201).json(channelRef);
});

router.get("/channels/:id/members", optionalAuth, async (req, res): Promise<void> => {
  const params = ListChannelMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const members = await db
    .select({
      channelId: channelMembersTable.channelId,
      userId: channelMembersTable.userId,
      role: channelMembersTable.role,
      joinedAt: channelMembersTable.joinedAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      },
    })
    .from(channelMembersTable)
    .innerJoin(usersTable, eq(channelMembersTable.userId, usersTable.id))
    .where(eq(channelMembersTable.channelId, params.data.id));

  res.json(members);
});

export default router;
