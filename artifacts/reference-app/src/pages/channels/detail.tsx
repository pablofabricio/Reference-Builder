import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocation, useParams } from "wouter";
import { useListChannels, useListChannelReferences, useListNotes, useListReferences, useDeleteNote, getListChannelsQueryKey, getListNotesQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Book, Music, PenTool, Library, MessageSquare, UserRound, BookOpen, Search, ChevronDown, ChevronRight, FileText, Copy, MessageCircle, Plus, X, Trash2, Edit2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const typeIcons: Record<string, ReactElement> = {
  BIBLE: <Book className="w-5 h-5" />,
  BOOK: <Library className="w-5 h-5" />,
  POEM: <PenTool className="w-5 h-5" />,
  MUSIC: <Music className="w-5 h-5" />,
  SERMON: <MessageSquare className="w-5 h-5" />,
};

export default function ChannelDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const channelId = parseInt(id || "0", 10);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedRefs, setExpandedRefs] = useState<number[]>([]);
  const [expandedNodeNotes, setExpandedNodeNotes] = useState<number[]>([]);
  const [collapsedNodes, setCollapsedNodes] = useState<number[]>([]);
  const [usersById, setUsersById] = useState<Record<number, string>>({});
  const [referenceNodesById, setReferenceNodesById] = useState<Record<number, any[]>>({});
  const [loadingNodesById, setLoadingNodesById] = useState<Record<number, boolean>>({});
  const [createdNotes, setCreatedNotes] = useState<any[]>([]);
  const [deletedNoteIds, setDeletedNoteIds] = useState<number[]>([]);
  const [editorNodeId, setEditorNodeId] = useState<number | null>(null);
  const [noteDraftByNode, setNoteDraftByNode] = useState<Record<number, string>>({});
  const [savingNoteByNode, setSavingNoteByNode] = useState<Record<number, boolean>>({});
  const [deletingNoteById, setDeletingNoteById] = useState<Record<number, boolean>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState<number | null>(null);
  const [isEditingChannelInline, setIsEditingChannelInline] = useState(false);
  const [isEditingReference, setIsEditingReference] = useState(false);
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [myChannelRole, setMyChannelRole] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState<{ label: string; content: string }>({ label: "", content: "" });
  const [savingNodeEdit, setSavingNodeEdit] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", type: "BIBLE", author: "", description: "" });
  const [editForm, setEditForm] = useState({ id: 0, title: "", type: "BIBLE", author: "", description: "" });
  const [editChannelForm, setEditChannelForm] = useState({ id: 0, name: "", description: "", visibility: "PRIVATE" });
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);

  const { data: channels, isLoading: loadingChannel } = useListChannels();
  const { data: channelReferenceLinks, isLoading: loadingChannelReferences } = useListChannelReferences(channelId);
  const { data: allReferences, isLoading: loadingReferences } = useListReferences();
  const { data: allNotes, isLoading: loadingNotes } = useListNotes();
  const deleteNoteMutation = useDeleteNote();
  const mergedNotes = useMemo(() => {
    const list = [...(allNotes ?? []), ...createdNotes].filter(
      (note: any) => !deletedNoteIds.includes(Number(note.id)),
    );
    const deduped = new Map<number, any>();

    list.forEach((note: any) => {
      const id = Number(note.id);
      if (!Number.isNaN(id)) {
        deduped.set(id, note);
      }
    });

    return Array.from(deduped.values());
  }, [allNotes, createdNotes, deletedNoteIds]);

  const channel = useMemo(
    () => (channels ?? []).find((row: any) => Number(row.id) === channelId),
    [channels, channelId],
  );

  const creatorId = Number((channel as any)?.createdBy ?? (channel as any)?.created_by ?? 0);
  const creatorName = creatorId === Number(user?.id) ? "Voce" : `Usuario ${creatorId}`;

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      try {
        const response = await fetch("/api/users");
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mapped = rows.reduce((acc: Record<number, string>, row: any) => {
          const id = Number(row.id);
          if (!Number.isNaN(id) && typeof row.name === "string") {
            acc[id] = row.name;
          }
          return acc;
        }, {});

        if (isMounted) {
          setUsersById(mapped);
        }
      } catch {
        if (isMounted) {
          setUsersById({});
        }
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!channelId || !user?.id) return;

    const loadMembership = async () => {
      try {
        const response = await fetch(`/api/channel-members?channel_id=${channelId}`);
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows.find((row: any) => {
          const rowUserId = Number(row.user_id ?? row.userId ?? row.user?.id ?? 0);
          return rowUserId === Number(user.id);
        });

        if (isMounted) {
          setMyChannelRole(String(mine?.role || ""));
        }
      } catch {
        if (isMounted) setMyChannelRole(null);
      }
    };

    loadMembership();
    return () => {
      isMounted = false;
    };
  }, [channelId, user?.id]);

  const references = useMemo(() => {
    if (!allReferences) return [];

    const ids = new Set(
      (channelReferenceLinks ?? [])
        .filter((row: any) => Number(row.channelId ?? row.channel_id) === channelId)
        .map((row: any) => Number(row.referenceId ?? row.reference_id))
        .filter((value: number) => !Number.isNaN(value)),
    );

    return allReferences.filter((ref: any) => ids.has(Number(ref.id)));
  }, [allReferences, channelReferenceLinks, channelId]);

  const filteredReferences = references
    .filter((ref: any) => {
      const typeMatches = filterType ? ref.type === filterType : true;
      const searchMatches =
        ref.title.toLowerCase().includes(search.toLowerCase()) ||
        ref.author?.toLowerCase().includes(search.toLowerCase());

      return typeMatches && searchMatches;
    })
    .sort((a: any, b: any) => {
      const getWeekOrder = (value: any) => {
        const text = String(value?.title || "");
        const match = text.match(/Semana\s*(\d+)/i);
        if (match) return Number(match[1]);
        if (/Filipenses\s*1:1/i.test(text)) return 1;
        return 999;
      };

      return getWeekOrder(a) - getWeekOrder(b);
    });

  const isOwner = creatorId === Number(user?.id);
  const canChannelActions = isOwner || myChannelRole === "OWNER" || myChannelRole === "MODERATOR";
  const canDeleteChannel = isOwner || myChannelRole === "OWNER";

  const handleCreateReference = async () => {
    if (!createForm.title.trim()) return;
    setIsCreating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const refRes = await fetch("/api/references", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: createForm.title, type: createForm.type, author: createForm.author || undefined, description: createForm.description || undefined }),
      });
      if (!refRes.ok) throw new Error("Erro ao criar referencia");
      const newRef = await refRes.json();
      const refId = Number(newRef.id ?? newRef.data?.id);

      await fetch(`/api/channels/${channelId}/references`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reference_id: refId }),
      });

      toast({ title: "Referencia criada", description: createForm.title });
      setShowCreateDialog(false);
      setCreateForm({ title: "", type: "BIBLE", author: "", description: "" });
      window.location.reload();
    } catch (e: any) {
      toast({ title: e.message || "Erro ao criar", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditReference = async () => {
    if (!editForm.id || !editForm.title.trim()) return;

    setIsEditingReference(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/references/${editForm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: editForm.title,
          type: editForm.type,
          author: editForm.author || undefined,
          description: editForm.description || undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel editar a referencia");
      }

      toast({ title: "Referencia atualizada" });
      setEditingReferenceId(null);
      window.location.reload();
    } catch (e: any) {
      toast({ title: e?.message || "Erro ao editar referencia", variant: "destructive" });
    } finally {
      setIsEditingReference(false);
    }
  };

  const handleEditChannel = async () => {
    if (!editChannelForm.id || !editChannelForm.name.trim()) return;

    setIsEditingChannel(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/channels/${editChannelForm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: editChannelForm.name,
          description: editChannelForm.description || undefined,
          visibility: editChannelForm.visibility,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel editar o channel");
      }

      toast({ title: "Channel atualizado" });
      setIsEditingChannelInline(false);
      window.location.reload();
    } catch (e: any) {
      toast({ title: e?.message || "Erro ao editar channel", variant: "destructive" });
    } finally {
      setIsEditingChannel(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelId || !canDeleteChannel || isDeletingChannel) return;

    const confirmed = window.confirm("Excluir este channel? Esta acao nao pode ser desfeita.");
    if (!confirmed) return;

    setIsDeletingChannel(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel excluir o channel");
      }

      queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      toast({ title: "Channel excluido" });
      setLocation("/channels");
    } catch (e: any) {
      toast({ title: e?.message || "Erro ao excluir channel", variant: "destructive" });
    } finally {
      setIsDeletingChannel(false);
    }
  };

  const loadReferenceNodes = async (referenceId: number, force = false) => {
    if (!force && (referenceNodesById[referenceId] || loadingNodesById[referenceId])) {
      return;
    }

    setLoadingNodesById((prev) => ({ ...prev, [referenceId]: true }));

    try {
      const response = await fetch(`/api/reference-nodes?reference_id=${referenceId}`);
      if (!response.ok) {
        setReferenceNodesById((prev) => ({ ...prev, [referenceId]: [] }));
        return;
      }

      const payload = await response.json();
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      const filtered = rows.filter(
        (row: any) => Number(row.reference_id ?? row.referenceId) === referenceId,
      );

      setReferenceNodesById((prev) => ({ ...prev, [referenceId]: filtered }));
    } catch {
      setReferenceNodesById((prev) => ({ ...prev, [referenceId]: [] }));
    } finally {
      setLoadingNodesById((prev) => ({ ...prev, [referenceId]: false }));
    }
  };

  useEffect(() => {
    if (!references.length) return;
    references.forEach((ref: any) => {
      const refId = Number(ref.id);
      if (!Number.isNaN(refId)) {
        loadReferenceNodes(refId);
      }
    });
  }, [references]);

  const toggleReference = (referenceId: number) => {
    setExpandedRefs((prev) => {
      const isOpen = prev.includes(referenceId);
      if (isOpen) {
        return prev.filter((id) => id !== referenceId);
      }

      loadReferenceNodes(referenceId);
      return [...prev, referenceId];
    });
  };

  const getNotesForNode = (nodeId: number) =>
    mergedNotes.filter((note: any) => Number(note.referenceNodeId ?? note.reference_node_id) === nodeId);

  const toggleNodeNotes = (nodeId: number) => {
    setExpandedNodeNotes((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId],
    );
  };

  const toggleNodeCollapse = (nodeId: number) => {
    setCollapsedNodes((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId],
    );
  };

  const getNoteAuthor = (note: any) => {
    const nestedName = note?.user?.name;
    if (typeof nestedName === "string" && nestedName.trim()) {
      return nestedName;
    }

    const authorId = Number(note.userId ?? note.user_id ?? 0);
    if (authorId && usersById[authorId]) {
      return usersById[authorId];
    }

    return authorId ? `Usuario ${authorId}` : "Autor nao informado";
  };

  const copyText = async (value: string) => {
    if (!value?.trim()) return;

    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Texto copiado" });
    } catch {
      toast({ title: "Nao foi possivel copiar", variant: "destructive" });
    }
  };

  const createNoteForNode = async (nodeId: number, referenceId?: number) => {
    const content = String(noteDraftByNode[nodeId] || "").trim();
    if (!content) return;

    setSavingNoteByNode((prev) => ({ ...prev, [nodeId]: true }));
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content,
          visibility: "CHANNEL",
          channel_id: channelId,
          reference_node_id: nodeId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel criar a note");
      }

      const payload = await response.json();
      const created = payload?.data ?? payload;

      setCreatedNotes((prev) => [...prev, created]);
      setNoteDraftByNode((prev) => ({ ...prev, [nodeId]: "" }));
      setEditorNodeId(null);
      if (referenceId) {
        setExpandedRefs((prev) => (prev.includes(referenceId) ? prev : [...prev, referenceId]));
      }
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      toast({ title: "Note criada" });
    } catch (error: any) {
      const message = error?.message || "Erro ao criar note";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSavingNoteByNode((prev) => ({ ...prev, [nodeId]: false }));
    }
  };

  const canDeleteNote = (note: any) => {
    const noteUserId = Number(note.userId ?? note.user_id ?? 0);
    return isOwner || noteUserId === Number(user?.id);
  };

  const deleteNote = async (noteId: number) => {
    if (!noteId) return;

    setDeletingNoteById((prev) => ({ ...prev, [noteId]: true }));
    try {
      await deleteNoteMutation.mutateAsync({ id: noteId });

      setDeletedNoteIds((prev) => (prev.includes(noteId) ? prev : [...prev, noteId]));
      setCreatedNotes((prev) => prev.filter((note: any) => Number(note.id) !== noteId));
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      toast({ title: "Note excluida" });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || "Erro ao excluir note";
      toast({ title: message, variant: "destructive" });
    } finally {
      setDeletingNoteById((prev) => ({ ...prev, [noteId]: false }));
    }
  };

  const saveNodeEdit = async (node: any, referenceId: number) => {
    if (!editingNodeId) return;

    setSavingNodeEdit(true);
    try {
      const token = localStorage.getItem("auth_token");
      const payload = {
        type: String(node.type || "VERSE"),
        label: String(nodeEditDraft.label || node.label || "").trim(),
        content: String(nodeEditDraft.content ?? "").trim(),
        reference_id: Number(node.reference_id ?? node.referenceId ?? referenceId),
        parent_node_id: node.parent_node_id ?? node.parentNodeId ?? null,
        position: Number(node.position ?? 0),
      };

      let response = await fetch(`/api/reference-nodes/${editingNodeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        response = await fetch(`/api/references/${referenceId}/nodes/${editingNodeId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel editar o node");
      }

      const updatedPayload = await response.json().catch(() => ({}));
      const updated = updatedPayload?.data ?? updatedPayload;

      setEditingNodeId(null);
      setExpandedRefs((prev) => (prev.includes(referenceId) ? prev : [...prev, referenceId]));
      await loadReferenceNodes(referenceId, true);
      toast({ title: "Node atualizado" });
    } catch (e: any) {
      toast({ title: e?.message || "Erro ao editar node", variant: "destructive" });
    } finally {
      setSavingNodeEdit(false);
    }
  };

  const renderNodeTree = (nodes: any[], referenceId: number, parentId: number | null = null) => {
    const children = nodes
      .filter((node: any) => {
        const nodeParent = node.parentNodeId ?? node.parent_node_id;
        return parentId === null ? nodeParent == null : Number(nodeParent) === parentId;
      })
      .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0));

    return children.map((node: any) => {
      const nodeId = Number(node.id);
      const notesForNode = getNotesForNode(nodeId);
      const nested = renderNodeTree(nodes, referenceId, nodeId);
      const isNotesOpen = expandedNodeNotes.includes(nodeId);
      const isVerse = String(node.type || "").toUpperCase() === "VERSE";
      const isChapter = String(node.type || "").toUpperCase() === "CHAPTER";
      const isRootNode = parentId === null;
      const hasChildren = nested.length > 0;
      const isCollapsed = collapsedNodes.includes(nodeId);
      const isNodeEditorOpen = editorNodeId === nodeId;
      const isEditingNode = editingNodeId === nodeId;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const isNodeRecentlyAnnotated = notesForNode.some((note: any) => {
        const ts = note.createdAt ?? note.created_at;
        return ts ? Date.now() - new Date(ts).getTime() < SEVEN_DAYS_MS : false;
      });

      return (
        <div key={node.id} className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className={`rounded-xl border px-4 py-3 transition-colors ${isNotesOpen || isNodeEditorOpen ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background/70"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {node.content ? (
                  <p className={`whitespace-pre-wrap text-foreground ${isVerse ? "text-sm leading-7 font-serif" : "text-base leading-7"}`}>
                    {node.content}
                  </p>
                ) : (
                  <p className="text-sm text-foreground">{`Node ${node.id}`}</p>
                )}
                <p className={`mt-1 text-muted-foreground ${isRootNode ? "text-sm font-medium" : "text-xs"}`}>
                  {node.label || node.type}
                </p>
                {!isVerse && isChapter && (
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{node.type}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
              {!isVerse && hasChildren && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeCollapse(nodeId);
                  }}
                  aria-label={isCollapsed ? "Expandir" : "Colapsar"}
                >
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
              {node.content && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(String(node.content));
                  }}
                  aria-label="Copiar texto da referencia"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              {canChannelActions && (
                <button
                  type="button"
                  className={`inline-flex items-center justify-center rounded-md border p-1.5 transition-colors shrink-0 ${isEditingNode ? "border-primary/50 text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditingNode) {
                      setEditingNodeId(null);
                      return;
                    }
                    setEditingNodeId(nodeId);
                    setNodeEditDraft({
                      label: String(node.label || ""),
                      content: String(node.content || ""),
                    });
                  }}
                  aria-label={isEditingNode ? "Fechar edicao do node" : "Editar node"}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                className={`inline-flex items-center justify-center rounded-md border p-1.5 transition-colors shrink-0 ${isNodeEditorOpen ? "border-primary/50 text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isNodeEditorOpen) {
                    setEditorNodeId(null);
                    return;
                  }
                  setEditorNodeId(nodeId);
                }}
                aria-label={isNodeEditorOpen ? "Fechar editor de note" : "Criar note no verso"}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              {notesForNode.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeNotes(nodeId);
                  }}
                  aria-label={isNotesOpen ? "Esconder notes" : "Mostrar notes"}
                >
                  {isNodeRecentlyAnnotated && (
                    <span className="relative inline-flex shrink-0">
                      <MessageCircle className="w-3.5 h-3.5 text-rose-500" />
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                    </span>
                  )}
                  <span className="text-[10px] font-medium leading-none">{notesForNode.length}</span>
                  {isNotesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
              </div>
            </div>
          </div>

          {isNodeEditorOpen && (
            <div className="pl-3 border-l border-border/60" onClick={(e) => e.stopPropagation()}>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                <textarea
                  className="w-full min-h-24 resize-y rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Escreva sua note..."
                  value={noteDraftByNode[nodeId] ?? ""}
                  onChange={(e) => setNoteDraftByNode((prev) => ({ ...prev, [nodeId]: e.target.value }))}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditorNodeId(null);
                    }}
                    aria-label="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                    onClick={(e) => {
                      e.stopPropagation();
                      createNoteForNode(nodeId, referenceId);
                    }}
                    disabled={savingNoteByNode[nodeId] || !String(noteDraftByNode[nodeId] || "").trim()}
                  >
                    {savingNoteByNode[nodeId] ? "Salvando..." : "Comentar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isEditingNode && canChannelActions && (
            <div className="pl-3 border-l border-border/60" onClick={(e) => e.stopPropagation()}>
              <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-3">
                <Input
                  value={nodeEditDraft.label}
                  onChange={(e) => setNodeEditDraft((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Label"
                />
                <textarea
                  className="w-full min-h-24 resize-y rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={nodeEditDraft.content}
                  onChange={(e) => setNodeEditDraft((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Conteudo"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    onClick={() => setEditingNodeId(null)}
                    aria-label="Cancelar edicao"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                    onClick={() => saveNodeEdit(node, referenceId)}
                    disabled={savingNodeEdit || !nodeEditDraft.label.trim()}
                  >
                    {savingNodeEdit ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {notesForNode.length > 0 && isNotesOpen && (
            <div className="pl-3 border-l border-border/60 space-y-2" onClick={(e) => e.stopPropagation()}>
              {notesForNode.map((note: any) => (
                <div key={note.id} className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur px-3.5 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                      <p className="text-xs text-muted-foreground">{getNoteAuthor(note)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                        onClick={() => copyText(String(note.content || ""))}
                        aria-label="Copiar note"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {canDeleteNote(note) && (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                          onClick={() => deleteNote(Number(note.id))}
                          aria-label="Excluir note"
                          disabled={deletingNoteById[Number(note.id)]}
                        >
                          {deletingNoteById[Number(note.id)] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-foreground/85 whitespace-pre-wrap mt-2.5">{note.content}</p>
                </div>
              ))}
            </div>
          )}

          {nested.length > 0 && !isCollapsed && (
            <div className="pl-3 border-l border-border/60 space-y-3" onClick={(e) => e.stopPropagation()}>
              {nested}
            </div>
          )}
        </div>
      );
    });
  };

  if (loadingChannel || loadingChannelReferences || loadingReferences) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (!channel) {
    return (
      <AppLayout>
        <div className="p-10 text-center text-muted-foreground">Channel not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10">
        <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-sm">
          <h1 className="text-4xl font-display font-bold mb-3">{channel.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <UserRound className="w-4 h-4" />
            <span>Criador: {creatorName}</span>
          </div>
          {channel.description && (
            <p className="text-muted-foreground font-serif">{channel.description}</p>
          )}
          {isEditingChannelInline && canChannelActions && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/70 p-3 space-y-3">
              <Input
                value={editChannelForm.name}
                onChange={(e) => setEditChannelForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome do channel"
              />
              <select
                className="w-full h-10 rounded-xl bg-background border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={editChannelForm.visibility}
                onChange={(e) => setEditChannelForm((f) => ({ ...f, visibility: e.target.value }))}
              >
                <option value="PRIVATE">PRIVATE</option>
                <option value="PUBLIC">PUBLIC</option>
              </select>
              <Input
                value={editChannelForm.description}
                onChange={(e) => setEditChannelForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descricao do channel"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  onClick={() => setIsEditingChannelInline(false)}
                  aria-label="Cancelar edicao do channel"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  onClick={handleEditChannel}
                  disabled={isEditingChannel || !editChannelForm.name.trim()}
                  aria-label="Salvar channel"
                >
                  {isEditingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          {canChannelActions && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl border border-border/60 bg-background p-2 text-foreground hover:bg-secondary/60 transition-colors"
                onClick={() => {
                  setEditChannelForm({
                    id: Number(channel?.id || 0),
                    name: String((channel as any)?.name || ""),
                    description: String((channel as any)?.description || ""),
                    visibility: String((channel as any)?.visibility || "PRIVATE"),
                  });
                  setIsEditingChannelInline((prev) => !prev);
                }}
                aria-label="Editar channel"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-primary p-2 text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={() => setShowCreateDialog(true)}
                aria-label="Nova referencia"
              >
                <Plus className="w-4 h-4" />
              </button>
              {canDeleteChannel && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  onClick={handleDeleteChannel}
                  aria-label="Excluir channel"
                  disabled={isDeletingChannel}
                >
                  {isDeletingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        {filteredReferences.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground font-serif text-lg">
            Nenhuma referencia vinculada a este canal.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReferences.map((ref: any) => (
              (() => {
                const isOpen = expandedRefs.includes(ref.id);
                const nodes = referenceNodesById[ref.id] ?? [];
                const nodeIds = new Set(nodes.map((node: any) => Number(node.id)).filter((value: number) => !Number.isNaN(value)));
                const notesForReference = mergedNotes.filter((note: any) => nodeIds.has(Number(note.referenceNodeId ?? note.reference_node_id)));
                const hasNotes = notesForReference.length > 0;
                const hasExpandable = hasNotes || nodes.length > 0;
                const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                const isRecentlyAnnotated = notesForReference.some((note: any) => {
                  const ts = note.createdAt ?? note.created_at;
                  if (!ts) return false;
                  return Date.now() - new Date(ts).getTime() < SEVEN_DAYS_MS;
                });
                const referenceCreatorId = Number(ref.createdBy ?? ref.created_by ?? creatorId);
                const referenceCreatorName = referenceCreatorId === Number(user?.id) ? "Voce" : `Usuario ${referenceCreatorId}`;
                const canEditReference = canChannelActions;
                const isReferenceEditing = editingReferenceId === Number(ref.id);

                return (
                  <Card
                    key={ref.id}
                    className={`rounded-2xl border-border/50 shadow-sm bg-card overflow-hidden ${hasExpandable ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => { if (hasExpandable) toggleReference(ref.id); }}
                  >
                    <div className="h-1.5 w-full bg-gradient-to-r from-primary/40 to-accent/40" />
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-secondary text-secondary-foreground shrink-0">
                            {typeIcons[ref.type] || <BookOpen className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className={`font-display text-xl leading-tight transition-colors line-clamp-3${isOpen ? " text-primary" : ""}`}>
                              {ref.description || ref.title}
                            </CardTitle>
                            <p className={`mt-1 text-sm font-serif transition-colors${isOpen ? " text-foreground font-medium" : " text-muted-foreground"}`}>{ref.title}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="w-3.5 h-3.5" />
                                {referenceCreatorName}
                              </span>
                              <span>{ref.author || "Autor nao informado"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isRecentlyAnnotated && (
                            <span className="relative inline-flex shrink-0" title="Notas adicionadas recentemente">
                              <MessageCircle className="w-4 h-4 text-rose-500" />
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500" />
                            </span>
                          )}
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-background px-2 py-1 rounded-md border border-border/50">
                            {ref.type}
                          </span>
                          {canEditReference && (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full border border-border/60 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditForm({
                                  id: Number(ref.id),
                                  title: String(ref.title || ""),
                                  type: String(ref.type || "BIBLE"),
                                  author: String(ref.author || ""),
                                  description: String(ref.description || ""),
                                });
                                setEditingReferenceId((prev) => (prev === Number(ref.id) ? null : Number(ref.id)));
                                if (!expandedRefs.includes(ref.id)) {
                                  toggleReference(ref.id);
                                }
                              }}
                              aria-label="Editar referencia"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {hasExpandable && (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full border border-border/60 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReference(ref.id);
                              }}
                              aria-label={isOpen ? "Fechar referencia" : "Abrir referencia"}
                            >
                              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {isOpen && (
                      <CardContent className="pt-0 pb-6" onClick={(e) => e.stopPropagation()}>
                        <div className="border-t border-border/50 pt-6 space-y-4">
                          {isReferenceEditing && canEditReference && (
                            <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-3">
                              <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Titulo"
                              />
                              <select
                                className="w-full h-10 rounded-xl bg-background border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={editForm.type}
                                onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                              >
                                <option value="BIBLE">Bible</option>
                                <option value="BOOK">Book</option>
                                <option value="POEM">Poem</option>
                                <option value="MUSIC">Music</option>
                                <option value="SERMON">Sermon</option>
                              </select>
                              <Input
                                value={editForm.author}
                                onChange={(e) => setEditForm((f) => ({ ...f, author: e.target.value }))}
                                placeholder="Autor"
                              />
                              <Input
                                value={editForm.description}
                                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="Descricao"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                  onClick={() => setEditingReferenceId(null)}
                                  aria-label="Cancelar edicao da referencia"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                  onClick={handleEditReference}
                                  disabled={isEditingReference || !editForm.title.trim()}
                                  aria-label="Salvar referencia"
                                >
                                  {isEditingReference ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          )}

                          {loadingNodesById[ref.id] ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Carregando estrutura...
                            </div>
                          ) : nodes.length === 0 ? (
                            <div className="space-y-2">
                              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                                <p className="text-sm font-medium text-foreground">{ref.description || ref.title}</p>
                              </div>
                              {notesForReference.length > 0 && (
                                <div className="pl-3 border-l border-border/60 space-y-2">
                                  {notesForReference.map((note: any) => (
                                    <div key={note.id} className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur px-3.5 py-3 shadow-sm">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 inline-flex items-center gap-2">
                                          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                                          <p className="text-xs text-muted-foreground">{getNoteAuthor(note)}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                            onClick={() => copyText(String(note.content || ""))}
                                            aria-label="Copiar note"
                                          >
                                            <Copy className="w-3.5 h-3.5" />
                                          </button>
                                          {canDeleteNote(note) && (
                                            <button
                                              type="button"
                                              className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                              onClick={() => deleteNote(Number(note.id))}
                                              aria-label="Excluir note"
                                              disabled={deletingNoteById[Number(note.id)]}
                                            >
                                              {deletingNoteById[Number(note.id)] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-sm leading-6 text-foreground/85 whitespace-pre-wrap mt-2.5">{note.content}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {renderNodeTree(nodes, Number(ref.id))}
                            </div>
                          )}

                          {!loadingNotes && notesForReference.length === 0 && (
                            <p className="text-sm text-muted-foreground font-serif inline-flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Nenhuma note adicionada para esta referencia.
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })()
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova referencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ref-title">Titulo *</Label>
              <Input id="ref-title" value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Filipenses" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-type">Tipo *</Label>
              <select
                id="ref-type"
                className="w-full h-10 rounded-xl bg-background border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={createForm.type}
                onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="BIBLE">Bible</option>
                <option value="BOOK">Book</option>
                <option value="POEM">Poem</option>
                <option value="MUSIC">Music</option>
                <option value="SERMON">Sermon</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-author">Autor</Label>
              <Input id="ref-author" value={createForm.author} onChange={(e) => setCreateForm((f) => ({ ...f, author: e.target.value }))} placeholder="Ex: Paulo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-desc">Descricao</Label>
              <Input id="ref-desc" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="Breve descricao..." />
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-secondary/60 transition-colors" onClick={() => setShowCreateDialog(false)}>Cancelar</button>
            <button type="button" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-50" onClick={handleCreateReference} disabled={isCreating || !createForm.title.trim()}>
              {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Criar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
