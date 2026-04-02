import { useEffect, useMemo, useState } from "react";
import { useListNotes, useListChannels, useListReferences } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user } = useAuth();
  const { data: channelNotes, isLoading: loadingChannelNotes } = useListNotes({ visibility: "CHANNEL" });
  const { data: myNotes, isLoading: loadingMyNotes } = useListNotes();
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const { data: references, isLoading: loadingReferences } = useListReferences();
  const [channelReferenceLinks, setChannelReferenceLinks] = useState<any[]>([]);
  const [referenceNodesById, setReferenceNodesById] = useState<Record<number, { referenceId: number; label: string; content: string }>>({});
  const [usersById, setUsersById] = useState<Record<number, string>>({});
  const [memberChannelIds, setMemberChannelIds] = useState<number[]>([]);
  const [loadingChannelReferenceLinks, setLoadingChannelReferenceLinks] = useState(true);
  const [loadingReferenceNodes, setLoadingReferenceNodes] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMemberships, setLoadingMemberships] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadReferenceNodes = async () => {
      setLoadingReferenceNodes(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch("/api/reference-nodes", { headers });
        if (!response.ok) throw new Error("Failed to load reference nodes");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mapped = rows.reduce((acc: Record<number, { referenceId: number; label: string; content: string }>, node: any) => {
          const nodeId = Number(node?.id ?? 0);
          const referenceId = Number(node?.referenceId ?? node?.reference_id ?? 0);
          const label = String(node?.label || "");
          const content = String(node?.content || "");
          if (nodeId > 0 && referenceId > 0) {
            acc[nodeId] = { referenceId, label: label || `Node ${nodeId}`, content };
          }
          return acc;
        }, {});

        if (isMounted) setReferenceNodesById(mapped);
      } catch {
        if (isMounted) setReferenceNodesById({});
      } finally {
        if (isMounted) setLoadingReferenceNodes(false);
      }
    };

    loadReferenceNodes();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadChannelReferenceLinks = async () => {
      setLoadingChannelReferenceLinks(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch("/api/channel-references", { headers });
        if (!response.ok) throw new Error("Failed to load channel references");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        if (isMounted) setChannelReferenceLinks(rows);
      } catch {
        if (isMounted) setChannelReferenceLinks([]);
      } finally {
        if (isMounted) setLoadingChannelReferenceLinks(false);
      }
    };

    loadChannelReferenceLinks();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await fetch("/api/users");
        if (!response.ok) throw new Error("Failed to load users");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mapped = rows.reduce((acc: Record<number, string>, row: any) => {
          const id = Number(row?.id ?? 0);
          const name = String(row?.name || "").trim();
          if (id > 0 && name) {
            acc[id] = name;
          }
          return acc;
        }, {});

        if (isMounted) setUsersById(mapped);
      } catch {
        if (isMounted) setUsersById({});
      } finally {
        if (isMounted) setLoadingUsers(false);
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMemberships = async () => {
      if (!user?.id) {
        if (isMounted) {
          setMemberChannelIds([]);
          setLoadingMemberships(false);
        }
        return;
      }

      setLoadingMemberships(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch("/api/channel-members", { headers });
        if (!response.ok) throw new Error("Failed to load memberships");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows
          .filter((row: any) => Number(row.user_id ?? row.userId ?? 0) === Number(user.id))
          .map((row: any) => Number(row.channel_id ?? row.channelId ?? 0))
          .filter((id: number) => id > 0);

        if (isMounted) setMemberChannelIds(Array.from(new Set(mine)));
      } catch {
        if (isMounted) setMemberChannelIds([]);
      } finally {
        if (isMounted) setLoadingMemberships(false);
      }
    };

    loadMemberships();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const channelsById = useMemo(() => {
    const map = new Map<number, any>();
    (channels ?? []).forEach((channel: any) => {
      const id = Number(channel?.id ?? 0);
      if (id > 0) map.set(id, channel);
    });
    return map;
  }, [channels]);

  const referencesById = useMemo(() => {
    const map = new Map<number, any>();
    (references ?? []).forEach((reference: any) => {
      const id = Number(reference?.id ?? 0);
      if (id > 0) map.set(id, reference);
    });
    return map;
  }, [references]);

  const participatingChannelIds = useMemo(() => {
    const ids = new Set<number>();

    (channels ?? []).forEach((channel: any) => {
      const channelId = Number(channel?.id ?? 0);
      const creatorId = Number(channel?.createdBy ?? channel?.created_by ?? 0);
      const hasMyRole = Boolean(channel?.myRole);
      const isOwner = creatorId === Number(user?.id ?? 0);
      const isMember = memberChannelIds.includes(channelId);

      if (isOwner || isMember || hasMyRole) {
        ids.add(channelId);
      }
    });

    return ids;
  }, [channels, memberChannelIds, user?.id]);

  const feedNotes = useMemo(() => {
    const getAuthorId = (note: any) => Number(note?.user?.id ?? note?.userId ?? note?.user_id ?? 0);
    const getChannelId = (note: any) => Number(note?.channelId ?? note?.channel_id ?? 0);
    const getCreatedAt = (note: any) => String(note?.createdAt ?? note?.created_at ?? "");
    const getReferenceInfo = (note: any) => {
      const directReferenceId = Number(note?.referenceNode?.referenceId ?? 0);
      const directLabel = String(note?.referenceNode?.label || "").trim();
      const directContent = String(note?.referenceNode?.content || "").trim();
      if (directReferenceId > 0) {
        return {
          referenceId: directReferenceId,
          label: directLabel || `Referencia ${directReferenceId}`,
          content: directContent,
        };
      }

      const nodeId = Number(note?.referenceNodeId ?? note?.reference_node_id ?? 0);
      if (nodeId > 0 && referenceNodesById[nodeId]) {
        return {
          referenceId: Number(referenceNodesById[nodeId].referenceId),
          label: String(referenceNodesById[nodeId].label || `Referencia ${referenceNodesById[nodeId].referenceId}`),
          content: String(referenceNodesById[nodeId].content || ""),
        };
      }

      return { referenceId: 0, label: "", content: "" };
    };

    const participatingReferenceIds = new Set<number>(
      (channelReferenceLinks ?? [])
        .filter((link: any) => participatingChannelIds.has(Number(link?.channel_id ?? link?.channelId ?? 0)))
        .map((link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0))
        .filter((referenceId: number) => referenceId > 0),
    );

    const channelRelated = (channelNotes ?? []).filter((note: any) => {
      const channelId = getChannelId(note);
      if (channelId > 0) {
        return participatingChannelIds.has(channelId);
      }

      const referenceId = getReferenceInfo(note).referenceId;
      const visibility = String(note?.visibility || "").toUpperCase();
      return visibility === "CHANNEL" && referenceId > 0 && participatingReferenceIds.has(referenceId);
    });

    const myOutsideChannels = (myNotes ?? []).filter((note: any) => {
      const channelId = getChannelId(note);
      const authorId = getAuthorId(note);
      return channelId <= 0 && authorId === Number(user?.id ?? 0);
    });

    const combined = [...channelRelated, ...myOutsideChannels]
      .map((note: any) => {
        const channelId = getChannelId(note);
        const referenceId = getReferenceInfo(note).referenceId;
        const visibility = String(note?.visibility || "").toUpperCase();

        const hasChannelOrigin =
          (channelId > 0 && participatingChannelIds.has(channelId)) ||
          (visibility === "CHANNEL" && referenceId > 0 && participatingReferenceIds.has(referenceId));

        return { ...note, __origin: hasChannelOrigin ? "CHANNEL" : "REFERENCE" };
      })
      .reduce((acc: any[], note: any) => {
        if (acc.some((existing) => Number(existing.id) === Number(note.id))) return acc;
        acc.push(note);
        return acc;
      }, [])
      .sort((a: any, b: any) => {
        const aTs = new Date(getCreatedAt(a)).getTime() || 0;
        const bTs = new Date(getCreatedAt(b)).getTime() || 0;
        return bTs - aTs;
      });

    return combined;
  }, [channelNotes, myNotes, participatingChannelIds, user?.id, referenceNodesById, channelReferenceLinks]);

  const isLoading =
    loadingChannelNotes ||
    loadingMyNotes ||
    loadingChannels ||
    loadingReferences ||
    loadingMemberships ||
    loadingReferenceNodes ||
    loadingUsers ||
    loadingChannelReferenceLinks;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : feedNotes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground font-serif bg-card rounded-2xl border border-border/50">
            Nenhuma nota recente encontrada para os seus canais e referencias.
          </div>
        ) : (
          <div className="space-y-5">
            {feedNotes.map((note: any) => {
              const authorId = Number(note?.user?.id ?? note?.userId ?? note?.user_id ?? 0);
              const authorName = String(note?.user?.name || usersById[authorId] || `Usuario ${authorId || "desconhecido"}`).trim();
              const createdAt = note?.createdAt || note?.created_at;
              const channelId = Number(note?.channelId ?? note?.channel_id ?? 0);
              const noteNodeId = Number(note?.referenceNodeId ?? note?.reference_node_id ?? 0);
              const mappedReference = noteNodeId > 0 ? referenceNodesById[noteNodeId] : undefined;
              const referenceId = Number(note?.referenceNode?.referenceId ?? mappedReference?.referenceId ?? 0);
              const referenceLabel = String(note?.referenceNode?.label || mappedReference?.label || `Referencia ${referenceId || ""}`);
              const referenceContent = String(note?.referenceNode?.content || mappedReference?.content || "").trim();
              const referenceRow = referenceId > 0 ? referencesById.get(referenceId) : null;
              const referenceTitle = String(referenceRow?.title || referenceLabel || `Referencia ${referenceId || ""}`);
              const referenceType = String(referenceRow?.type || "").trim().toUpperCase();
              const fallbackChannelId = channelId > 0
                ? channelId
                : Number(
                    (channelReferenceLinks ?? []).find(
                      (link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0) === referenceId,
                    )?.channel_id ??
                    (channelReferenceLinks ?? []).find(
                      (link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0) === referenceId,
                    )?.channelId ??
                    0,
                  );
              const channelName = fallbackChannelId > 0
                ? String(channelsById.get(fallbackChannelId)?.name || `Canal ${fallbackChannelId}`)
                : null;
              const resolvedReferenceHref = referenceId > 0
                ? `/references/${referenceId}?view=reading${noteNodeId > 0 ? `&node=${noteNodeId}` : ""}`
                : "/references";
              const hasChannelOrigin = fallbackChannelId > 0 && participatingChannelIds.has(fallbackChannelId);
              const sourceName = hasChannelOrigin
                ? (channelName || "Canal")
                : referenceTitle;
              const sourceHref = hasChannelOrigin && fallbackChannelId > 0
                ? `/channels/${fallbackChannelId}`
                : resolvedReferenceHref;
              const metaBadge = hasChannelOrigin
                ? "Canal"
                : (referenceType || "Referencia");

              return (
                <Card key={note.id} className="rounded-2xl border-border/50 shadow-sm">
                  <CardHeader className="pb-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-secondary-foreground border border-border">
                        {(authorName.charAt(0) || "U").toUpperCase()}
                      </div>
                      <div>
                        {authorId > 0 ? (
                          <Link href={`/channels/user/${authorId}`}>
                            <CardTitle className="text-base hover:text-primary transition-colors">{authorName}</CardTitle>
                          </Link>
                        ) : (
                          <CardTitle className="text-base">{authorName}</CardTitle>
                        )}
                        <p className="text-xs text-muted-foreground">{createdAt ? format(new Date(createdAt), "dd/MM/yyyy HH:mm") : "Sem horario"}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={sourceHref}>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/40 hover:bg-secondary rounded-lg text-xs font-medium cursor-pointer transition-colors border border-border/50">
                          {sourceName}
                        </div>
                      </Link>

                      <Link href={resolvedReferenceHref}>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/40 hover:bg-secondary rounded-lg text-xs font-medium cursor-pointer transition-colors border border-border/50">
                          <BookOpen className="w-3.5 h-3.5" />
                          {referenceLabel}
                        </div>
                      </Link>

                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border bg-muted text-muted-foreground border-border/60">
                        {metaBadge}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {referenceContent ? (
                      <Link href={resolvedReferenceHref}>
                        <p className="font-serif text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap mb-3 hover:text-foreground transition-colors cursor-pointer">
                          {referenceContent}
                        </p>
                      </Link>
                    ) : null}
                    <Link href={resolvedReferenceHref}>
                      <p className="font-serif text-foreground leading-relaxed whitespace-pre-wrap text-lg hover:text-primary transition-colors cursor-pointer">
                        {note.content}
                      </p>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
