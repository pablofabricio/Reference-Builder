import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { getListNotesQueryKey, useDeleteNote, useListChannels, useListNotes, useListReferences } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Search, PenTool, MessageSquare, Plus, Trash2, Edit2, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ReferencesList() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [referenceIdByNodeId, setReferenceIdByNodeId] = useState<Record<number, number>>({});
  const [channelIdByReferenceId, setChannelIdByReferenceId] = useState<Record<number, number>>({});

  const { data: references } = useListReferences();
  const { data: channels } = useListChannels();
  const { data: allNotes, isLoading: loadingNotes } = useListNotes();
  const deleteNoteMutation = useDeleteNote();

  const referencesById = useMemo(() => {
    const map = new Map<number, any>();
    (references ?? []).forEach((ref: any) => {
      const id = Number(ref.id);
      if (!Number.isNaN(id)) map.set(id, ref);
    });
    return map;
  }, [references]);

  const channelsById = useMemo(() => {
    const map = new Map<number, any>();
    (channels ?? []).forEach((channel: any) => {
      const id = Number(channel.id);
      if (!Number.isNaN(id)) map.set(id, channel);
    });
    return map;
  }, [channels]);

  useEffect(() => {
    let isMounted = true;

    const loadMappings = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        const [nodesResponse, channelRefsResponse] = await Promise.all([
          fetch("/api/reference-nodes", { headers }),
          fetch("/api/channel-references", { headers }),
        ]);

        const nodesPayload = await nodesResponse.json().catch(() => ({}));
        const channelRefsPayload = await channelRefsResponse.json().catch(() => ({}));

        const nodes = Array.isArray(nodesPayload?.data)
          ? nodesPayload.data
          : Array.isArray(nodesPayload)
            ? nodesPayload
            : [];

        const channelRefs = Array.isArray(channelRefsPayload?.data)
          ? channelRefsPayload.data
          : Array.isArray(channelRefsPayload)
            ? channelRefsPayload
            : [];

        if (!isMounted) return;

        const nodeMap: Record<number, number> = {};
        nodes.forEach((row: any) => {
          const nodeId = Number(row.id);
          const referenceId = Number(row.reference_id ?? row.referenceId);
          if (!Number.isNaN(nodeId) && !Number.isNaN(referenceId) && referenceId > 0) {
            nodeMap[nodeId] = referenceId;
          }
        });

        const referenceMap: Record<number, number> = {};
        channelRefs.forEach((row: any) => {
          const referenceId = Number(row.reference_id ?? row.referenceId);
          const channelId = Number(row.channel_id ?? row.channelId);
          if (!Number.isNaN(referenceId) && !Number.isNaN(channelId) && referenceId > 0 && channelId > 0 && !referenceMap[referenceId]) {
            referenceMap[referenceId] = channelId;
          }
        });

        setReferenceIdByNodeId(nodeMap);
        setChannelIdByReferenceId(referenceMap);
      } catch {
        if (!isMounted) return;
        setReferenceIdByNodeId({});
        setChannelIdByReferenceId({});
      }
    };

    loadMappings();

    return () => {
      isMounted = false;
    };
  }, []);

  const myRecentNotes = useMemo(() => {
    const term = search.trim().toLowerCase();

    const base = (allNotes ?? [])
      .filter((note: any) => {
        const isMine = Number(note.userId ?? note.user_id ?? 0) === Number(user?.id);
        const referenceNodeId = Number(note.referenceNodeId ?? note.reference_node_id ?? note.referenceNode?.id ?? note.reference_node?.id ?? 0);
        const nestedReferenceId = Number(note.referenceNode?.referenceId ?? note.reference_node?.reference_id ?? 0);
        const referenceId = nestedReferenceId > 0 ? nestedReferenceId : Number(referenceIdByNodeId[referenceNodeId] ?? 0);
        const directChannelId = Number(note.channelId ?? note.channel_id ?? 0);
        const channelId = directChannelId > 0 ? directChannelId : Number(channelIdByReferenceId[referenceId] ?? 0);
        return (
          isMine &&
          referenceNodeId > 0 &&
          referenceId > 0 &&
          channelId > 0
        );
      })
      .sort((a: any, b: any) => {
        const aDate = a.createdAt || a.created_at;
        const bDate = b.createdAt || b.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

    if (!term) return base;

    return base.filter((note: any) => {
      const referenceNodeId = Number(note.referenceNodeId ?? note.reference_node_id ?? note.referenceNode?.id ?? note.reference_node?.id ?? 0);
      const nestedReferenceId = Number(note.referenceNode?.referenceId ?? note.reference_node?.reference_id ?? 0);
      const referenceId = nestedReferenceId > 0 ? nestedReferenceId : Number(referenceIdByNodeId[referenceNodeId] ?? 0);
      const referenceTitle = String(referencesById.get(referenceId)?.title || "").toLowerCase();
      const referenceLabel = String(note.referenceNode?.label || note.reference_node?.label || "").toLowerCase();
      const directChannelId = Number(note.channelId ?? note.channel_id ?? 0);
      const channelId = directChannelId > 0 ? directChannelId : Number(channelIdByReferenceId[referenceId] ?? 0);
      const channelName = String(channelsById.get(channelId)?.name || "").toLowerCase();
      const content = String(note.content || "").toLowerCase();

      return content.includes(term) || referenceTitle.includes(term) || referenceLabel.includes(term) || channelName.includes(term);
    })
  }, [allNotes, user?.id, search, referencesById, channelsById, referenceIdByNodeId, channelIdByReferenceId]);

  const getReferenceMeta = (note: any) => {
    const refNode = note.referenceNode ?? note.reference_node;
    const referenceNodeId = Number(note.referenceNodeId ?? note.reference_node_id ?? refNode?.id ?? 0);
    const nestedReferenceId = Number(refNode?.referenceId ?? refNode?.reference_id ?? 0);
    const referenceId = nestedReferenceId > 0 ? nestedReferenceId : Number(referenceIdByNodeId[referenceNodeId] ?? 0);
    const reference = referencesById.get(referenceId);

    return {
      referenceId: referenceId || null,
      text: reference?.title || refNode?.label || "Sem referencia",
    };
  };

  const getChannelMeta = (note: any) => {
    const reference = getReferenceMeta(note);
    const directChannelId = Number(note.channelId ?? note.channel_id ?? 0);
    const channelId = directChannelId > 0 ? directChannelId : Number(channelIdByReferenceId[Number(reference.referenceId ?? 0)] ?? 0);
    const channel = channelsById.get(channelId);

    return {
      channelId: channelId || null,
      text: channel?.name || (channelId ? `Channel ${channelId}` : "Sem channel"),
    };
  };

  const handleDeleteNote = (id: number) => {
    if (!window.confirm("Excluir esta note?")) return;

    deleteNoteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/50 pb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-3">Library</h1>
            <p className="text-lg text-muted-foreground font-serif">Suas notas mais recentes, com contexto de referencia e channel.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar em notas, referencia ou channel..."
                className="pl-9 rounded-xl bg-card border-border/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Link href="/notes/new">
              <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Nova nota
              </Button>
            </Link>
          </div>
        </div>

        {loadingNotes ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : myRecentNotes?.length === 0 ? (
          <div className="rounded-3xl border border-border/50 bg-card/70 px-6 py-12 text-center">
            <PenTool className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground font-serif">Nenhuma nota encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myRecentNotes.map((note: any) => {
              const reference = getReferenceMeta(note);
              const channel = getChannelMeta(note);
              const createdAt = (note as any).createdAt || (note as any).created_at;

              return (
                <Card key={note.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 bg-card group">
                  <CardHeader className="pb-3 border-b border-border/30">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {createdAt ? format(new Date(createdAt), "MMMM d, yyyy") : ""}
                        </p>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-md border border-border/50">
                          {note.visibility}
                        </span>
                      </div>
                      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/notes/${note.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteNote(note.id)}
                          disabled={deleteNoteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <p className="font-serif text-foreground/90 text-lg leading-relaxed line-clamp-6">
                      {note.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Link href={`/references/${reference.referenceId}`}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                          <BookOpen className="w-3.5 h-3.5" />
                          {reference.text}
                        </span>
                      </Link>

                      <Link href={`/channels/${channel.channelId}`}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {channel.text}
                        </span>
                      </Link>
                    </div>
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
