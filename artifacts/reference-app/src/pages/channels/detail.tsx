import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocation, useParams } from "wouter";
import { useListChannels, useListChannelReferences, useListNotes, useListReferences, useDeleteNote, getListChannelsQueryKey, getListNotesQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Book, Music, PenTool, Library, MessageSquare, BookOpen, Search, ChevronDown, ChevronRight, FileText, Copy, MessageCircle, Plus, X, Trash2, Edit2, Check, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { UserAvatar } from "@/components/ui/user-avatar";

type UserSummary = { name: string; avatarUrl?: string };

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
  const [usersById, setUsersById] = useState<Record<number, UserSummary>>({});
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
  const [activeTab, setActiveTab] = useState("references");
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [updatingMemberId, setUpdatingMemberId] = useState<number | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [pendingJoinRequestByChannelId, setPendingJoinRequestByChannelId] = useState<Record<number, number>>({});
  const [isRequestingJoin, setIsRequestingJoin] = useState(false);
  const [handledRequestLinkFlow, setHandledRequestLinkFlow] = useState(false);
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
  const getUserDisplayName = (userId: number, preferredName?: string | null) => {
    const normalizedPreferredName = typeof preferredName === "string" ? preferredName.trim() : "";
    if (normalizedPreferredName) {
      return normalizedPreferredName;
    }

    const mappedName = typeof usersById[userId]?.name === "string" ? usersById[userId].name.trim() : "";
    if (mappedName) {
      return mappedName;
    }

    if (userId === Number(user?.id) && typeof user?.name === "string" && user.name.trim()) {
      return user.name.trim();
    }

    return "Perfil";
  };
  const creatorName = getUserDisplayName(
    creatorId,
    (channel as any)?.creator?.name ?? (channel as any)?.user?.name ?? null,
  );
  const getUserAvatarUrl = (userId: number, preferredAvatar?: string | null) => {
    const normalizedPreferredAvatar = String(preferredAvatar || "").trim();
    if (normalizedPreferredAvatar) return normalizedPreferredAvatar;

    const mappedAvatar = String(usersById[userId]?.avatarUrl || "").trim();
    if (mappedAvatar) return mappedAvatar;

    if (userId === Number(user?.id)) {
      return String((user as any)?.avatar_url || (user as any)?.avatarUrl || "").trim();
    }

    return "";
  };
  const creatorAvatarUrl = getUserAvatarUrl(creatorId, (channel as any)?.creator?.avatar_url ?? (channel as any)?.creator?.avatarUrl ?? (channel as any)?.user?.avatar_url ?? (channel as any)?.user?.avatarUrl ?? null);

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

        const mapped = rows.reduce((acc: Record<number, UserSummary>, row: any) => {
          const id = Number(row.id);
          if (!Number.isNaN(id) && typeof row.name === "string") {
            acc[id] = {
              name: row.name,
              avatarUrl: String(row?.avatar_url || row?.avatarUrl || "").trim() || undefined,
            };
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
    if (!channelId || !user?.id) {
      if (isMounted) setLoadingMembers(false);
      return;
    }

    const loadMembership = async () => {
      setLoadingMembers(true);
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
          setChannelMembers(rows);
        }
      } catch {
        if (isMounted) {
          setMyChannelRole(null);
          setChannelMembers([]);
        }
      } finally {
        if (isMounted) setLoadingMembers(false);
      }
    };

    loadMembership();
    return () => {
      isMounted = false;
    };
  }, [channelId, user?.id]);

  useEffect(() => {
    let isMounted = true;
    if (!user?.id) return;

    const loadPendingRequests = async () => {
      try {
        const response = await fetch("/api/channel-join-requests?status=PENDING");
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows
          .filter((row: any) => Number(row.requester_id ?? row.requesterId ?? 0) === Number(user.id))
          .filter((row: any) => Number(row.id ?? 0) > 0)
          .reduce((acc: Record<number, number>, row: any) => {
            const pendingChannelId = Number(row.channel_id ?? row.channelId ?? 0);
            const requestId = Number(row.id ?? 0);
            if (!Number.isNaN(pendingChannelId) && pendingChannelId > 0 && !Number.isNaN(requestId) && requestId > 0) {
              acc[pendingChannelId] = requestId;
            }
            return acc;
          }, {});

        if (isMounted) {
          setPendingJoinRequestByChannelId(mine);
        }
      } catch {
        if (isMounted) {
          setPendingJoinRequestByChannelId({});
        }
      }
    };

    loadPendingRequests();

    const refreshRequests = () => {
      loadPendingRequests();
    };

    window.addEventListener("channel-requests-changed", refreshRequests);

    return () => {
      isMounted = false;
      window.removeEventListener("channel-requests-changed", refreshRequests);
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
  const canManageMemberRoles = isOwner || myChannelRole === "OWNER";
  const canRemoveMembers = isOwner || myChannelRole === "OWNER" || myChannelRole === "MODERATOR";
  const channelVisibility = typeof (channel as any)?.visibility === "string"
    ? String((channel as any).visibility).toUpperCase()
    : null;
  const isChannelMember = channelMembers.some((member: any) => {
    const memberUserId = Number(member.user_id ?? member.userId ?? member.user?.id ?? 0);
    return memberUserId === Number(user?.id);
  });
  const pendingJoinRequestId = pendingJoinRequestByChannelId[channelId];
  const hasPendingJoinRequest = Number.isFinite(pendingJoinRequestId) && pendingJoinRequestId > 0;
  const canRequestJoin = channelVisibility === "PUBLIC" && !isOwner && !isChannelMember && !hasPendingJoinRequest;
  const shouldAutoRequestFromLink = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("request") === "1"
    : false;
  const sortedMembers = useMemo(() => {
    const roleOrder: Record<string, number> = { OWNER: 0, MODERATOR: 1, MEMBER: 2 };

    const uniqueMembers = new Map<number, any>();

    channelMembers.forEach((member: any) => {
      const memberUserId = Number(member.user_id ?? member.userId ?? member.user?.id ?? 0);
      if (!memberUserId) return;

      const existing = uniqueMembers.get(memberUserId);
      const currentRole = String(member.role || "MEMBER").toUpperCase();
      const existingRole = String(existing?.role || "MEMBER").toUpperCase();
      const shouldReplace = !existing || (roleOrder[currentRole] ?? 99) < (roleOrder[existingRole] ?? 99);

      if (shouldReplace) {
        uniqueMembers.set(memberUserId, member);
      }
    });

    return Array.from(uniqueMembers.values()).sort((left: any, right: any) => {
      const leftRole = String(left.role || "MEMBER").toUpperCase();
      const rightRole = String(right.role || "MEMBER").toUpperCase();
      const roleDiff = (roleOrder[leftRole] ?? 99) - (roleOrder[rightRole] ?? 99);
      if (roleDiff !== 0) return roleDiff;

      const leftId = Number(left.user_id ?? left.userId ?? left.user?.id ?? 0);
      const rightId = Number(right.user_id ?? right.userId ?? right.user?.id ?? 0);
      const leftName = getUserDisplayName(leftId, left.user?.name).toLowerCase();
      const rightName = getUserDisplayName(rightId, right.user?.name).toLowerCase();

      return leftName.localeCompare(rightName);
    });
  }, [channelMembers, usersById]);

  const handleMemberRoleChange = async (membershipId: number, role: string) => {
    if (!membershipId || !canManageMemberRoles) return;

    setUpdatingMemberId(membershipId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/channel-members/${membershipId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Não foi possível atualizar permissão");
      }

      setChannelMembers((prev) =>
        prev.map((member: any) =>
          Number(member.id) === membershipId ? { ...member, role } : member,
        ),
      );
      toast({ title: "Permissao atualizada" });
    } catch (error: any) {
      toast({ title: error?.message || "Erro ao atualizar permissao", variant: "destructive" });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (membershipId: number, memberName: string) => {
    if (!membershipId || !canRemoveMembers) return;

    const confirmed = window.confirm(`Remover ${memberName} deste channel?`);
    if (!confirmed) return;

    setRemovingMemberId(membershipId);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/channel-members/${membershipId}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Não foi possível remover membro");
      }

      setChannelMembers((prev) => prev.filter((member: any) => Number(member.id) !== membershipId));
      toast({ title: "Membro removido" });
    } catch (error: any) {
      toast({ title: error?.message || "Erro ao remover membro", variant: "destructive" });
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRequestJoin = async () => {
    if (!channelId || isRequestingJoin) return;

    setIsRequestingJoin(true);
    try {
      if (hasPendingJoinRequest) {
        const response = await fetch(`/api/channel-join-requests/${pendingJoinRequestId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody?.message || "Não foi possível cancelar solicitação");
        }

        setPendingJoinRequestByChannelId((prev) => {
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
        window.dispatchEvent(new Event("channel-requests-changed"));
        toast({ title: "Solicitação cancelada" });
      } else {
        const response = await fetch(`/api/channels/${channelId}/join`, {
          method: "POST",
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody?.message || "Não foi possível solicitar entrada");
        }

        const payload = await response.json().catch(() => ({}));
        const requestId = Number(payload?.data?.id ?? payload?.id ?? 0);
        if (requestId > 0) {
          setPendingJoinRequestByChannelId((prev) => ({ ...prev, [channelId]: requestId }));
        }
        window.dispatchEvent(new Event("channel-requests-changed"));
        toast({ title: "Solicitação enviada" });
        setLocation("/requests?tab=outgoing");
      }
    } catch (error: any) {
      toast({ title: error?.message || "Erro ao atualizar solicitação", variant: "destructive" });
    } finally {
      setIsRequestingJoin(false);
    }
  };

  const handleCopyRequestLink = async () => {
    if (!channelId || typeof window === "undefined") return;

    const requestLink = `${window.location.origin}/channels/${channelId}?request=1`;
    try {
      await navigator.clipboard.writeText(requestLink);
      toast({ title: "Convite copiado", description: "Compartilhe este convite para solicitarem entrada." });
    } catch {
      toast({ title: "Não foi possível copiar o link", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!shouldAutoRequestFromLink || handledRequestLinkFlow) return;
    if (loadingChannel || loadingMembers || isRequestingJoin) return;

    if (canRequestJoin) {
      setHandledRequestLinkFlow(true);
      handleRequestJoin();
      return;
    }

    if (hasPendingJoinRequest) {
      setHandledRequestLinkFlow(true);
      toast({ title: "Solicitação já enviada" });
      return;
    }

    if (myChannelRole || isOwner) {
      setHandledRequestLinkFlow(true);
      return;
    }

    setHandledRequestLinkFlow(true);
    handleRequestJoin();
  }, [
    shouldAutoRequestFromLink,
    handledRequestLinkFlow,
    loadingChannel,
    loadingMembers,
    isRequestingJoin,
    canRequestJoin,
    hasPendingJoinRequest,
    myChannelRole,
    isOwner,
  ]);

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
      if (!refRes.ok) throw new Error("Erro ao criar referência");
      const newRef = await refRes.json();
      const refId = Number(newRef.id ?? newRef.data?.id);

      await fetch(`/api/channels/${channelId}/references`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reference_id: refId }),
      });

      toast({ title: "Referência criada", description: createForm.title });
      setShowCreateDialog(false);
      setCreateForm({ title: "", type: "BIBLE", author: "", description: "" });
      setLocation(`/references/${refId}`);
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
        throw new Error(errorBody?.message || "Não foi possível editar a referência");
      }

      toast({ title: "Referência atualizada" });
      setEditingReferenceId(null);
      window.location.reload();
    } catch (e: any) {
      toast({ title: e?.message || "Erro ao editar referência", variant: "destructive" });
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
        throw new Error(errorBody?.message || "Não foi possível editar o channel");
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

    const confirmed = window.confirm("Excluir este channel? Esta ação não pode ser desfeita.");
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
        throw new Error(errorBody?.message || "Não foi possível excluir o channel");
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
    if (authorId) {
      return getUserDisplayName(authorId, note.user?.name ?? null);
    }

    return "Autor não informado";
  };

  const getNoteAuthorId = (note: any) => Number(note?.user?.id ?? note?.userId ?? note?.user_id ?? 0);

  const copyText = async (value: string) => {
    if (!value?.trim()) return;

    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Texto copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
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
        throw new Error(errorBody?.message || "Não foi possível criar a note");
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
        throw new Error(errorBody?.message || "Não foi possível editar o node");
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
                  aria-label="Copiar texto da referência"
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
                aria-label={isNodeEditorOpen ? "Fechar editor de nota" : "Criar nota no verso"}
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
                  placeholder="Conteúdo"
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
                      <UserAvatar
                        name={getNoteAuthor(note)}
                        src={getUserAvatarUrl(getNoteAuthorId(note), note.user?.avatar_url ?? note.user?.avatarUrl ?? null)}
                        size="sm"
                        className="h-7 w-7 text-[10px]"
                      />
                      {getNoteAuthorId(note) ? (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => setLocation(`/channels/user/${getNoteAuthorId(note)}`)}
                        >
                          {getNoteAuthor(note)}
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground">{getNoteAuthor(note)}</p>
                      )}
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
            <UserAvatar name={creatorName} src={creatorAvatarUrl} size="sm" />
            <span>Criador:</span>
            {creatorId > 0 ? (
              <button
                type="button"
                className="font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => setLocation(`/channels/user/${creatorId}`)}
              >
                {creatorName}
              </button>
            ) : (
              <span>{creatorName}</span>
            )}
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
                placeholder="Descrição do channel"
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
              {channelVisibility === "PUBLIC" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                  onClick={handleCopyRequestLink}
                >
                  <Copy className="w-4 h-4" />
                  Compartilhar convite
                </button>
              )}
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
          {!loadingMembers && !canChannelActions && channelVisibility === "PUBLIC" && !isChannelMember && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRequestJoin}
                disabled={isRequestingJoin || (!canRequestJoin && !hasPendingJoinRequest)}
              >
                {isRequestingJoin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {hasPendingJoinRequest ? "Solicitação enviada" : "Solicitar entrada"}
              </button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="rounded-2xl bg-card border border-border/50 h-auto p-1">
            <TabsTrigger value="references" className="rounded-xl px-4 py-2.5 gap-2">
              <BookOpen className="w-4 h-4" />
              Referências
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground border border-border/50">
                {references.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-xl px-4 py-2.5 gap-2">
              <Users className="w-4 h-4" />
              Membros
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground border border-border/50">
                {sortedMembers.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="references" className="space-y-4 mt-0">
            {canChannelActions && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="w-4 h-4" />
                  Criar referência
                </button>
              </div>
            )}
            {filteredReferences.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground font-serif text-lg">
                Nenhuma referência vinculada a este canal.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReferences.map((ref: any) => (
                  (() => {
                const referenceCreatorId = Number(ref.createdBy ?? ref.created_by ?? creatorId);
                const referenceCreatorName = getUserDisplayName(referenceCreatorId, ref.user?.name ?? null);
                const referenceCreatorAvatarUrl = getUserAvatarUrl(referenceCreatorId, ref.user?.avatar_url ?? ref.user?.avatarUrl ?? null);
                const canEditReference = canChannelActions;

                return (
                  <Card
                    key={ref.id}
                      className="rounded-2xl border-border/50 shadow-sm bg-card overflow-hidden cursor-pointer"
                      onClick={() => setLocation(`/references/${Number(ref.id)}?view=reading`)}
                  >
                    <div className="h-1.5 w-full bg-gradient-to-r from-primary/40 to-accent/40" />
                      <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-secondary text-secondary-foreground shrink-0">
                            {typeIcons[ref.type] || <BookOpen className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="font-display text-xl leading-tight transition-colors line-clamp-3">
                              {ref.description || ref.title}
                            </CardTitle>
                            <p className="mt-1 text-sm font-serif text-muted-foreground transition-colors">{ref.title}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <UserAvatar name={referenceCreatorName} src={referenceCreatorAvatarUrl} size="sm" className="h-5 w-5 text-[9px]" />
                                {referenceCreatorId > 0 ? (
                                  <button
                                    type="button"
                                    className="hover:text-primary transition-colors"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setLocation(`/channels/user/${referenceCreatorId}`);
                                    }}
                                  >
                                    {referenceCreatorName}
                                  </button>
                                ) : (
                                  <span>{referenceCreatorName}</span>
                                )}
                              </span>
                              <span>{ref.author || "Autor não informado"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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
                              }}
                              aria-label="Editar referência"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardHeader>
                    {editingReferenceId === Number(ref.id) && canEditReference && (
                      <CardContent className="pt-0 pb-6" onClick={(e) => e.stopPropagation()}>
                        <div className="border-t border-border/50 pt-6">
                          <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-3">
                            <Input
                              value={editForm.title}
                              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder="Título"
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
                              placeholder="Descrição"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                onClick={() => setEditingReferenceId(null)}
                                aria-label="Cancelar edição da referência"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                                onClick={handleEditReference}
                                disabled={isEditingReference || !editForm.title.trim()}
                                aria-label="Salvar referência"
                              >
                                {isEditingReference ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
                  })()
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-0">
            {canManageMemberRoles && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => setLocation("/requests")}
                >
                  <Users className="w-4 h-4" />
                  Ver solicitacoes
                </button>
              </div>
            )}
            {loadingMembers ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : sortedMembers.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground font-serif text-lg">
                Nenhum membro encontrado neste channel.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedMembers.map((member: any) => {
                  const memberUserId = Number(member.user_id ?? member.userId ?? member.user?.id ?? 0);
                  const memberName = getUserDisplayName(memberUserId, member.user?.name ?? null);
                  const memberAvatarUrl = getUserAvatarUrl(memberUserId, member.user?.avatar_url ?? member.user?.avatarUrl ?? null);
                  const memberRole = String(member.role || "MEMBER").toUpperCase();
                  const isCurrentUser = memberUserId === Number(user?.id);
                  const isChannelOwnerMember = memberUserId === creatorId;
                  const memberRecordId = Number(member.id ?? 0);
                  const canRemoveThisMember = canRemoveMembers && !isChannelOwnerMember && !isCurrentUser && memberRecordId > 0;

                  return (
                    <Card key={member.id ?? `${memberUserId}-${memberRole}`} className="rounded-2xl border-border/50 shadow-sm">
                      <CardContent className="p-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            className="rounded-full shrink-0"
                            onClick={() => setLocation(`/channels/user/${memberUserId}`)}
                            disabled={!memberUserId}
                          >
                            <UserAvatar
                              name={memberName}
                              src={memberAvatarUrl}
                              size="lg"
                              className="h-11 w-11 border-primary/20"
                            />
                          </button>
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="text-left font-medium text-foreground hover:text-primary transition-colors truncate"
                              onClick={() => setLocation(`/channels/user/${memberUserId}`)}
                              disabled={!memberUserId}
                            >
                              {memberName}{isCurrentUser ? " (você)" : ""}
                            </button>
                          </div>
                        </div>
                        {canManageMemberRoles && !isChannelOwnerMember ? (
                          <div className="flex items-center gap-2 shrink-0">
                            {(updatingMemberId === memberRecordId || removingMemberId === memberRecordId) && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            <select
                              className="h-9 rounded-lg bg-background border border-border px-3 text-xs font-bold uppercase tracking-wider text-foreground"
                              value={memberRole}
                              onChange={(e) => handleMemberRoleChange(memberRecordId, e.target.value)}
                              disabled={!memberRecordId || updatingMemberId === memberRecordId || removingMemberId === memberRecordId}
                            >
                              <option value="MODERATOR">MODERATOR</option>
                              <option value="MEMBER">MEMBER</option>
                            </select>
                            {canRemoveThisMember && (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                                onClick={() => handleRemoveMember(memberRecordId, memberName)}
                                disabled={removingMemberId === memberRecordId || updatingMemberId === memberRecordId}
                                aria-label="Remover membro"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : canRemoveThisMember ? (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50 shrink-0"
                            onClick={() => handleRemoveMember(memberRecordId, memberName)}
                            disabled={removingMemberId === memberRecordId}
                            aria-label="Remover membro"
                          >
                            {removingMemberId === memberRecordId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        ) : (
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-background px-2.5 py-1 rounded-md border border-border/50 shrink-0">
                            {memberRole}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova referência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ref-title">Título *</Label>
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
              <Label htmlFor="ref-desc">Descrição</Label>
              <Input id="ref-desc" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="Breve descrição..." />
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
