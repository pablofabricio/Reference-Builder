import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { getListNotesQueryKey, useDeleteNote, useGetReference, useListChannels, useListNotes, useListReferenceNodes, useListReferences, type ReferenceNode } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, ChevronDown, AlignLeft, Plus, Copy, Trash2, MessageCircle, Bold, Italic, Underline, MessageSquareQuote, List, ListOrdered, Minus } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UserAvatar } from "@/components/ui/user-avatar";

type UserSummary = { name: string; avatarUrl?: string };
type NodeFormat = "bold" | "italic" | "underline" | "quote" | "ordered-list" | "dash-list" | "bullet-list" | "break";
type HighlightColor = "yellow" | "green" | "blue" | "pink";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeHtml = (raw: string) =>
  raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+=\"[^\"]*\"/gi, "")
    .replace(/\son\w+=\'[^\']*\'/gi, "")
    .replace(/javascript:/gi, "");

const highlightColorMap: Record<HighlightColor, string> = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
};

const blockquoteClassName = "reference-blockquote";
const bulletListClassName = "reference-list-bullet";
const dashListClassName = "reference-list-dash";
const breakClassName = "reference-break";

const wrapCurrentSelection = (beforeHtml: string, afterHtml: string, fallbackText = "") => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  const selectedHtml = range.toString().trim();
  const html = `${beforeHtml}${selectedHtml || fallbackText}${afterHtml}`;
  document.execCommand("insertHTML", false, html);
  return true;
};

const getSelectionTextLines = () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [] as string[];

  return selection
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const insertListFromSelection = (variant: "ordered" | "dash" | "bullet") => {
  const lines = getSelectionTextLines();
  const items = (lines.length > 0 ? lines : [""])
    .map((line) => `<li>${line ? escapeHtml(line) : "<br />"}</li>`)
    .join("");

  if (variant === "ordered") {
    document.execCommand("insertHTML", false, `<ol>${items}</ol>`);
    return;
  }

  if (variant === "dash") {
    document.execCommand("insertHTML", false, `<ul class=\"${dashListClassName}\">${items}</ul>`);
    return;
  }

  document.execCommand("insertHTML", false, `<ul class=\"${bulletListClassName}\">${items}</ul>`);
};

const applyHighlightToSelection = (color: HighlightColor) => {
  const hex = highlightColorMap[color];
  if (!hex) return;

  if (document.queryCommandSupported?.("hiliteColor")) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("hiliteColor", false, hex);
    return;
  }

  wrapCurrentSelection(`<mark style=\"background:${hex};padding:0 .08em;border-radius:.12em;\">`, "</mark>", "texto");
};

const renderInlineFormatting = (raw: string) => {
  const escaped = escapeHtml(raw);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>");
};

const renderFormattedContent = (raw: string) => {
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return sanitizeHtml(raw);
  }

  const lines = raw.split("\n");
  const chunks: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }

    chunks.push(`<ul>${listBuffer.join("")}</ul>`);
    listBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2);
      listBuffer.push(`<li>${renderInlineFormatting(item)}</li>`);
      return;
    }

    flushList();

    if (!trimmed) {
      chunks.push("<p><br /></p>");
      return;
    }

    if (trimmed.startsWith("> ")) {
      chunks.push(`<blockquote>${renderInlineFormatting(trimmed.slice(2))}</blockquote>`);
      return;
    }

    chunks.push(`<p>${renderInlineFormatting(line)}</p>`);
  });

  flushList();

  return chunks.join("");
};

const stripHtmlToText = (raw: string) =>
  String(raw || "")
    .replace(/<blockquote[^>]*>/gi, "")
    .replace(/<\/blockquote>/gi, "")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeRichContentForCompare = (raw: string) =>
  renderFormattedContent(String(raw || ""))
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();

const getNodeParentId = (node: ReferenceNode | any) => {
  const raw = node.parentNodeId ?? node.parent_node_id ?? null;
  const normalized = Number(raw);

  if (raw == null || Number.isNaN(normalized) || normalized <= 0) {
    return null;
  }

  return normalized;
};
const getNodePosition = (node: ReferenceNode | any) => Number(node.position ?? 0);
const getNodeReferenceId = (node: ReferenceNode | any) => Number(node.referenceId ?? node.reference_id ?? 0);
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

  if (rootNodes.length === 0 && nodes.length > 0) {
    return [...nodes].sort((a, b) => getNodePosition(a) - getNodePosition(b));
  }

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

const getReferenceTitleFromNodes = (nodes: ReferenceNode[]): string => {
  if (!Array.isArray(nodes) || nodes.length === 0) return "";

  const titleFromEmbeddedReference = nodes
    .map((node: any) => String(node?.reference?.title || "").trim())
    .find((title) => title.length > 0);

  if (titleFromEmbeddedReference) {
    return titleFromEmbeddedReference;
  }

  const rootNodes = nodes
    .filter((node) => getNodeParentId(node) == null)
    .sort((a, b) => getNodePosition(a) - getNodePosition(b));

  if (rootNodes.length > 0) {
    return String((rootNodes[0] as any)?.label || "").trim();
  }

  return String((nodes[0] as any)?.label || "").trim();
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

const getNodeAncestorIds = (nodes: ReferenceNode[], nodeId: number): number[] => {
  const byId = new Map<number, ReferenceNode>();
  nodes.forEach((node) => {
    byId.set(Number(node.id), node);
  });

  const ancestors: number[] = [];
  let currentParentId = getNodeParentId(byId.get(nodeId) as any);

  while (currentParentId != null) {
    ancestors.push(Number(currentParentId));
    const parentNode = byId.get(Number(currentParentId));
    if (!parentNode) break;
    currentParentId = getNodeParentId(parentNode as any);
  }

  return ancestors;
};

const focusEditableAtEnd = (element: HTMLElement | null) => {
  if (!element) return;

  element.focus();

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const focusEditableAtStart = (element: HTMLElement | null) => {
  if (!element) return;

  element.focus();

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const focusEditableAtPoint = (element: HTMLElement | null, x: number, y: number) => {
  if (!element) return false;

  element.focus();

  const doc = document as any;
  const selection = window.getSelection();
  if (!selection) return false;

  if (typeof doc.caretPositionFromPoint === "function") {
    const caretPosition = doc.caretPositionFromPoint(x, y);
    if (caretPosition?.offsetNode) {
      const range = document.createRange();
      range.setStart(caretPosition.offsetNode, caretPosition.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }

  if (typeof doc.caretRangeFromPoint === "function") {
    const caretRange = doc.caretRangeFromPoint(x, y);
    if (caretRange) {
      selection.removeAllRanges();
      selection.addRange(caretRange);
      return true;
    }
  }

  return false;
};

// Recursive component to render the hierarchy
const TreeNode = ({ 
  node, 
  nodes, 
  level = 0, 
  selectedNodeId, 
  expandedNodeIds,
  onSelect,
  onToggleExpand,
}: { 
  node: ReferenceNode, 
  nodes: ReferenceNode[], 
  level?: number,
  selectedNodeId: number | null,
  expandedNodeIds: Record<number, boolean>,
  onSelect: (id: number) => void,
  onToggleExpand: (id: number) => void,
}) => {
  const expanded = expandedNodeIds[Number(node.id)] ?? level < 2;
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
        }}
      >
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center mr-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            if (!hasChildren) return;
            onToggleExpand(Number(node.id));
          }}
          aria-label={expanded ? "Fechar seção" : "Abrir seção"}
        >
          {hasChildren ? (expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4 h-4" />}
        </button>
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
              expandedNodeIds={expandedNodeIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
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
  const refId = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = id || params.get("ref") || "0";
    return parseInt(raw, 10);
  }, [id, search]);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isReadingView = useMemo(() => {
    const params = new URLSearchParams(search);
    const explicitReading = params.get("view") === "reading";
    const queryRefMode = !id && Boolean(params.get("ref"));
    return explicitReading || queryRefMode;
  }, [search, id]);
  const initialNodeIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("node") || "0";
    const parsed = Number(raw);
    return parsed > 0 ? parsed : null;
  }, [search]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [expandedReferenceIds, setExpandedReferenceIds] = useState<Record<number, boolean>>({});
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<number, boolean>>({});
  const [allNodes, setAllNodes] = useState<ReferenceNode[]>([]);
  const [loadingAllNodes, setLoadingAllNodes] = useState(true);
  const [loadingCurrentReferenceNodes, setLoadingCurrentReferenceNodes] = useState(false);
  const [channelReferenceLinks, setChannelReferenceLinks] = useState<any[]>([]);
  const [loadingChannelReferenceLinks, setLoadingChannelReferenceLinks] = useState(true);
  const [fallbackNavigatorReferences, setFallbackNavigatorReferences] = useState<any[]>([]);
  const [fallbackReferenceById, setFallbackReferenceById] = useState<any | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [editSaveState, setEditSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savingNoteInline, setSavingNoteInline] = useState(false);
  const [inlineNoteDraft, setInlineNoteDraft] = useState("");
  const [isCreatingNoteCard, setIsCreatingNoteCard] = useState(false);
  const [usersById, setUsersById] = useState<Record<number, UserSummary>>({});
  const [myChannelRole, setMyChannelRole] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingNodeSnapshot, setEditingNodeSnapshot] = useState<any | null>(null);
  const [editingNodeFocusField, setEditingNodeFocusField] = useState<"label" | "content">("label");
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
  const saveIndicatorTimeoutRef = useRef<number | null>(null);
  const noteEditorRef = useRef<HTMLDivElement | null>(null);
  const newNoteEditorRef = useRef<HTMLDivElement | null>(null);
  const readingSwipeLockRef = useRef(false);
  const readingSwipeUnlockTimerRef = useRef<number | null>(null);
  const pendingNodeEditorClickPointRef = useRef<{ x: number; y: number } | null>(null);
  const nodeEditorFocusClass = "outline-none rounded-md px-1 -mx-1 caret-primary ring-2 ring-primary/35 bg-primary/5";

  const { data: reference, isLoading: loadingRef } = useGetReference(refId);
  const { data: references, isLoading: loadingReferences } = useListReferences();
  const { data: referenceNodesByReferenceEndpoint, isLoading: loadingReferenceNodesByReferenceEndpoint } = useListReferenceNodes(refId);
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const deleteNoteMutation = useDeleteNote();

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

    const loadCurrentReferenceNodes = async () => {
      if (!refId || Number.isNaN(refId)) return;

      setLoadingCurrentReferenceNodes(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch(`/api/reference-nodes?reference_id=${refId}`, { headers });
        if (!response.ok) throw new Error("Failed to load nodes for reference");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        if (isMounted) {
          setAllNodes((previous) => {
            const withoutCurrentReference = previous.filter(
              (node: any) => getNodeReferenceId(node) !== refId,
            );

            return [...withoutCurrentReference, ...(rows as ReferenceNode[])];
          });
        }
      } catch {
        if (isMounted) {
          setAllNodes((previous) => previous);
        }
      } finally {
        if (isMounted) {
          setLoadingCurrentReferenceNodes(false);
        }
      }
    };

    loadCurrentReferenceNodes();

    return () => {
      isMounted = false;
    };
  }, [refId]);

  useEffect(() => {
    if (!refId || Number.isNaN(refId)) return;

    const rows = Array.isArray(referenceNodesByReferenceEndpoint)
      ? referenceNodesByReferenceEndpoint
      : [];

    if (rows.length === 0) return;

    setAllNodes((previous) => {
      const withoutCurrentReference = previous.filter(
        (node: any) => getNodeReferenceId(node) !== refId,
      );

      return [...withoutCurrentReference, ...(rows as ReferenceNode[])];
    });
  }, [referenceNodesByReferenceEndpoint, refId]);

  useEffect(() => {
    let isMounted = true;

    const loadChannelReferenceLinks = async () => {
      setLoadingChannelReferenceLinks(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        // First, find channels linked to the current reference.
        const byReferenceResponse = await fetch(`/api/channel-references?reference_id=${refId}`, { headers });
        const byReferencePayload = byReferenceResponse.ok
          ? await byReferenceResponse.json().catch(() => ({}))
          : {};
        const byReferenceRows = Array.isArray((byReferencePayload as any)?.data)
          ? (byReferencePayload as any).data
          : Array.isArray(byReferencePayload)
            ? byReferencePayload
            : [];

        const referenceChannelId = Number(
          (byReferenceRows[0] as any)?.channel_id ?? (byReferenceRows[0] as any)?.channelId ?? 0,
        );

        if (referenceChannelId > 0) {
          const byChannelResponse = await fetch(`/api/channel-references?channel_id=${referenceChannelId}`, { headers });
          const byChannelPayload = byChannelResponse.ok
            ? await byChannelResponse.json().catch(() => ({}))
            : {};
          const byChannelRows = Array.isArray((byChannelPayload as any)?.data)
            ? (byChannelPayload as any).data
            : Array.isArray(byChannelPayload)
              ? byChannelPayload
              : [];

          if (isMounted) {
            setChannelReferenceLinks(byChannelRows);
            setFallbackNavigatorReferences([]);
          }

          // Also hydrate references/nodes from channel detail to avoid empty tree when
          // reference-nodes endpoints are inconsistent across environments.
          const withReferencesResponse = await fetch(`/api/channels/${referenceChannelId}/with-references`, { headers });
          if (withReferencesResponse.ok) {
            const withReferencesPayload = await withReferencesResponse.json().catch(() => ({}));
            const withReferencesData = withReferencesPayload?.data ?? withReferencesPayload;
            const referencesFromChannel = Array.isArray(withReferencesData?.references)
              ? withReferencesData.references
              : [];
            const currentReferenceFromChannel = referencesFromChannel.find(
              (reference: any) => Number(reference?.id) === refId,
            );
            const currentReferenceNodes = Array.isArray(currentReferenceFromChannel?.nodes)
              ? currentReferenceFromChannel.nodes
              : [];

            if (isMounted && referencesFromChannel.length > 0) {
              setFallbackNavigatorReferences(referencesFromChannel);
            }

            if (isMounted && currentReferenceNodes.length > 0) {
              setAllNodes((previous) => {
                const withoutCurrentReference = previous.filter(
                  (node: any) => getNodeReferenceId(node) !== refId,
                );
                return [...withoutCurrentReference, ...currentReferenceNodes];
              });
            }
          }

          return;
        }

        // Fallback: discover the channel context by loading channel detail with references.
        const channelRows = Array.isArray(channels) ? channels : [];
        for (const channel of channelRows as any[]) {
          const channelId = Number(channel?.id ?? 0);
          if (!channelId) continue;

          const channelResponse = await fetch(`/api/channels/${channelId}/with-references`, { headers });
          if (!channelResponse.ok) continue;

          const channelPayload = await channelResponse.json().catch(() => ({}));
          const channelData = channelPayload?.data ?? channelPayload;
          const referencesFromChannel = Array.isArray(channelData?.references)
            ? channelData.references
            : [];

          const hasCurrentReference = referencesFromChannel.some(
            (reference: any) => Number(reference?.id) === refId,
          );

          if (!hasCurrentReference) continue;

          const syntheticLinks = referencesFromChannel
            .map((reference: any) => {
              const referenceId = Number(reference?.id ?? 0);
              if (!referenceId) return null;

              return {
                channel_id: channelId,
                reference_id: referenceId,
              };
            })
            .filter(Boolean);

          const matchedReference = referencesFromChannel.find(
            (reference: any) => Number(reference?.id) === refId,
          );
          const matchedNodes = Array.isArray(matchedReference?.nodes)
            ? matchedReference.nodes
            : [];

          if (isMounted) {
            setChannelReferenceLinks(syntheticLinks as any[]);
            setFallbackNavigatorReferences(referencesFromChannel);

            if (matchedNodes.length > 0) {
              setAllNodes((previous) => {
                const withoutCurrentReference = previous.filter(
                  (node: any) => getNodeReferenceId(node) !== refId,
                );
                return [...withoutCurrentReference, ...matchedNodes];
              });
            }
          }

          return;
        }

        // Fallback for environments that do not filter correctly by reference_id.
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
          setFallbackNavigatorReferences([]);
        }
      } catch {
        if (isMounted) {
          setChannelReferenceLinks([]);
          setFallbackNavigatorReferences([]);
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
  }, [refId, channels]);

  useEffect(() => {
    let isMounted = true;

    const loadReferenceById = async () => {
      if (!refId || Number.isNaN(refId)) {
        if (isMounted) setFallbackReferenceById(null);
        return;
      }

      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch(`/api/references/${refId}`, { headers });
        if (!response.ok) {
          if (isMounted) setFallbackReferenceById(null);
          return;
        }

        const payload = await response.json().catch(() => ({}));
        const row = payload?.data ?? payload;
        if (isMounted) {
          setFallbackReferenceById(row && Number(row?.id ?? 0) > 0 ? row : null);
        }
      } catch {
        if (isMounted) {
          setFallbackReferenceById(null);
        }
      }
    };

    loadReferenceById();

    return () => {
      isMounted = false;
    };
  }, [refId]);

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

        const mapped = rows.reduce((acc: Record<number, UserSummary>, row: any) => {
          const userId = Number(row.id);
          if (!Number.isNaN(userId) && typeof row.name === "string") {
            acc[userId] = {
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
    setSelectedNodeId(initialNodeIdFromQuery);
    setExpandedReferenceIds((previous) => ({
      ...previous,
      [refId]: true,
    }));
    setExpandedNodeIds({});
    setInlineNoteDraft("");
    setIsCreatingNoteCard(false);
    setEditingNodeId(null);
  }, [refId, initialNodeIdFromQuery]);
  const toggleReferenceExpand = (referenceId: number) => {
    setExpandedReferenceIds((previous) => ({
      ...previous,
      [referenceId]: !(previous[referenceId] ?? true),
    }));
  };


  useEffect(() => {
    setInlineNoteDraft("");
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
      if (saveIndicatorTimeoutRef.current) {
        window.clearTimeout(saveIndicatorTimeoutRef.current);
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
      const formatted = renderFormattedContent(nodeEditDraft);
      if (nodeContentEditorRef.current.innerHTML !== formatted) {
        nodeContentEditorRef.current.innerHTML = formatted;
      }
    }

    window.requestAnimationFrame(() => {
      const targetElement = editingNodeFocusField === "content"
        ? (nodeContentEditorRef.current ?? nodeLabelEditorRef.current)
        : (nodeLabelEditorRef.current ?? nodeContentEditorRef.current);

      const clickPoint = pendingNodeEditorClickPointRef.current;
      if (clickPoint && focusEditableAtPoint(targetElement, clickPoint.x, clickPoint.y)) {
        pendingNodeEditorClickPointRef.current = null;
        return;
      }

      pendingNodeEditorClickPointRef.current = null;
      focusEditableAtStart(targetElement);
    });
  }, [editingNodeId, selectedNodeId, editingNodeFocusField]);

  useEffect(() => {
    if (!editingNoteId || !noteEditorRef.current) return;
    const formatted = renderFormattedContent(noteEditDraft);
    if (noteEditorRef.current.innerHTML !== formatted) {
      noteEditorRef.current.innerHTML = formatted;
    }
  }, [editingNoteId]);

  useEffect(() => {
    if (!isCreatingNoteCard || !newNoteEditorRef.current) return;
    const formatted = renderFormattedContent(inlineNoteDraft);
    if (newNoteEditorRef.current.innerHTML !== formatted) {
      newNoteEditorRef.current.innerHTML = formatted;
    }
  }, [isCreatingNoteCard]);

  const currentReference = useMemo(() => {
    const referencePayload = reference as any;

    if (referencePayload?.title) {
      return referencePayload;
    }

    if (referencePayload?.data?.title) {
      return referencePayload.data;
    }

    const listMatch = (references ?? []).find((row: any) => Number(row.id) === refId) ?? null;
    if (listMatch) return listMatch;

    if (fallbackReferenceById?.title) {
      return fallbackReferenceById;
    }

    return null;
  }, [reference, references, refId, fallbackReferenceById]);

  const nodesByReferenceId = useMemo(() => {
    const grouped = new Map<number, ReferenceNode[]>();

    allNodes.forEach((node: any) => {
      const referenceId = getNodeReferenceId(node);
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
    const resolvedCurrentTitle = String(currentReference?.title || fallbackReferenceById?.title || "").trim();
    const currentNodeTitle = getReferenceTitleFromNodes(nodesByReferenceId.get(refId) ?? []);
    const resolvedCurrentTitleWithFallback = resolvedCurrentTitle || currentNodeTitle;
    const getResolvedTitleForReference = (rowId: number, row?: any) => {
      const listTitle = String(
        referenceRows.find((referenceRow: any) => Number(referenceRow?.id ?? 0) === rowId)?.title || "",
      ).trim();
      const rowTitle = String(row?.title || "").trim();
      const nodeTitle = getReferenceTitleFromNodes(nodesByReferenceId.get(rowId) ?? []);

      return (
        (rowId === refId ? resolvedCurrentTitleWithFallback : "") ||
        listTitle ||
        rowTitle ||
        nodeTitle ||
        (rowId > 0 ? `Referência ${rowId}` : "")
      );
    };
    const ensureCurrentReferencePresent = (rows: any[]) => {
      if (!refId || Number.isNaN(refId)) return rows;

      const hasCurrentReference = rows.some((row: any) => Number(row?.id ?? 0) === refId);
      if (hasCurrentReference) return rows;

      return [
        ...rows,
        {
          ...(currentReference || fallbackReferenceById || {}),
          id: refId,
          title: getResolvedTitleForReference(refId, currentReference || fallbackReferenceById),
        },
      ];
    };
    const sortReferences = (rows: any[]) => rows.sort((a: any, b: any) => {
      const orderDiff = getReferenceSortOrder(a) - getReferenceSortOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    });

    if (fallbackNavigatorReferences.length > 0) {
      const mappedRows = [...fallbackNavigatorReferences]
        .map((row: any) => {
          const rowId = Number(row?.id ?? 0);
          return {
            ...row,
            title: getResolvedTitleForReference(rowId, row),
          };
        });

      return sortReferences(ensureCurrentReferencePresent(mappedRows));
    }

    const resolvedTitle = resolvedCurrentTitleWithFallback;

    if (!currentChannelId || channelReferenceIds.size === 0) {
      if (currentReference) return [currentReference];

      if (refId > 0) {
        return [{ id: refId, title: resolvedTitle || `Referência ${refId}` }];
      }

      return [];
    }

    const rows = referenceRows
      .filter((row: any) => channelReferenceIds.has(Number(row.id)))
      .map((row: any) => ({
        ...row,
        title: getResolvedTitleForReference(Number(row?.id ?? 0), row),
      }));

    if (rows.length > 0) return sortReferences(ensureCurrentReferencePresent(rows));

    if (currentReference) return [currentReference];

    if (refId > 0) {
      return [{ id: refId, title: resolvedTitle || `Referência ${refId}` }];
    }

    return [];
  }, [references, currentChannelId, channelReferenceIds, currentReference, fallbackNavigatorReferences, fallbackReferenceById, refId, nodesByReferenceId]);

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

  const currentReadingNodeIndex = useMemo(() => {
    if (!selectedNodeId) return -1;
    return readingNodes.findIndex(({ node }) => Number(node.id) === Number(selectedNodeId));
  }, [readingNodes, selectedNodeId]);

  const previousReadingNode = useMemo(() => {
    if (currentReadingNodeIndex <= 0) return null;
    return readingNodes[currentReadingNodeIndex - 1]?.node ?? null;
  }, [readingNodes, currentReadingNodeIndex]);

  const nextReadingNode = useMemo(() => {
    if (currentReadingNodeIndex < 0 || currentReadingNodeIndex >= readingNodes.length - 1) return null;
    return readingNodes[currentReadingNodeIndex + 1]?.node ?? null;
  }, [readingNodes, currentReadingNodeIndex]);

  const handleToggleNodeExpand = (nodeId: number) => {
    setExpandedNodeIds((previous) => ({
      ...previous,
      [nodeId]: !(previous[nodeId] ?? true),
    }));
  };

  const handleSelectNode = (nodeId: number, sourceNodes: ReferenceNode[]) => {
    const ancestorIds = getNodeAncestorIds(sourceNodes, nodeId);
    setExpandedNodeIds((previous) => {
      const next = { ...previous };
      ancestorIds.forEach((ancestorId) => {
        next[ancestorId] = true;
      });
      return next;
    });
    setSelectedNodeId(nodeId);
  };

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
  const hasMinimumStructureContext = Boolean(currentReference) || nodes.length > 0 || navigatorReferences.length > 0;
  const loadingNodes = !hasMinimumStructureContext && (
    loadingRef ||
    loadingAllNodes ||
    loadingCurrentReferenceNodes ||
    loadingReferenceNodesByReferenceEndpoint ||
    loadingReferences
  );

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
    const mapped = String(usersById[authorId]?.name || "").trim();
    if (mapped) return mapped;

    if (authorId === Number(user?.id ?? 0) && String(user?.name || "").trim()) {
      return String(user?.name || "").trim();
    }

    return authorId > 0 ? `User ${authorId}` : "Autor não informado";
  };

  const getNoteAuthorAvatar = (note: any) => {
    const authorId = Number(note?.userId ?? note?.user_id ?? note?.user?.id ?? 0);

    return String(
      note?.user?.avatar_url ||
      note?.user?.avatarUrl ||
      usersById[authorId]?.avatarUrl ||
      (authorId === Number(user?.id ?? 0) ? ((user as any)?.avatar_url || (user as any)?.avatarUrl || "") : "") ||
      "",
    ).trim();
  };

  const getNoteAuthorId = (note: any) => Number(note?.user?.id ?? note?.userId ?? note?.user_id ?? 0);

  const getValidatedNoteVisibility = (note: any): "PRIVATE" | "PUBLIC" | "CHANNEL" | undefined => {
    const value = String(note?.visibility || "").toUpperCase();
    if (value === "PRIVATE" || value === "PUBLIC" || value === "CHANNEL") {
      return value;
    }
    return undefined;
  };

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

    const liveEditorContent = editingNoteId === noteId ? String(noteEditorRef.current?.innerHTML || "") : "";
    const content = String(contentOverride ?? (liveEditorContent || noteEditDraft || ""));
    const originalContent = String(note?.content || "");
    const didContentChange =
      normalizeRichContentForCompare(content) !== normalizeRichContentForCompare(originalContent);
    const visibility = getValidatedNoteVisibility(note);
    const resolvedChannelId = Number(note?.channelId ?? note?.channel_id ?? currentChannelId ?? 0) || undefined;
    const resolvedReferenceNodeId = Number(
      note?.referenceNodeId ??
      note?.reference_node_id ??
      note?.referenceNode?.id ??
      selectedNodeId ??
      0,
    ) || undefined;
    const fallbackVisibility: "PRIVATE" | "PUBLIC" | "CHANNEL" = resolvedChannelId ? "CHANNEL" : "PRIVATE";
    const resolvedVisibility = visibility ?? fallbackVisibility;

    const payload: any = {
      content,
      visibility: resolvedVisibility,
      ...(resolvedReferenceNodeId ? { reference_node_id: resolvedReferenceNodeId } : {}),
      ...(resolvedVisibility === "CHANNEL" ? { channel_id: resolvedChannelId ?? null } : {}),
    };

    if (!didContentChange) {
      if (closeEditor) {
        setEditingNoteId(null);
      }
      setEditSaveState("saved");
      return;
    }

    setSavingNoteEdit(true);
    setEditSaveState("saving");
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = String(errorPayload?.message || errorPayload?.error || "Não foi possível salvar a nota");
        throw new Error(message);
      }

      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      if (selectedNodeId) {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey({ referenceNodeId: selectedNodeId }) });
      }

      if (closeEditor) {
        setEditingNoteId(null);
      }
      setEditSaveState("saved");
    } catch (error: any) {
      setEditSaveState("error");
      toast({ title: error?.message || "Erro ao salvar nota", variant: "destructive" });
    } finally {
      setSavingNoteEdit(false);
    }
  };

  const scheduleNoteAutosave = (note: any, draft: string) => {
    setEditSaveState("saving");

    if (noteAutosaveTimeoutRef.current) {
      window.clearTimeout(noteAutosaveTimeoutRef.current);
    }

    noteAutosaveTimeoutRef.current = window.setTimeout(() => {
      saveNoteEdit(note, draft, false);
    }, 500);
  };

  const handleNoteBlurSave = (note: any) => {
    if (noteAutosaveTimeoutRef.current) {
      window.clearTimeout(noteAutosaveTimeoutRef.current);
      noteAutosaveTimeoutRef.current = null;
    }

    const draftFromEditor = String(noteEditorRef.current?.innerHTML || noteEditDraft || "");
    saveNoteEdit(note, draftFromEditor, true);
  };

  const createInlineNote = async () => {
    const content = inlineNoteDraft.trim();
    const fallbackNodeId = Number(readingNodes?.[0]?.node?.id ?? nodes?.[0]?.id ?? 0);
    const targetNodeId = Number(selectedNodeId ?? fallbackNodeId);
    if (!content || savingNoteInline) return;

    if (!selectedNodeId && targetNodeId > 0) {
      setSelectedNodeId(targetNodeId);
    }

    setSavingNoteInline(true);
    setEditSaveState("saving");
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
          ...(targetNodeId > 0 ? { reference_node_id: targetNodeId } : {}),
          ...(currentChannelId ? { channel_id: currentChannelId } : {}),
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.message || "Não foi possível criar a nota");
      }

      setInlineNoteDraft("");
      setIsCreatingNoteCard(false);
      queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
      if (targetNodeId > 0) {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey({ referenceNodeId: targetNodeId }) });
      }
      setEditSaveState("saved");
      toast({ title: "Nota criada" });
    } catch (error: any) {
      setEditSaveState("error");
      toast({ title: error?.message || "Erro ao criar nota", variant: "destructive" });
    } finally {
      setSavingNoteInline(false);
    }
  };

  const openNewNoteCard = () => {
    if (!selectedNodeId) {
      const fallbackNodeId = Number(readingNodes?.[0]?.node?.id ?? nodes?.[0]?.id ?? 0);
      if (fallbackNodeId > 0) {
        setSelectedNodeId(fallbackNodeId);
      }
    }
    setIsCreatingNoteCard(true);
    setSelectedNoteCardId(-1);
  };

  const startEditingNode = (
    targetNode?: any,
    focusField: "label" | "content" = "label",
    clickPoint?: { x: number; y: number },
  ) => {
    const node = targetNode ?? selectedNode;
    if (!node) return;
    if (!canEditNode) return;
    pendingNodeEditorClickPointRef.current = clickPoint ?? null;
    setEditingNodeId(Number(node.id));
    setEditingNodeSnapshot(node);
    setEditingNodeFocusField(focusField);
    setNodeLabelDraft(String(node.label || ""));
    setNodeEditDraft(String(node.content || ""));
  };

  const saveNodeEditInternal = async (
    targetNodeInput: any,
    targetNodeIdInput: number,
    overrides?: { content?: string; label?: string },
    closeEditor = true,
  ) => {
    const targetNode = targetNodeInput;
    const targetNodeId = Number(targetNodeIdInput || 0);
    if (!targetNode || !targetNodeId || !canEditNode) return;
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
    setEditSaveState("saving");
    try {
      const token = localStorage.getItem("auth_token");
      let response = await fetch(`/api/reference-nodes/${targetNodeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        response = await fetch(`/api/references/${refId}/nodes/${targetNodeId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) throw new Error("Não foi possível editar o node");

      setAllNodes((prev) => prev.map((row: any) => {
        if (Number(row.id) !== Number(targetNodeId)) return row;
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
      setEditSaveState("saved");
    } catch {
      setEditSaveState("error");
    } finally {
      setSavingNodeEdit(false);
    }
  };

  const saveNodeEdit = async (
    overrides?: { content?: string; label?: string },
    closeEditor = true,
  ) => {
    const targetNode = editingNodeSnapshot ?? selectedNode;
    const targetNodeId = Number(editingNodeId ?? targetNode?.id ?? 0);
    await saveNodeEditInternal(targetNode, targetNodeId, overrides, closeEditor);
  };

  const handleNodeBlurSave = (field: "label" | "content") => {
    if (nodeAutosaveTimeoutRef.current) {
      window.clearTimeout(nodeAutosaveTimeoutRef.current);
      nodeAutosaveTimeoutRef.current = null;
    }

    const liveLabel = String((nodeLabelEditorRef.current?.textContent ?? nodeLabelDraft) || "").replace(/\u00a0/g, " ");
    const liveContent = String(nodeContentEditorRef.current?.innerHTML || nodeEditDraft || "");

    saveNodeEdit(
      field === "label"
        ? { label: liveLabel }
        : { content: liveContent },
      true,
    );
  };

  const scheduleNodeAutosave = (draft: { content?: string; label?: string }) => {
    setEditSaveState("saving");

    const capturedNode = editingNodeSnapshot ?? selectedNode;
    const capturedNodeId = Number(editingNodeId ?? capturedNode?.id ?? 0);

    if (nodeAutosaveTimeoutRef.current) {
      window.clearTimeout(nodeAutosaveTimeoutRef.current);
    }

    nodeAutosaveTimeoutRef.current = window.setTimeout(() => {
      if (!capturedNode || !capturedNodeId || !canEditNode || savingNodeEdit) return;
      saveNodeEditInternal(capturedNode, capturedNodeId, draft, false);
    }, 500);
  };

  const executeFormattingCommand = (format: NodeFormat) => {
    if (format === "bold") {
      document.execCommand("bold");
    } else if (format === "italic") {
      document.execCommand("italic");
    } else if (format === "underline") {
      document.execCommand("underline");
    } else if (format === "quote") {
      wrapCurrentSelection(
        `<blockquote class=\"${blockquoteClassName}\">`,
        "</blockquote>",
        "Citação",
      );
    } else if (format === "ordered-list") {
      insertListFromSelection("ordered");
    } else if (format === "dash-list") {
      insertListFromSelection("dash");
    } else if (format === "bullet-list") {
      insertListFromSelection("bullet");
    } else {
      document.execCommand("insertHTML", false, `<hr class=\"${breakClassName}\" />`);
    }
  };

  const applyFormattingToEditable = (
    element: HTMLDivElement | null,
    format: NodeFormat,
    onUpdate: (nextContent: string) => void,
  ) => {
    if (!element) {
      return;
    }

    element.focus();
    executeFormattingCommand(format);
    onUpdate(element.innerHTML);
  };

  const formatEditingNodeContent = (format: NodeFormat) => {
    applyFormattingToEditable(nodeContentEditorRef.current, format, (nextContent) => {
      setNodeEditDraft(nextContent);
      scheduleNodeAutosave({ content: nextContent });
    });
  };

  const formatEditingNoteContent = (note: any, format: NodeFormat) => {
    applyFormattingToEditable(noteEditorRef.current, format, (nextContent) => {
      setNoteEditDraft(nextContent);
      scheduleNoteAutosave(note, nextContent);
    });
  };

  const formatNewNoteContent = (format: NodeFormat) => {
    applyFormattingToEditable(newNoteEditorRef.current, format, (nextContent) => {
      setInlineNoteDraft(nextContent);
    });
  };

  const highlightEditingNodeContent = (color: HighlightColor) => {
    const input = nodeContentEditorRef.current;
    if (!input) return;

    input.focus();
    applyHighlightToSelection(color);
    const nextContent = input.innerHTML;
    setNodeEditDraft(nextContent);
    scheduleNodeAutosave({ content: nextContent });
  };

  const highlightEditingNoteContent = (note: any, color: HighlightColor) => {
    const input = noteEditorRef.current;
    if (!input) return;

    input.focus();
    applyHighlightToSelection(color);
    const nextContent = input.innerHTML;
    setNoteEditDraft(nextContent);
    scheduleNoteAutosave(note, nextContent);
  };

  const highlightNewNoteContent = (color: HighlightColor) => {
    const input = newNoteEditorRef.current;
    if (!input) return;

    input.focus();
    applyHighlightToSelection(color);
    setInlineNoteDraft(input.innerHTML);
  };

  const renderFormattingToolbar = (
    onFormat: (format: NodeFormat) => void,
    onHighlight: (color: HighlightColor) => void,
  ) => (
    <div className="mb-3 flex items-center gap-1.5">
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("bold")}
        title="Negrito"
        aria-label="Negrito"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("italic")}
        title="Italico"
        aria-label="Italico"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("underline")}
        title="Sublinhado"
        aria-label="Sublinhado"
      >
        <Underline className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("quote")}
        title="Citacao"
        aria-label="Citacao"
      >
        <MessageSquareQuote className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("ordered-list")}
        title="Lista numerada"
        aria-label="Lista numerada"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("dash-list")}
        title="Lista com traco"
        aria-label="Lista com traco"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("bullet-list")}
        title="Lista com bolinha"
        aria-label="Lista com bolinha"
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat("break")}
        title="Linha divisoria"
        aria-label="Linha divisoria"
      >
        <span className="flex w-4 items-center justify-center">
          <span className="block h-px w-4 bg-current" />
        </span>
      </button>
      <span className="mx-1 h-5 w-px bg-border/60" aria-hidden="true" />
      {(["yellow", "green", "blue", "pink"] as HighlightColor[]).map((color) => (
        <button
          key={color}
          type="button"
          className="h-7 w-7 rounded-md border border-border/50 bg-transparent inline-flex items-center justify-center hover:bg-secondary/40"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onHighlight(color)}
          title={`Highlight ${color}`}
          aria-label={`Highlight ${color}`}
        >
          <span
            className="h-3.5 w-3.5 rounded-sm border border-black/10"
            style={{ backgroundColor: highlightColorMap[color] }}
          />
        </button>
      ))}
    </div>
  );

  const renderNodeFormattingToolbar = () => renderFormattingToolbar(formatEditingNodeContent, highlightEditingNodeContent);

  useEffect(() => {
    if (editSaveState !== "saved") {
      return;
    }

    if (saveIndicatorTimeoutRef.current) {
      window.clearTimeout(saveIndicatorTimeoutRef.current);
    }

    saveIndicatorTimeoutRef.current = window.setTimeout(() => {
      setEditSaveState("idle");
    }, 1800);

    return () => {
      if (saveIndicatorTimeoutRef.current) {
        window.clearTimeout(saveIndicatorTimeoutRef.current);
      }
    };
  }, [editSaveState]);

  const saveLabel = editSaveState === "saving"
    ? "Salvando..."
    : editSaveState === "saved"
      ? "Salvo"
      : editSaveState === "error"
        ? "Erro ao salvar"
        : "Sem alterações";

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

  const goToReadingNode = (targetNode: any | null) => {
    if (!targetNode) return;
    handleSelectNode(Number(targetNode.id), nodes);
  };

  const activePreviousTarget = isReadingView
    ? (selectedNodeId ? previousReadingNode : previousReference)
    : null;

  const activeNextTarget = isReadingView
    ? (selectedNodeId ? nextReadingNode : nextReference)
    : null;

  const goPreviousReference = () => goToReferenceInReading(previousReference);
  const goNextReference = () => goToReferenceInReading(nextReference);
  const goPreviousReadingNode = () => goToReadingNode(previousReadingNode);
  const goNextReadingNode = () => goToReadingNode(nextReadingNode);

  const handlePreviousNavigation = () => {
    if (!isReadingView) return;
    if (selectedNodeId) {
      goPreviousReadingNode();
      return;
    }
    goPreviousReference();
  };

  const handleNextNavigation = () => {
    if (!isReadingView) return;
    if (selectedNodeId) {
      goNextReadingNode();
      return;
    }
    goNextReference();
  };

  const handleReadingWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isReadingView) return;
    if (readingSwipeLockRef.current) return;

    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    if (absX < 45 || absX <= absY) return;

    if (event.deltaX > 0 && activeNextTarget) {
      event.preventDefault();
      readingSwipeLockRef.current = true;
      handleNextNavigation();
    } else if (event.deltaX < 0 && activePreviousTarget) {
      event.preventDefault();
      readingSwipeLockRef.current = true;
      handlePreviousNavigation();
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
        <style>{`
          .${blockquoteClassName} {
            border-left: 4px solid #111111;
            padding-left: 1rem;
            margin: 0.75rem 0;
            color: inherit;
          }

          .${bulletListClassName} {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin: 0.75rem 0;
          }

          .${dashListClassName} {
            list-style: none;
            padding-left: 0;
            margin: 0.75rem 0;
          }

          .${dashListClassName} li {
            position: relative;
            padding-left: 1.25rem;
            margin: 0.25rem 0;
          }

          .${dashListClassName} li::before {
            content: "-";
            position: absolute;
            left: 0;
            color: #111111;
          }

          ol {
            list-style-type: decimal;
            padding-left: 1.5rem;
            margin: 0.75rem 0;
          }

          .${breakClassName} {
            border: 0;
            border-top: 1px solid rgba(15, 23, 42, 0.18);
            margin: 1rem 0;
          }
        `}</style>
        
        {/* Left Pane: Hierarchy Tree */}
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 bg-sidebar/50 flex flex-col h-[50vh] md:h-full overflow-hidden">
          <div className="shrink-0 border-b border-border/50 bg-card/70 px-3 py-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              onClick={() => setLocation("/references")}
              aria-label="Voltar para referências"
              title="Voltar"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loadingNodes ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : navigatorReferences.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-4 font-serif">Nenhuma estrutura definida ainda.</p>
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
                          {currentChannelName || String(currentReference?.title || fallbackReferenceById?.title || "").trim() || "Referência"}
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
                      const showReferenceNodes = isActiveReference && (expandedReferenceIds[relatedReferenceId] ?? true);

                      return (
                        <div
                          key={relatedReferenceId}
                          className={`rounded-lg border overflow-hidden ${isActiveReference ? "border-primary/30 bg-primary/5" : "border-border/40 bg-background/70"}`}
                        >
                          <div
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedNodeId(null);
                              setExpandedReferenceIds((previous) => ({
                                ...previous,
                                [relatedReferenceId]: true,
                              }));
                              setLocation(`/references/${relatedReferenceId}${isReadingView ? "?view=reading" : ""}`);
                            }}
                          >
                            <button
                              type="button"
                              className="flex h-5 w-5 items-center justify-center text-muted-foreground"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!isActiveReference || relatedRootNodes.length === 0) return;
                                toggleReferenceExpand(relatedReferenceId);
                              }}
                              aria-label={showReferenceNodes ? "Fechar referência" : "Abrir referência"}
                            >
                              {showReferenceNodes && relatedRootNodes.length > 0 ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold ${isActiveReference ? "text-primary" : "text-foreground"}`}>
                                {isActiveReference
                                  ? (String(currentReference?.title || fallbackReferenceById?.title || "").trim() || row.title)
                                  : row.title}
                              </p>
                            </div>
                          </div>

                          {showReferenceNodes && relatedRootNodes.length > 0 && (
                            <div className="px-2 pb-2 pt-1">
                              {relatedRootNodes.map((node) => (
                                <TreeNode
                                  key={node.id}
                                  node={node}
                                  nodes={relatedNodes}
                                  level={1}
                                  selectedNodeId={selectedNodeId}
                                  expandedNodeIds={expandedNodeIds}
                                  onSelect={(nodeId) => handleSelectNode(nodeId, relatedNodes)}
                                  onToggleExpand={handleToggleNodeExpand}
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
          <div className="pointer-events-none absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {editSaveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span className={editSaveState === "error" ? "text-rose-600" : undefined}>{saveLabel}</span>
          </div>
          {isReadingView && (activePreviousTarget || activeNextTarget) && (
            <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
              {activePreviousTarget ? (
                <div className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-border/70 bg-card/95 p-2.5 text-foreground shadow-sm backdrop-blur hover:bg-card"
                    onClick={handlePreviousNavigation}
                    aria-label={selectedNodeId
                      ? `Voltar para ${String((previousReadingNode as any)?.label || "node anterior")}`
                      : `Voltar para ${String((previousReference as any)?.title || "semana anterior")}`}
                    title="Voltar"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                </div>
              ) : null}

              {activeNextTarget ? (
                <div className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-border/70 bg-card/95 p-2.5 text-foreground shadow-sm backdrop-blur hover:bg-card"
                    onClick={handleNextNavigation}
                    aria-label={selectedNodeId
                      ? `Ir para ${String((nextReadingNode as any)?.label || "proximo node")}`
                      : `Ir para ${String((nextReference as any)?.title || "proxima semana")}`}
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
                          className="group py-3 md:py-4 cursor-pointer"
                          style={{ marginLeft: `${level * 10}px` }}
                          onClick={() => {
                            if (isEditingThisReadingNode) return;
                            handleSelectNode(Number(node.id), nodes);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100">{type || "NODE"}</p>
                              {isEditingThisReadingNode ? (
                                <h2
                                  contentEditable
                                  suppressContentEditableWarning
                                  className={`text-xl md:text-2xl font-display font-semibold text-foreground/95 mt-1 ${nodeEditorFocusClass}`}
                                  onClick={(event) => event.stopPropagation()}
                                  onInput={(e) => {
                                    const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                                    setNodeLabelDraft(draft);
                                    scheduleNodeAutosave({ label: draft });
                                  }}
                                  onBlur={() => handleNodeBlurSave("label")}
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
                                    startEditingNode(node, "label", { x: event.clientX, y: event.clientY });
                                  }}
                                >
                                  {label || "Sem título"}
                                </h2>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {hasNotes && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-border/40 px-1.5 py-1 text-[10px] text-muted-foreground opacity-70 group-hover:opacity-100 transition-opacity">
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
                              <ChevronRight className="w-4 h-4 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          {isEditingThisReadingNode ? (
                            <>
                              {renderNodeFormattingToolbar()}
                              <div
                                contentEditable
                                suppressContentEditableWarning
                                className={`prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 max-w-none font-serif text-xl leading-loose text-foreground whitespace-pre-wrap ${nodeEditorFocusClass}`}
                                onClick={(event) => event.stopPropagation()}
                                onPaste={(event) => {
                                  event.preventDefault();
                                  const plainText = event.clipboardData.getData("text/plain");
                                  document.execCommand("insertText", false, plainText);
                                  const activeInput = nodeContentEditorRef.current;
                                  if (activeInput) {
                                    const draft = activeInput.innerHTML;
                                    setNodeEditDraft(draft);
                                    scheduleNodeAutosave({ content: draft });
                                  }
                                }}
                                onInput={(e) => {
                                  const draft = e.currentTarget.innerHTML;
                                  setNodeEditDraft(draft);
                                  scheduleNodeAutosave({ content: draft });
                                }}
                                onBlur={() => handleNodeBlurSave("content")}
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
                            </>
                          ) : content ? (
                            <div
                              className={`prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 max-w-none font-serif text-xl leading-loose text-foreground ${canEditNode ? "cursor-text" : ""}`}
                              onClick={(event) => {
                                if (!canEditNode) return;
                                event.stopPropagation();
                                startEditingNode(node, "content", { x: event.clientX, y: event.clientY });
                              }}
                              dangerouslySetInnerHTML={{ __html: renderFormattedContent(content) }}
                            />
                          ) : (
                            <p
                              className={`text-muted-foreground italic font-serif ${canEditNode ? "cursor-text" : ""}`}
                              onClick={(event) => {
                                if (!canEditNode) return;
                                event.stopPropagation();
                                startEditingNode(node);
                              }}
                            >
                              Sem conteúdo textual.
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
                        className={`text-3xl font-display font-bold ${nodeEditorFocusClass}`}
                        onInput={(e) => {
                          const draft = (e.currentTarget.textContent ?? "").replace(/\u00a0/g, " ");
                          setNodeLabelDraft(draft);
                          scheduleNodeAutosave({ label: draft });
                        }}
                        onBlur={() => handleNodeBlurSave("label")}
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
                        onClick={(event) => startEditingNode(undefined, "label", { x: event.clientX, y: event.clientY })}
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
                      {renderNodeFormattingToolbar()}
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className={`prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 max-w-none ${nodeEditorFocusClass}`}
                        onPaste={(event) => {
                          event.preventDefault();
                          const plainText = event.clipboardData.getData("text/plain");
                          document.execCommand("insertText", false, plainText);
                          const activeInput = nodeContentEditorRef.current;
                          if (activeInput) {
                            const draft = activeInput.innerHTML;
                            setNodeEditDraft(draft);
                            scheduleNodeAutosave({ content: draft });
                          }
                        }}
                        onInput={(e) => {
                          const draft = e.currentTarget.innerHTML;
                          setNodeEditDraft(draft);
                          scheduleNodeAutosave({ content: draft });
                        }}
                        onBlur={() => handleNodeBlurSave("content")}
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
                    <div className="prose prose-stone dark:prose-invert max-w-none font-serif text-lg leading-loose text-foreground/90">
                      <div
                        className={canEditNode ? "cursor-text" : ""}
                        onClick={(event) => startEditingNode(undefined, "content", { x: event.clientX, y: event.clientY })}
                        role={canEditNode ? "button" : undefined}
                        tabIndex={canEditNode ? 0 : -1}
                        onKeyDown={(e) => {
                          if (canEditNode && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            startEditingNode(undefined, "content");
                          }
                        }}
                        dangerouslySetInnerHTML={{ __html: renderFormattedContent(String(selectedNode.content || "")) }}
                      />
                    </div>
                  ) : (
                    <p
                      className={`text-muted-foreground italic font-serif ${canEditNode ? "cursor-text" : ""}`}
                      onClick={(event) => startEditingNode(undefined, "content", { x: event.clientX, y: event.clientY })}
                    >
                      Nenhum conteúdo de texto disponível para esta seção.
                    </p>
                  )}
                </div>
              </div>

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

                    {isCreatingNoteCard && (
                      <div
                        className={`rounded-2xl border bg-card p-8 shadow-sm transition-colors mb-4 ${selectedNoteCardId === -1 ? "border-primary/40" : "border-border"}`}
                        onClick={() => setSelectedNoteCardId(-1)}
                      >
                        {renderFormattingToolbar(formatNewNoteContent, highlightNewNoteContent)}
                        <div className="flex items-start justify-between gap-3">
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 w-full max-w-none font-serif text-xl leading-loose text-foreground outline-none"
                            onPaste={(event) => {
                              event.preventDefault();
                              const plainText = event.clipboardData.getData("text/plain");
                              document.execCommand("insertText", false, plainText);
                              const activeInput = newNoteEditorRef.current;
                              if (activeInput) {
                                setInlineNoteDraft(activeInput.innerHTML);
                              }
                            }}
                            onInput={(e) => setInlineNoteDraft(e.currentTarget.innerHTML)}
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

                    {loadingNotes ? (
                      <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : notes?.length === 0 ? null : (
                      <div className="space-y-4">
                        {notes?.map(note => (
                          (() => {
                            const noteId = Number((note as any).id ?? 0);
                            const isSelected = selectedNoteCardId === noteId;
                            const isEditingThisNote = editingNoteId === noteId;
                            const authorName = getNoteAuthorName(note);
                            const authorId = getNoteAuthorId(note);
                            const authorAvatar = getNoteAuthorAvatar(note);
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
                                  <>
                                    {renderFormattingToolbar(
                                      (format) => formatEditingNoteContent(note, format),
                                      (color) => highlightEditingNoteContent(note, color),
                                    )}
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      className="prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 max-w-none font-serif text-xl leading-loose text-foreground outline-none"
                                      onPaste={(event) => {
                                        event.preventDefault();
                                        const plainText = event.clipboardData.getData("text/plain");
                                        document.execCommand("insertText", false, plainText);
                                        const activeInput = noteEditorRef.current;
                                        if (activeInput) {
                                          const draft = activeInput.innerHTML;
                                          setNoteEditDraft(draft);
                                          scheduleNoteAutosave(note, draft);
                                        }
                                      }}
                                      onInput={(e) => {
                                        const draft = e.currentTarget.innerHTML;
                                        setNoteEditDraft(draft);
                                        scheduleNoteAutosave(note, draft);
                                      }}
                                      onBlur={() => handleNoteBlurSave(note)}
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
                                  </>
                                ) : (
                                  <div
                                    className={`prose prose-stone dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-blockquote:my-2 max-w-none font-serif text-xl leading-loose text-foreground ${canEditNote(note) ? "cursor-text" : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingNote(note);
                                    }}
                                    dangerouslySetInnerHTML={{ __html: renderFormattedContent(String(note.content || "")) }}
                                  />
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
                              <UserAvatar name={authorName} src={authorAvatar} size="sm" className="h-6 w-6 text-[10px]" />
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
            </>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
