import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { getListNotesQueryKey, useDeleteNote, useGetReference, useListChannels, useListNotes, useListReferences, useUpdateNote, type ReferenceNode } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, ChevronDown, AlignLeft, Plus, Copy, Trash2, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";

const getNodeParentId = (node: ReferenceNode | any) => node.parentNodeId ?? node.parent_node_id ?? null;
const getNodePosition = (node: ReferenceNode | any) => Number(node.position ?? 0);
const getReferenceSortOrder = (reference: any) => {
  const title = String(reference?.title || "");
  const weekMatch = title.match(/Semana\s*(\d+)/i);
  if (weekMatch) return Number(weekMatch[1]);
  return 999;
};
const getReferenceVisibleRootNodes = (referenceTitle: string | null | undefined, nodes: ReferenceNode[]) => {
  const rootNodes = nodes
    .filter((node) => getNodeParentId(node) == null)
    .sort((a, b) => getNodePosition(a) - getNodePosition(b));

  if (rootNodes.length !== 1) return rootNodes;

  const singleRoot = rootNodes[0] as any;
  const normalizedReferenceTitle = String(referenceTitle || "").trim().toLowerCase();
  const normalizedRootLabel = String(singleRoot?.label || "").trim().toLowerCase();

  if (!normalizedReferenceTitle || normalizedReferenceTitle !== normalizedRootLabel) {
    return rootNodes;
  }

  return nodes
    .filter((node) => Number(getNodeParentId(node)) === Number(singleRoot.id))
    .sort((a, b) => getNodePosition(a) - getNodePosition(b));
};

const flattenNodesForReading = (nodes: ReferenceNode[], rootNodes: ReferenceNode[], level = 0): Array<{ node: ReferenceNode; level: number }> => {
  const output: Array<{ node: ReferenceNode; level: number }> = [];

  rootNodes.forEach((node) => {
    output.push({ node, level });
    const children = nodes
      .filter((candidate) => Number(getNodeParentId(candidate)) === Number(node.id))
      .sort((left, right) => getNodePosition(left) - getNodePosition(right));

    if (children.length > 0) {
      output.push(...flattenNodesForReading(nodes, children, level + 1));
    }
  });

  return output;
};

// Recursive component to render the hierarchy
const TreeNode = ({ 
  node, 
  nodes, 
  level = 0, 
  selectedNodeId, 
  onSelect,
  expandAll = false,
}: { 
  node: ReferenceNode, 
  nodes: ReferenceNode[], 
  level?: number,
  selectedNodeId: number | null,
  onSelect: (id: number) => void,
  expandAll?: boolean,
}) => {
  const [expanded, setExpanded] = useState(level < 1 || expandAll);
  const children = nodes
    .filter(n => Number(getNodeParentId(n)) === Number(node.id))
    .sort((a, b) => getNodePosition(a) - getNodePosition(b));
  const hasChildren = children.length > 0;
  const isSelected = selectedNodeId === node.id;

  return (
    <div className="w-full">
      <div 
        className={`
          flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-colors group
          ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50 text-foreground'}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
          if (hasChildren) {
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="w-5 h-5 flex items-center justify-center mr-1 text-muted-foreground hover:text-foreground">
          {hasChildren ? (expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4 h-4" />}
        </div>
        <span className="text-sm font-medium font-sans truncate">{node.label}</span>
      </div>
      
      {expanded && hasChildren && (
        <div className="mt-0.5">
          {children.map(child => (
            <TreeNode 
              key={child.id} 
              node={child} 
              nodes={nodes} 
              level={level + 1} 
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function ReferenceDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const refId = parseInt(id || "0", 10);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isReadingView = useMemo(() => new URLSearchParams(search).get("view") === "reading", [search]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [isActiveReferenceExpanded, setIsActiveReferenceExpanded] = useState(true);
  const [allNodes, setAllNodes] = useState<ReferenceNode[]>([]);
  const [loadingAllNodes, setLoadingAllNodes] = useState(true);
  const [channelReferenceLinks, setChannelReferenceLinks] = useState<any[]>([]);
  const [loadingChannelReferenceLinks, setLoadingChannelReferenceLinks] = useState(true);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [savingNoteInline, setSavingNoteInline] = useState(false);
  const [inlineNoteDraft, setInlineNoteDraft] = useState("");
  const [isCreatingNoteCard, setIsCreatingNoteCard] = useState(false);
  const [usersById, setUsersById] = useState<Record<number, string>>({});
  const [myChannelRole, setMyChannelRole] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingNodeSnapshot, setEditingNodeSnapshot] = useState<any | null>(null);
  const [nodeLabelDraft, setNodeLabelDraft] = useState("");
  const [nodeEditDraft, setNodeEditDraft] = useState("");
  const [savingNodeEdit, setSavingNodeEdit] = useState(false);
  const nodeAutosaveTimeoutRef = useRef<number | null>(null);
  const nodeLabelEditorRef = useRef<HTMLHeadingElement | null>(null);
  const nodeContentEditorRef = useRef<HTMLDivElement | null>(null);
  const [selectedNoteCardId, setSelectedNoteCardId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState("");
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
  const noteAutosaveTimeoutRef = useRef<number | null>(null);
  const noteEditorRef = useRef<HTMLDivElement | null>(null);
  const newNoteEditorRef = useRef<HTMLDivElement | null>(null);
  const readingSwipeLockRef = useRef(false);
  const readingSwipeUnlockTimerRef = useRef<number | null>(null);

  const { data: reference, isLoading: loadingRef } = useGetReference(refId);
  const { data: references, isLoading: loadingReferences } = useListReferences();
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const deleteNoteMutation = useDeleteNote();
  const updateNoteMutation = useUpdateNote();

  useEffect(() => {
    let isMounted = true;

    const loadAllNodes = async () => {
      setLoadingAllNodes(true);
      try {
        const response = await fetch("/api/reference-nodes");
        if (!response.ok) throw new Error("Failed to load nodes");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        if (isMounted) {
          setAllNodes(rows as ReferenceNode[]);
        }
      } catch {
        if (isMounted) {
          setAllNodes([]);
        }
      } finally {
        if (isMounted) {
          setLoadingAllNodes(false);
        }
      }
    };

    loadAllNodes();

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

        if (isMounted) {
          setChannelReferenceLinks(rows);
        }
      } catch {
        if (isMounted) {
          setChannelReferenceLinks([]);
        }
      } finally {
        if (isMounted) {
          setLoadingChannelReferenceLinks(false);
        }
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
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch("/api/users", { headers });
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mapped = rows.reduce((acc: Record<number, string>, row: any) => {
          const userId = Number(row.id);
          if (!Number.isNaN(userId) && typeof row.name === "string") {
            acc[userId] = row.name;
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
    setSelectedNodeId(null);
    setIsActiveReferenceExpanded(true);
    setInlineNoteDraft("");
    setIsCreatingNoteCard(false);
    setEditingNodeId(null);
  }, [refId]);

  useEffect(() => {
    setInlineNoteDraft("");
    setIsCreatingNoteCard(false);
    setEditingNodeId(null);
    setEditingNodeSnapshot(null);
    setSelectedNoteCardId(null);
    setEditingNoteId(null);
    setNodeLabelDraft("");
    setNoteEditDraft("");
  }, [selectedNodeId]);

  useEffect(() => {
    return () => {
      if (nodeAutosaveTimeoutRef.current) {
        window.clearTimeout(nodeAutosaveTimeoutRef.current);
      }
      if (noteAutosaveTimeoutRef.current) {
        window.clearTimeout(noteAutosaveTimeoutRef.current);
      }
      if (readingSwipeUnlockTimerRef.current) {
        window.clearTimeout(readingSwipeUnlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editingNodeId) return;

    if (nodeLabelEditorRef.current) {
      nodeLabelEditorRef.current.textContent = nodeLabelDraft;
    }

    if (nodeContentEditorRef.current) {
      nodeContentEditorRef.current.textContent = nodeEditDraft;
    }
  }, [editingNodeId, selectedNodeId]);

  useEffect(() => {
    if (!editingNoteId || !noteEditorRef.current) return;
    noteEditorRef.current.textContent = noteEditDraft;
  }, [editingNoteId]);

  useEffect(() => {
    if (!isCreatingNoteCard || !newNoteEditorRef.current) return;
    newNoteEditorRef.current.textContent = inlineNoteDraft;
  }, [isCreatingNoteCard]);

  const currentReference = useMemo(() => {
    if ((reference as any)?.title) return reference as any;
    return (references ?? []).find((row: any) => Number(row.id) === refId) ?? null;
  }, [reference, references, refId]);

  const nodesByReferenceId = useMemo(() => {
    const grouped = new Map<number, ReferenceNode[]>();

    allNodes.forEach((node: any) => {
      const referenceId = Number(node.referenceId ?? node.reference_id ?? 0);
      if (!referenceId) return;

      const current = grouped.get(referenceId) ?? [];
      current.push(node);
      grouped.set(referenceId, current);
    });

    return grouped;
  }, [allNodes]);

  const nodes = useMemo(
    () => (nodesByReferenceId.get(refId) ?? []).slice().sort((a, b) => getNodePosition(a) - getNodePosition(b)),
    [nodesByReferenceId, refId],
  );

  const currentChannelId = useMemo(() => {
    const match = (channelReferenceLinks ?? []).find(
      (row: any) => Number(row.reference_id ?? row.referenceId ?? 0) === refId,
    );

    return Number(match?.channel_id ?? match?.channelId ?? 0) || null;
  }, [channelReferenceLinks, refId]);

  useEffect(() => {
    let isMounted = true;
    if (!currentChannelId || !user?.id) {
      if (isMounted) setMyChannelRole(null);
      return;
    }

    const loadMembership = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch(`/api/channel-members?channel_id=${currentChannelId}`, { headers });
        if (!response.ok) {
          if (isMounted) setMyChannelRole(null);
          return;
        }

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows.find((row: any) => Number(row.user_id ?? row.userId ?? row.user?.id ?? 0) === Number(user.id));
        if (isMounted) {
          setMyChannelRole(String(mine?.role || "").toUpperCase() || null);
        }
      } catch {
        if (isMounted) {
          setMyChannelRole(null);
        }
      }
    };

    loadMembership();

    return () => {
      isMounted = false;
    };
  }, [currentChannelId, user?.id]);

  const channelReferenceIds = useMemo(() => {
    if (!currentChannelId) return new Set<number>();

    return new Set(
      (channelReferenceLinks ?? [])
        .filter((row: any) => Number(row.channel_id ?? row.channelId ?? 0) === currentChannelId)
        .map((row: any) => Number(row.reference_id ?? row.referenceId ?? 0))
        .filter((value: number) => !Number.isNaN(value) && value > 0),
    );
  }, [channelReferenceLinks, currentChannelId]);

  const currentChannelName = useMemo(() => {
    if (!currentChannelId) return null;

    const row = (channels ?? []).find((channel: any) => Number(channel.id) === currentChannelId);
    const name = String(row?.name || "").trim();
    return name || null;
  }, [channels, currentChannelId]);

  const isChannelOwner = useMemo(() => {
    if (!currentChannelId) return false;

    const channel = (channels ?? []).find((row: any) => Number(row.id) === currentChannelId) as any;
    const ownerId = Number(channel?.createdBy ?? channel?.created_by ?? 0);
    return ownerId > 0 && ownerId === Number(user?.id ?? 0);
  }, [channels, currentChannelId, user?.id]);

  const canEditNode = isChannelOwner || myChannelRole === "OWNER" || myChannelRole === "MODERATOR";

  const navigatorReferences = useMemo(() => {
    const referenceRows = references ?? [];

    if (!currentChannelId || channelReferenceIds.size === 0) {
      return currentReference ? [currentReference] : [];
    }

    const rows = referenceRows
      .filter((row: any) => channelReferenceIds.has(Number(row.id)))
      .sort((a: any, b: any) => {
        const orderDiff = getReferenceSortOrder(a) - getReferenceSortOrder(b);
        if (orderDiff !== 0) return orderDiff;
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });

    if (rows.length > 0) return rows;
    return currentReference ? [currentReference] : [];
  }, [references, currentChannelId, channelReferenceIds, currentReference]);

  const currentReferenceIndex = useMemo(
    () => navigatorReferences.findIndex((row: any) => Number(row.id) === refId),
    [navigatorReferences, refId],
  );

  const previousReference = useMemo(() => {
    if (currentReferenceIndex <= 0) return null;
    return navigatorReferences[currentReferenceIndex - 1] ?? null;
  }, [navigatorReferences, currentReferenceIndex]);

  const nextReference = useMemo(() => {
    if (currentReferenceIndex < 0 || currentReferenceIndex >= navigatorReferences.length - 1) return null;
    return navigatorReferences[currentReferenceIndex + 1] ?? null;
  }, [navigatorReferences, currentReferenceIndex]);

  const currentReferenceRootNodes = useMemo(
    () => getReferenceVisibleRootNodes((currentReference as any)?.title, nodes),
    [currentReference, nodes],
  );

  const readingNodes = useMemo(
    () => flattenNodesForReading(nodes, currentReferenceRootNodes),
    [nodes, currentReferenceRootNodes],
  );
  
  // Fetch notes for the selected node
  const { data: notes, isLoading: loadingNotes } = useListNotes(
    selectedNodeId ? { referenceNodeId: selectedNodeId } : undefined,
    {
      query: {
        enabled: !!selectedNodeId,
        queryKey: getListNotesQueryKey(selectedNodeId ? { referenceNodeId: selectedNodeId } : undefined),
      },
    }
  );

  const { data: allNotesForReading } = useListNotes(undefined, {
    query: {
      enabled: isReadingView,
      queryKey: getListNotesQueryKey(),
    },
  });

  const selectedNode = nodes?.find(n => n.id === selectedNodeId);
  const loadingNodes = loadingAllNodes || loadingReferences || loadingChannels || loadingChannelReferenceLinks;

  const readingNodeNoteStats = useMemo(() => {
    const stats = new Map<number, { count: number; recent: boolean }>();
    const currentNodeIds = new Set(nodes.map((node: any) => Number(node.id)));
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    (allNotesForReading ?? []).forEach((note: any) => {
      const nodeId = Number(note?.referenceNodeId ?? note?.reference_node_id ?? note?.referenceNode?.id ?? 0);
      if (!nodeId || !currentNodeIds.has(nodeId)) return;

      const createdAt = note?.createdAt ?? note?.created_at;
      const isRecent = createdAt ? Date.now() - new Date(createdAt).getTime() < SEVEN_DAYS_MS : false;
      const previous = stats.get(nodeId) ?? { count: 0, recent: false };
      stats.set(nodeId, {
        count: previous.count + 1,
        recent: previous.recent || isRecent,
      });
    });

    return stats;
  }, [allNotesForReading, nodes]);

  const canDeleteNote = (note: any) => {
    const noteUserId = Number(note?.userId ?? note?.user_id ?? note?.user?.id ?? 0);
    return isChannelOwner || myChannelRole === "OWNER" || myChannelRole === "MODERATOR" || noteUserId === Number(user?.id ?? 0);
  };

  const canEditNote = (note: any) => canDeleteNote(note);

  const getNoteAuthorName = (note: any) => {
    const nestedName = String(note?.user?.name || "").trim();
    if (nestedName) return nestedName;

    const authorId = Number(note?.userId ?? note?.user_id ?? note?.user?.id ?? 0);
    const mapped = String(usersById[authorId] || "").trim();
    if (mapped) return mapped;

    if (authorId === Number(user?.id ?? 0) && String(user?.name || "").trim()) {
      return String(user?.name || "").trim();
    }

    return authorId > 0 ? `User ${authorId}` : "Autor nao informado";
  };

  const getNoteAuthorId = (note: any) => Number(note?.user?.id ?? note?.userId ?? note?.user_id ?? 0);

  const startEditingNote = (note: any) => {
    if (!canEditNote(note)) return;

    const noteId = Number(note?.id ?? 0);
    if (!noteId) return;

    setSelectedNoteCardId(noteId);
    setEditingNoteId(noteId);
    setNoteEditDraft(String(note?.content || ""));
  };

  const saveNoteEdit = async (note: any, contentOverride?: string, closeEditor = true) => {
    const noteId = Number(note?.id ?? 0);
    if (!noteId || !canEditNote(note) || savingNoteEdit) return;

    const content = String(contentOverride ?? noteEditDraft ?? "");

    setSavingNoteEdit(true);
    try {
      await updateNoteMutation.mutateAsync({
        id: noteId,
        data: {
          content,
          visibility: note?.visibility,
          channelId: Number(note?.channelId ?? note?.channel_id ?? currentChannelId ?? 0) || undefined,
        },
      });

      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      if (selectedNodeId) {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey({ referenceNodeId: selectedNodeId }) });
      }

      if (closeEditor) {
        setEditingNoteId(null);
      }
    } finally {
      setSavingNoteEdit(false);
    }
  };

  const scheduleNoteAutosave = (note: any, draft: string) => {
    if (noteAutosaveTimeoutRef.current) {
      window.clearTimeout(noteAutosaveTimeoutRef.current);
    }

    noteAutosaveTimeoutRef.current = window.setTimeout(() => {
      saveNoteEdit(note, draft, false);
    }, 500);
  };

  const createInlineNote = async () => {
    const content = inlineNoteDraft.trim();
    if (!selectedNodeId || !content || savingNoteInline) return;

    setSavingNoteInline(true);
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
          visibility: currentChannelId ? "CHANNEL" : "PRIVATE",
          reference_node_id: selectedNodeId,
          ...(currentChannelId ? { channel_id: currentChannelId } : {}),
        }),
      });

      if (!response.ok) throw new Error("Nao foi possivel criar a nota");

      setInlineNoteDraft("");
      setIsCreatingNoteCard(false);
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey({ referenceNodeId: selectedNodeId }) });
    } finally {
      setSavingNoteInline(false);
    }
  };

  const openNewNoteCard = () => {
    setIsCreatingNoteCard(true);
    setSelectedNoteCardId(-1);
  };

  const startEditingNode = (targetNode?: any) => {
    const node = targetNode ?? selectedNode;
    if (!node) return;
    if (!canEditNode) return;
    setEditingNodeId(Number(node.id));
    setEditingNodeSnapshot(node);
    setNodeLabelDraft(String(node.label || ""));
    setNodeEditDraft(String(node.content || ""));
  };

  const saveNodeEdit = async (
    overrides?: { content?: string; label?: string },
    closeEditor = true,
  ) => {
    const targetNode = editingNodeSnapshot ?? selectedNode;
    if (!targetNode || !editingNodeId || !canEditNode) return;
    if (savingNodeEdit) return;

    const nextLabel = String(overrides?.label ?? nodeLabelDraft ?? targetNode.label ?? "");
    const nextContent = String(overrides?.content ?? nodeEditDraft ?? "");

    const payload = {
      type: String((targetNode as any)?.type || "VERSE"),
      label: nextLabel,
      content: nextContent,
      reference_id: Number((targetNode as any)?.reference_id ?? (targetNode as any)?.referenceId ?? refId),
      parent_node_id: (targetNode as any)?.parent_node_id ?? (targetNode as any)?.parentNodeId ?? null,
      position: Number((targetNode as any)?.position ?? 0),
    };

    setSavingNodeEdit(true);
    try {
      const token = localStorage.getItem("auth_token");
      let response = await fetch(`/api/reference-nodes/${editingNodeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        response = await fetch(`/api/references/${refId}/nodes/${editingNodeId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) throw new Error("Nao foi possivel editar o node");

      setAllNodes((prev) => prev.map((row: any) => {
        if (Number(row.id) !== Number(editingNodeId)) return row;
        return {
          ...row,
          label: payload.label,
          content: payload.content,
        };
      }));
      if (closeEditor) {
        setEditingNodeId(null);
        setEditingNodeSnapshot(null);
      }
    } finally {
      setSavingNodeEdit(false);
    }
  };

  const scheduleNodeAutosave = (draft: { content?: string; label?: string }) => {
    if (nodeAutosaveTimeoutRef.current) {
      window.clearTimeout(nodeAutosaveTimeoutRef.current);
    }

    nodeAutosaveTimeoutRef.current = window.setTimeout(() => {
      saveNodeEdit(draft, false);
    }, 500);
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!noteId) return;
    if (!window.confirm("Excluir esta nota?")) return;

    setDeletingNoteId(noteId);
    try {
      await deleteNoteMutation.mutateAsync({ id: noteId });
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      if (selectedNodeId) {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey({ referenceNodeId: selectedNodeId }) });
      }
    } finally {
      setDeletingNoteId(null);
    }
  };

  const goToReferenceInReading = (targetReference: any | null) => {
    if (!targetReference) return;
    setSelectedNodeId(null);
    setLocation(`/references/${Number(targetReference.id)}?view=reading`);
  };

  const goPreviousReference = () => goToReferenceInReading(previousReference);
  const goNextReference = () => goToReferenceInReading(nextReference);

  const handleReadingWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isReadingView || selectedNodeId) return;
    if (readingSwipeLockRef.current) return;

    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    if (absX < 45 || absX <= absY) return;

    if (event.deltaX > 0 && nextReference) {
      event.preventDefault();
      readingSwipeLockRef.current = true;
      goNextReference();
    } else if (event.deltaX < 0 && previousReference) {
      event.preventDefault();
      readingSwipeLockRef.current = true;
      goPreviousReference();
    } else {
      return;
    }

    if (readingSwipeUnlockTimerRef.current) {
      window.clearTimeout(readingSwipeUnlockTimerRef.current);
    }
    readingSwipeUnlockTimerRef.current = window.setTimeout(() => {
      readingSwipeLockRef.current = false;
    }, 550);
  };

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-full md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh)]">
        
        {/* Left Pane: Hierarchy Tree */}
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 bg-sidebar/50 flex flex-col h-[50vh] md:h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loadingNodes ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : navigatorReferences.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-4 font-serif">No structure defined yet.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="rounded-xl border border-border/50 bg-card/70 overflow-hidden">
                  <div className="flex w-full items-center gap-2 px-3 py-3 text-left border-b border-border/40">
                    <div className="min-w-0">
                      {currentChannelId ? (
                        <Link href={`/channels/${currentChannelId}`}>
                          <p className="truncate font-display text-base font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">
                            {currentChannelName || `Canal ${currentChannelId}`}
                          </p>
                        </Link>
                      ) : (
                        <p className="truncate font-display text-base font-semibold text-foreground">
                          {currentChannelName || "Referencia"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-2 pb-2 pt-1 space-y-1.5">
                    {navigatorReferences.map((row: any) => {
                      const relatedReferenceId = Number(row.id);
                      const relatedNodes = (nodesByReferenceId.get(relatedReferenceId) ?? [])
                        .slice()
                        .sort((a, b) => getNodePosition(a) - getNodePosition(b));
                      const relatedRootNodes = getReferenceVisibleRootNodes(row.title, relatedNodes);
                      const isActiveReference = relatedReferenceId === refId;
                      const showReferenceNodes = isActiveReference && isActiveReferenceExpanded;

                      return (
                        <div
                          key={relatedReferenceId}
                          className={`rounded-lg border overflow-hidden ${isActiveReference ? "border-primary/30 bg-primary/5" : "border-border/40 bg-background/70"}`}
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                            onClick={() => {
                              if (isActiveReference) {
                                if (isReadingView) {
                                  setSelectedNodeId(null);
                                }
                                setIsActiveReferenceExpanded((prev) => !prev);
                                return;
                              }
                              setLocation(`/references/${relatedReferenceId}${isReadingView ? "?view=reading" : ""}`);
                            }}
                          >
                            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                              {showReferenceNodes && relatedRootNodes.length > 0 ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold ${isActiveReference ? "text-primary" : "text-foreground"}`}>
                                {row.title}
                              </p>
                            </div>
                          </button>

                          {showReferenceNodes && relatedRootNodes.length > 0 && (
                            <div className="px-2 pb-2 pt-1">
                              {relatedRootNodes.map((node) => (
                                <TreeNode
                                  key={node.id}
                                  node={node}
                                  nodes={relatedNodes}
                                  level={1}
                                  selectedNodeId={selectedNodeId}
                                  onSelect={setSelectedNodeId}
                                  expandAll
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Content & Notes */}
        <div className="relative flex-1 flex flex-col h-auto md:h-full overflow-hidden bg-background">
          {isReadingView && (previousReference || nextReference) && (
            <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
              {previousReference ? (
                <div className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-border/70 bg-card/95 p-2.5 text-foreground shadow-sm backdrop-blur hover:bg-card"
                    onClick={goPreviousReference}
                    aria-label={`Voltar para ${String((previousReference as any).title || "semana anterior")}`}
                    title="Voltar"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                </div>
              ) : null}

              {nextReference ? (
                <div className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-border/70 bg-card/95 p-2.5 text-foreground shadow-sm backdrop-blur hover:bg-card"
                    onClick={goNextReference}
                    aria-label={`Ir para ${String((nextReference as any).title || "proxima semana")}`}
                    title="Proximo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {!selectedNodeId ? (
            isReadingView ? (
              <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-background" onWheel={handleReadingWheel}>
                <div className="max-w-3xl mx-auto space-y-3">
                  {readingNodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center opacity-50">
                      <AlignLeft className="w-16 h-16 mb-4 text-muted-foreground" />
                      <h2 className="text-xl font-display text-foreground">Sem estrutura para leitura</h2>
                    </div>
                  ) : (
                    readingNodes.map(({ node, level }) => {
                      const label = String((node as any)?.label || "").trim();
                      const content = String((node as any)?.content || "").trim();
                      const type = String((node as any)?.type || "").toUpperCase();
                      const isEditingThisReadingNode = editingNodeId === Number(node.id);
                      const noteStats = readingNodeNoteStats.get(Number(node.id));
                      const hasNotes = Boolean(noteStats && noteStats.count > 0);

                      return (
                        <div
                          key={node.id}
                          className="rounded-2xl border border-border/60 bg-card p-4 md:p-5 shadow-sm cursor-pointer hover:border-primary/30 transition-colors"
                          style={{ marginLeft: `${level * 8}px` }}
                          onClick={() => {
                            if (isEditingThisReadingNode) return;
                            setSelectedNodeId(Number(node.id));
                          }}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{type || "NODE"}</p>
                              {isEditingThisReadingNode ? (
                                <h2
                                  contentEditable
                                  suppressContentEditableWarning
                                  className="text-xl md:text-2xl font-display font-semibold text-foreground/95 mt-1 outline-none"
                                  onClick={(event) => event.stopPropagation()}
                                  onInput={(e) => {
                                    const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                                    setNodeLabelDraft(draft);
                                    scheduleNodeAutosave({ label: draft });
                                  }}
                                  onBlur={() => saveNodeEdit(undefined, true)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      if (nodeAutosaveTimeoutRef.current) {
                                        window.clearTimeout(nodeAutosaveTimeoutRef.current);
                                      }
                                      setEditingNodeId(null);
                                      setEditingNodeSnapshot(null);
                                    }
                                  }}
                                  ref={nodeLabelEditorRef}
                                />
                              ) : (
                                <h2
                                  className={`text-xl md:text-2xl font-display font-semibold text-foreground/95 mt-1 ${canEditNode ? "cursor-text" : ""}`}
                                  onClick={(event) => {
                                    if (!canEditNode) return;
                                    event.stopPropagation();
                                    startEditingNode(node);
                                  }}
                                >
                                  {label || "Sem titulo"}
                                </h2>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {hasNotes && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-[10px] text-muted-foreground">
                                  {noteStats?.recent ? (
                                    <span className="relative inline-flex shrink-0">
                                      <MessageCircle className="w-3.5 h-3.5 text-rose-500" />
                                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    </span>
                                  ) : (
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  )}
                                  <span>{noteStats?.count ?? 0}</span>
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                          {isEditingThisReadingNode ? (
                            <div
                              contentEditable
                              suppressContentEditableWarning
                              className="font-serif text-xl leading-loose text-foreground whitespace-pre-wrap outline-none"
                              onClick={(event) => event.stopPropagation()}
                              onInput={(e) => {
                                const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                                setNodeEditDraft(draft);
                                scheduleNodeAutosave({ content: draft });
                              }}
                              onBlur={() => saveNodeEdit(undefined, true)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  if (nodeAutosaveTimeoutRef.current) {
                                    window.clearTimeout(nodeAutosaveTimeoutRef.current);
                                  }
                                  setEditingNodeId(null);
                                  setEditingNodeSnapshot(null);
                                }
                              }}
                              ref={nodeContentEditorRef}
                            />
                          ) : content ? (
                            <div
                              className={`font-serif text-xl leading-loose text-foreground whitespace-pre-wrap ${canEditNode ? "cursor-text" : ""}`}
                              onClick={(event) => {
                                if (!canEditNode) return;
                                event.stopPropagation();
                                startEditingNode(node);
                              }}
                            >
                              {content}
                            </div>
                          ) : (
                            <p
                              className={`text-muted-foreground italic font-serif ${canEditNode ? "cursor-text" : ""}`}
                              onClick={(event) => {
                                if (!canEditNode) return;
                                event.stopPropagation();
                                startEditingNode(node);
                              }}
                            >
                              Sem conteudo textual.
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50">
                <AlignLeft className="w-16 h-16 mb-4 text-muted-foreground" />
                <h2 className="text-xl font-display text-foreground">Select a section</h2>
                <p className="text-sm text-muted-foreground font-serif mt-2">Choose an item from the structure on the left to read and view notes.</p>
              </div>
            )
          ) : (
            <>
              {/* Content Area */}
              <div className="shrink-0 p-8 md:p-12 border-b border-border/50 bg-card">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    {editingNodeId === selectedNode?.id ? (
                      <h2
                        contentEditable
                        suppressContentEditableWarning
                        className="text-3xl font-display font-bold outline-none"
                        onInput={(e) => {
                          const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                          setNodeLabelDraft(draft);
                          scheduleNodeAutosave({ label: draft });
                        }}
                        onBlur={() => saveNodeEdit(undefined, true)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            if (nodeAutosaveTimeoutRef.current) {
                              window.clearTimeout(nodeAutosaveTimeoutRef.current);
                            }
                            setEditingNodeId(null);
                            setEditingNodeSnapshot(null);
                          }
                        }}
                        ref={nodeLabelEditorRef}
                      />
                    ) : (
                      <h2
                        className={`text-3xl font-display font-bold ${canEditNode ? "cursor-text" : ""}`}
                        onClick={startEditingNode}
                      >
                        {selectedNode?.label}
                      </h2>
                    )}
                    <span className="text-xs font-medium px-2.5 py-1 bg-secondary rounded-md text-secondary-foreground border border-border">
                      {selectedNode?.type}
                    </span>
                  </div>
                  {editingNodeId === selectedNode?.id ? (
                    <div className="prose prose-stone dark:prose-invert max-w-none font-serif text-lg leading-loose text-foreground/90 whitespace-pre-wrap">
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="outline-none"
                        onInput={(e) => {
                          const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                          setNodeEditDraft(draft);
                          scheduleNodeAutosave({ content: draft });
                        }}
                        onBlur={() => saveNodeEdit(undefined, true)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            if (nodeAutosaveTimeoutRef.current) {
                              window.clearTimeout(nodeAutosaveTimeoutRef.current);
                            }
                            setEditingNodeId(null);
                            setEditingNodeSnapshot(null);
                          }
                        }}
                        ref={nodeContentEditorRef}
                      />
                    </div>
                  ) : selectedNode?.content ? (
                    <div className="prose prose-stone dark:prose-invert max-w-none font-serif text-lg leading-loose text-foreground/90 whitespace-pre-wrap">
                      <div
                        className={canEditNode ? "cursor-text" : ""}
                        onClick={startEditingNode}
                        role={canEditNode ? "button" : undefined}
                        tabIndex={canEditNode ? 0 : -1}
                        onKeyDown={(e) => {
                          if (canEditNode && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            startEditingNode();
                          }
                        }}
                      >
                        {selectedNode.content}
                      </div>
                    </div>
                  ) : (
                    <p
                      className={`text-muted-foreground italic font-serif ${canEditNode ? "cursor-text" : ""}`}
                      onClick={startEditingNode}
                    >
                      No text content available for this section.
                    </p>
                  )}
                </div>
              </div>

              {(
                <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-background">
                  <div className="max-w-3xl mx-auto">
                    <div className="mb-8">
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-none border-0"
                          onClick={openNewNoteCard}
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Adicionar nota
                        </Button>
                      </div>
                    </div>

                    {loadingNotes ? (
                      <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : notes?.length === 0 ? (
                      <div className="text-center p-12 border border-dashed border-border rounded-2xl bg-card/50">
                        <p className="text-muted-foreground font-serif">No reflections here yet. Be the first to write one.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {isCreatingNoteCard && (
                          <div
                            className={`rounded-2xl border bg-card p-8 shadow-sm transition-colors ${selectedNoteCardId === -1 ? "border-primary/40" : "border-border"}`}
                            onClick={() => setSelectedNoteCardId(-1)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                contentEditable
                                suppressContentEditableWarning
                                className="w-full font-serif text-xl leading-loose text-foreground whitespace-pre-wrap outline-none"
                                onInput={(e) => setInlineNoteDraft((e.currentTarget.textContent ?? "").replace(/\u00a0/g, " "))}
                                ref={newNoteEditorRef}
                              />

                              {selectedNoteCardId === -1 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                    onClick={() => setInlineNoteDraft("")}
                                    aria-label="Limpar nota"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setInlineNoteDraft("");
                                  setIsCreatingNoteCard(false);
                                  setSelectedNoteCardId(null);
                                }}
                                disabled={savingNoteInline}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={createInlineNote}
                                disabled={savingNoteInline || !inlineNoteDraft.trim()}
                              >
                                {savingNoteInline ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                                Salvar nota
                              </Button>
                            </div>
                          </div>
                        )}

                        {notes?.map(note => (
                          (() => {
                            const noteId = Number((note as any).id ?? 0);
                            const isSelected = selectedNoteCardId === noteId;
                            const isEditingThisNote = editingNoteId === noteId;
                            const authorName = getNoteAuthorName(note);
                            const authorId = getNoteAuthorId(note);
                            const createdAt = (note as any).createdAt || (note as any).created_at;
                            return (
                          <div
                            key={note.id}
                            className={`rounded-2xl border bg-card p-8 shadow-sm transition-colors ${isSelected ? "border-primary/40" : "border-border"}`}
                            onClick={() => setSelectedNoteCardId(noteId)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="w-full">
                                {isEditingThisNote ? (
                                  <div
                                    contentEditable
                                    suppressContentEditableWarning
                                    className="font-serif text-xl leading-loose text-foreground whitespace-pre-wrap outline-none"
                                    onInput={(e) => {
                                      const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                                      setNoteEditDraft(draft);
                                      scheduleNoteAutosave(note, draft);
                                    }}
                                    onBlur={() => saveNoteEdit(note, undefined, true)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        if (noteAutosaveTimeoutRef.current) {
                                          window.clearTimeout(noteAutosaveTimeoutRef.current);
                                        }
                                        setEditingNoteId(null);
                                      }
                                    }}
                                    ref={noteEditorRef}
                                  />
                                ) : (
                                  <div
                                    className={`font-serif text-xl leading-loose text-foreground whitespace-pre-wrap ${canEditNote(note) ? "cursor-text" : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingNote(note);
                                    }}
                                  >
                                    {note.content}
                                  </div>
                                )}
                              </div>

                              {isSelected && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                                    onClick={() => navigator.clipboard.writeText(String(note.content || ""))}
                                    aria-label="Copiar nota"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  {canDeleteNote(note) && (
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center rounded-md border border-border/50 p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                      onClick={() => handleDeleteNote(noteId)}
                                      aria-label="Excluir nota"
                                      disabled={deletingNoteId === noteId}
                                    >
                                      {deletingNoteId === noteId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-2">
                              {authorId ? (
                                <Link href={`/channels/user/${authorId}`}>
                                  <span className="hover:text-primary transition-colors">{authorName}</span>
                                </Link>
                              ) : (
                                <span>{authorName}</span>
                              )}
                              <span>•</span>
                              <span>{createdAt ? format(new Date(createdAt), 'MMM d, yyyy') : ''}</span>
                              {savingNoteEdit && isEditingThisNote ? (
                                <>
                                  <span>•</span>
                                  <span>salvando...</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                            );
                          })()
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
