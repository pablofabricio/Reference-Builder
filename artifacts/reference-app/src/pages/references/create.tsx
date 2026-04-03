import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CreateReferenceBodyType,
  CreateReferenceNodeBodyType,
  useAddChannelReference,
  useCreateReferenceNode,
  useListChannels,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Bold, ChevronDown, ChevronRight, Italic, List, Loader2, MessageSquareQuote, Plus, Trash2, Underline } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DraftBlock = {
  id: string;
  parentId: string | null;
  type: keyof typeof CreateReferenceNodeBodyType;
  label: string;
  content: string;
  position: number;
};

type NodeFormat = "bold" | "italic" | "underline" | "quote" | "list";

const createId = () =>
  `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyBlock = (parentId: string | null, position: number): DraftBlock => ({
  id: createId(),
  parentId,
  type: "PARAGRAPH",
  label: "",
  content: "",
  position,
});

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

const stripFormatting = (raw: string) =>
  /<\/?[a-z][\s\S]*>/i.test(raw)
    ? raw
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
    : raw
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/<u>([\s\S]*?)<\/u>/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .trim();

const getNodePosition = (node: any) => Number(node?.position ?? 0);

type TreeNodeProps = {
  node: DraftBlock;
  blocks: DraftBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedById: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  level?: number;
};

function TreeNode({ node, blocks, selectedId, onSelect, expandedById, onToggleExpand, level = 0 }: TreeNodeProps) {
  const expanded = expandedById[node.id] ?? level < 1;
  const children = blocks
    .filter((candidate) => candidate.parentId === node.id)
    .sort((left, right) => left.position - right.position);
  const hasChildren = children.length > 0;
  const nodeLabel = node.label.trim();
  const nodeContent = stripFormatting(node.content);
  const previewContent = nodeContent ? `${nodeContent.slice(0, 26)}...` : "...";
  const treeTitle = nodeLabel || previewContent;

  return (
    <div className="w-full">
      <div
        className={`flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${selectedId === node.id ? "bg-primary/10 text-primary" : "hover:bg-secondary/50 text-foreground"}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center mr-1 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            if (!hasChildren) return;
            onToggleExpand(node.id);
          }}
          aria-label={expanded ? "Fechar seção" : "Abrir seção"}
        >
          {hasChildren ? (expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4 h-4" />}
        </button>
        <span className="text-sm font-medium truncate">{treeTitle}</span>
      </div>

      {expanded && children.length > 0 ? (
        <div className="space-y-0.5">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              blocks={blocks}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedById={expandedById}
              onToggleExpand={onToggleExpand}
              level={level + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ReferenceCreate() {
  const { toast } = useToast();

  const createReferenceNodeMutation = useCreateReferenceNode();
  const addChannelReferenceMutation = useAddChannelReference();

  const { data: channels } = useListChannels();

  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceDescription, setReferenceDescription] = useState("");
  const [referenceType, setReferenceType] = useState<CreateReferenceBodyType>(CreateReferenceBodyType.BOOK);
  const [linkedChannelId, setLinkedChannelId] = useState<string>("");
  const [persistedReferenceId, setPersistedReferenceId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showTitleRequiredModal, setShowTitleRequiredModal] = useState(false);
  const [titleRequiredModalDismissed, setTitleRequiredModalDismissed] = useState(false);
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<DraftBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const nodeIdMapRef = useRef<Map<string, number>>(new Map());
  const contentInputRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastSavedSignatureRef = useRef("");
  const autosaveTimerRef = useRef<number | null>(null);
  const saveAllRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const saveInFlightRef = useRef(false);

  const rootBlocks = useMemo(
    () => blocks.filter((block) => block.parentId == null).sort((left, right) => left.position - right.position),
    [blocks],
  );

  const flattenedBlocks = useMemo(() => {
    const result: Array<{ block: DraftBlock; level: number }> = [];

    const visit = (current: DraftBlock, level: number) => {
      result.push({ block: current, level });
      const children = blocks
        .filter((candidate) => candidate.parentId === current.id)
        .sort((left, right) => left.position - right.position);
      children.forEach((child) => visit(child, level + 1));
    };

    rootBlocks.forEach((root) => visit(root, 0));

    return result;
  }, [blocks, rootBlocks]);

  const hasDraftWithoutTitle = useMemo(() => {
    if (referenceTitle.trim()) {
      return false;
    }

    if (referenceDescription.trim()) {
      return true;
    }

    return blocks.some((block) => block.label.trim() || block.content.trim());
  }, [blocks, referenceDescription, referenceTitle]);

  useEffect(() => {
    if (hasDraftWithoutTitle && !titleRequiredModalDismissed) {
      setShowTitleRequiredModal(true);
      return;
    }

    setShowTitleRequiredModal(false);
  }, [hasDraftWithoutTitle, titleRequiredModalDismissed]);

  useEffect(() => {
    if (!hasDraftWithoutTitle) {
      setTitleRequiredModalDismissed(false);
    }
  }, [hasDraftWithoutTitle]);

  const addChild = (targetId: string) => {
    const blockById = new Map(blocks.map((block) => [block.id, block]));
    const lineageIds: string[] = [];
    let currentId: string | null = targetId;

    while (currentId) {
      lineageIds.push(currentId);
      const current = blockById.get(currentId);
      currentId = current?.parentId ?? null;
    }

    const children = blocks
      .filter((block) => block.parentId === targetId)
      .sort((left, right) => left.position - right.position);

    const nextPosition = children.length > 0 ? children[children.length - 1].position + 1 : 1;
    const next = createEmptyBlock(targetId, nextPosition);

    setBlocks((previous) => [...previous, next]);
    setExpandedById((previous) => {
      const nextState = { ...previous };
      lineageIds.forEach((id) => {
        nextState[id] = true;
      });
      return nextState;
    });
    setCollapsedById((previous) => ({
      ...previous,
      [next.id]: false,
    }));
    setSelectedId(next.id);
  };

  const toggleTreeExpand = (id: string) => {
    setExpandedById((previous) => ({
      ...previous,
      [id]: !(previous[id] ?? true),
    }));
  };

  const toggleNodeCollapse = (id: string) => {
    setCollapsedById((previous) => ({
      ...previous,
      [id]: !previous[id],
    }));
  };

  const removeBlock = (targetId: string) => {
    const idsToRemove = new Set<string>();

    const collect = (id: string) => {
      idsToRemove.add(id);
      blocks
        .filter((block) => block.parentId === id)
        .forEach((child) => collect(child.id));
    };

    collect(targetId);

    const remaining = blocks.filter((block) => !idsToRemove.has(block.id));
    if (remaining.length === 0) {
      setBlocks([]);
      setSelectedId(null);
      return;
    }

    setBlocks(remaining);
    if (selectedId && idsToRemove.has(selectedId)) {
      setSelectedId(remaining[0].id);
    }
  };

  const updateBlock = (id: string, updates: Partial<DraftBlock>) => {
    setBlocks((previous) =>
      previous.map((block) => (block.id === id ? { ...block, ...updates } : block)),
    );
  };

  const setContentInputRef = (id: string, element: HTMLDivElement | null, rawContent?: string) => {
    contentInputRefs.current[id] = element;

    if (element) {
      const formattedContent = renderFormattedContent(rawContent || "");
      if (element.innerHTML !== formattedContent) {
        element.innerHTML = formattedContent;
      }
    }
  };

  const formatNodeContent = (id: string, format: NodeFormat) => {
    const input = contentInputRefs.current[id];

    if (!input) {
      return;
    }

    setSelectedId(id);
    input.focus();

    if (format === "bold") {
      document.execCommand("bold");
    } else if (format === "italic") {
      document.execCommand("italic");
    } else if (format === "underline") {
      document.execCommand("underline");
    } else if (format === "quote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else {
      document.execCommand("insertUnorderedList");
    }

    updateBlock(id, { content: input.innerHTML });
  };

  const normalizeSiblingPositions = (draftBlocks: DraftBlock[]) => {
    const byParent = new Map<string | null, DraftBlock[]>();

    draftBlocks.forEach((block) => {
      const list = byParent.get(block.parentId) || [];
      list.push(block);
      byParent.set(block.parentId, list);
    });

    return draftBlocks.map((block) => {
      const siblings = (byParent.get(block.parentId) || [])
        .slice()
        .sort((left, right) => left.position - right.position);
      const normalizedPosition = siblings.findIndex((sibling) => sibling.id === block.id) + 1;
      return {
        ...block,
        position: normalizedPosition > 0 ? normalizedPosition : 1,
      };
    });
  };

  const buildDraftSignature = useCallback(() => {
    const cleaned = normalizeSiblingPositions(
      blocks.map((block) => ({
        ...block,
        label: block.label.trim(),
        content: block.content.trim(),
      })),
    );

    const nodesToPersist = cleaned.filter((block) => Boolean(block.label || block.content));

    return JSON.stringify({
      referenceTitle: referenceTitle.trim(),
      referenceDescription: referenceDescription.trim(),
      referenceType,
      linkedChannelId,
      blocks: nodesToPersist.map((block) => ({
        id: block.id,
        parentId: block.parentId,
        type: block.type,
        label: block.label,
        content: block.content,
        position: block.position,
      })),
    });
  }, [blocks, linkedChannelId, normalizeSiblingPositions, referenceDescription, referenceTitle, referenceType]);

  const saveAll = useCallback(async (force = false) => {
    if (saveInFlightRef.current) {
      return;
    }

    const normalizedTitle = referenceTitle.trim();
    if (!normalizedTitle) {
      return;
    }

    const normalizedType = Object.values(CreateReferenceBodyType).includes(referenceType as CreateReferenceBodyType)
      ? referenceType
      : CreateReferenceBodyType.BOOK;

    const referencePayload = {
      type: normalizedType,
      title: normalizedTitle,
      description: referenceDescription.trim() || undefined,
    };

    const cleaned = normalizeSiblingPositions(
      blocks.map((block) => ({
        ...block,
        label: block.label.trim(),
        content: block.content.trim(),
      })),
    );

    // Persist only nodes that were actually edited.
    const nodesToPersist = cleaned.filter((block) => Boolean(block.label || block.content));

    const signature = buildDraftSignature();

    if (!force && signature === lastSavedSignatureRef.current) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveState("saving");

    try {
      let referenceId = persistedReferenceId;

      if (!referenceId) {
        const createResponse = await fetch("/api/references", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(referencePayload),
        });

        const createPayload = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
          const createError: any = new Error("Falha ao criar referência");
          createError.data = createPayload;
          throw createError;
        }

        referenceId = Number((createPayload as any)?.id ?? (createPayload as any)?.data?.id ?? 0);
        if (!referenceId) {
          throw new Error("Não foi possível criar referência");
        }

        setPersistedReferenceId(referenceId);

        const selectedChannel = Number(linkedChannelId || 0);
        if (selectedChannel > 0) {
          await addChannelReferenceMutation.mutateAsync({
            id: selectedChannel,
            data: { referenceId },
          });
        }
      } else {
        const updateResponse = await fetch(`/api/references/${referenceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(referencePayload),
        });

        const updatePayload = await updateResponse.json().catch(() => null);
        if (!updateResponse.ok) {
          const updateError: any = new Error("Falha ao atualizar referência");
          updateError.data = updatePayload;
          throw updateError;
        }

        const existingLocalIds = new Set(nodesToPersist.map((block) => block.id));
        const mappedEntries = Array.from(nodeIdMapRef.current.entries());
        const removedEntries = mappedEntries.filter(([localId]) => !existingLocalIds.has(localId)).reverse();
        if (removedEntries.length > 0) {
          const token = localStorage.getItem("auth_token");
          const headers: Record<string, string> = {};
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }

          for (const [localId, serverNodeId] of removedEntries) {
            const response = await fetch(`/api/reference-nodes/${serverNodeId}`, {
              method: "DELETE",
              headers,
            });

            if (response.ok) {
              nodeIdMapRef.current.delete(localId);
            }
          }
        }
      }

      const persistChildren = async (parentLocalId: string | null) => {
        const children = nodesToPersist
          .filter((block) => block.parentId === parentLocalId)
          .sort((left, right) => left.position - right.position);

        for (const child of children) {
          let persistedNodeId = nodeIdMapRef.current.get(child.id) || null;
          const persistedParentNodeId = child.parentId
            ? nodeIdMapRef.current.get(child.parentId) || null
            : null;

          const normalizedNodeType = Object.values(CreateReferenceNodeBodyType).includes(
            child.type as CreateReferenceNodeBodyType,
          )
            ? child.type
            : CreateReferenceNodeBodyType.PARAGRAPH;
          const normalizedLabel: string = child.label ?? "";
          const normalizedContent: string = child.content ?? "";

          // Never call node endpoints with invalid payloads.
          if (!normalizedLabel.trim() && !normalizedContent.trim()) {
            continue;
          }

          if (!persistedNodeId) {
            const createdNode = await createReferenceNodeMutation.mutateAsync({
              referenceId,
              data: {
                type: normalizedNodeType,
                label: normalizedLabel,
                content: normalizedContent,
                parentNodeId: persistedParentNodeId,
                position: child.position,
              },
            });

            const createdNodeId = Number((createdNode as any)?.id ?? (createdNode as any)?.data?.id ?? 0);
            persistedNodeId = createdNodeId > 0 ? createdNodeId : null;
            if (persistedNodeId) {
              nodeIdMapRef.current.set(child.id, persistedNodeId);
            }
          } else {
            const token = localStorage.getItem("auth_token");
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };

            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(`/api/reference-nodes/${persistedNodeId}`, {
              method: "PUT",
              headers,
              body: JSON.stringify({
                reference_id: referenceId,
                type: normalizedNodeType,
                label: normalizedLabel,
                content: normalizedContent,
                parent_node_id: persistedParentNodeId,
                position: child.position,
              }),
            });

            if (!response.ok) {
              throw new Error("Falha ao atualizar nó");
            }
          }

          await persistChildren(child.id);
        }
      };

      await persistChildren(null);
      lastSavedSignatureRef.current = signature;
      setSaveState("saved");
    } catch (error: any) {
      const apiErrors = (error as any)?.data?.errors;
      const firstApiError = apiErrors && typeof apiErrors === "object"
        ? Object.values(apiErrors).flat().find((item) => typeof item === "string")
        : null;

      setSaveState("error");

      toast({
        title: "Erro ao salvar referência",
        description: String(firstApiError || error?.message || "Erro inesperado"),
        variant: "destructive",
      });
    } finally {
      saveInFlightRef.current = false;
    }
  }, [
    addChannelReferenceMutation,
    blocks,
    createReferenceNodeMutation,
    linkedChannelId,
    buildDraftSignature,
    normalizeSiblingPositions,
    persistedReferenceId,
    referenceDescription,
    referenceTitle,
    referenceType,
    toast,
  ]);

  useEffect(() => {
    saveAllRef.current = saveAll;
  }, [saveAll]);

  useEffect(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    if (!referenceTitle.trim() || !referenceType) {
      if (saveState !== "error") {
        setSaveState("idle");
      }
      return;
    }

    const currentSignature = buildDraftSignature();
    if (currentSignature === lastSavedSignatureRef.current) {
      if (saveState === "saving") {
        setSaveState("saved");
      }
      return;
    }

    if (saveState === "saved") {
      setSaveState("idle");
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveAll(false);
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [buildDraftSignature, referenceTitle, referenceType, saveAll, saveState]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void saveAllRef.current(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void saveAllRef.current(true);
    };
  }, []);

  const saving =
    createReferenceNodeMutation.isPending ||
    addChannelReferenceMutation.isPending;

  const saveLabel = saving || saveState === "saving"
    ? "Salvando..."
    : hasDraftWithoutTitle
      ? "Não será salvo sem título"
    : saveState === "saved"
      ? "Salvo"
      : saveState === "error"
        ? "Erro ao salvar"
        : "Sem alterações";

  return (
    <AppLayout>
      <AlertDialog open={showTitleRequiredModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Título obrigatório para salvar</AlertDialogTitle>
            <AlertDialogDescription>
              Você começou a editar, mas sem título a referência não será salva automaticamente.
              Preencha o título para ativar o autosave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setShowTitleRequiredModal(false);
                setTitleRequiredModalDismissed(true);
              }}
            >
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDeleteNodeId)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteNodeId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove o conteúdo selecionado e todos os nós e camadas dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteNodeId) {
                  removeBlock(pendingDeleteNodeId);
                }
                setPendingDeleteNodeId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col md:flex-row h-full md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh)]">
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 bg-sidebar/50 flex flex-col h-[40vh] md:h-full overflow-hidden">
          <div className="shrink-0 border-b border-border/50 bg-card/70 px-4 py-3" />

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {rootBlocks.length === 0 ? (
              <div className="h-full" />
            ) : (
              <div className="space-y-1.5">
                {rootBlocks.map((block) => (
                  <TreeNode
                    key={block.id}
                    node={block}
                    blocks={blocks}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    expandedById={expandedById}
                    onToggleExpand={toggleTreeExpand}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-background space-y-6">
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            {saving || saveState === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span className={hasDraftWithoutTitle ? "text-amber-600" : undefined}>{saveLabel}</span>
          </div>

          <div className="px-1 py-2 space-y-5">
            <div className="space-y-2">
              <div>
                <select
                  className="h-8 w-[130px] border-0 bg-transparent p-0 pr-4 text-xs uppercase tracking-wider text-muted-foreground outline-none"
                  value={referenceType}
                  onChange={(event) => setReferenceType(event.target.value as CreateReferenceBodyType)}
                >
                  {Object.values(CreateReferenceBodyType).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <input
                className="w-full border-0 bg-transparent p-0 text-4xl md:text-5xl font-display font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/30"
                value={referenceTitle}
                onChange={(event) => setReferenceTitle(event.target.value)}
                placeholder="título"
              />
            </div>

            <textarea
              className="w-full min-h-14 resize-none border-0 bg-transparent p-0 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/30"
              value={referenceDescription}
              onChange={(event) => setReferenceDescription(event.target.value)}
              placeholder="descrição"
            />

            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                    linkedChannelId === ""
                      ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-sm font-semibold"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary/60"
                  }`}
                  onClick={() => setLinkedChannelId("")}
                >
                  Sem vínculo
                </button>
                {(channels ?? []).map((channel: any) => {
                  const active = linkedChannelId === String(channel.id);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-sm font-semibold"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary/60"
                      }`}
                      onClick={() => setLinkedChannelId(String(channel.id))}
                    >
                      {channel.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            className="space-y-3 min-h-[65vh]"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedId(null);
              }
            }}
          >
            {flattenedBlocks.map(({ block, level }) => {
              const selected = selectedId === block.id;
              const collapsed = Boolean(collapsedById[block.id]);
              const trimmedLabel = block.label.trim();
              const trimmedContent = stripFormatting(block.content);
              const collapsedPreview = trimmedLabel
                ? trimmedLabel
                : trimmedContent
                  ? `${trimmedContent.slice(0, 120)}...`
                  : "...";
              return (
                <div
                  key={block.id}
                  className={`group rounded-xl border transition-colors ${selected ? "border-primary/30 bg-primary/5" : "border-transparent bg-transparent hover:border-border/40"}`}
                  style={{ marginLeft: `${level * 22}px` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(block.id);
                  }}
                >
                  <div className="p-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="mt-1 h-6 w-6 shrink-0 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (collapsed) {
                            setSelectedId(block.id);
                          }
                          toggleNodeCollapse(block.id);
                        }}
                        title={collapsed ? "Expandir nó" : "Colapsar nó"}
                        aria-label={collapsed ? "Expandir nó" : "Colapsar nó"}
                      >
                        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      <div className={`flex-1 min-w-0 space-y-2 rounded-lg border border-transparent px-1 py-1 transition-colors ${selected ? "border-primary/20" : "hover:border-border/60"}`}>
                      {collapsed ? (
                        <div className="min-h-9 w-full px-0 py-1 text-base leading-7 text-foreground/90 break-words">
                          {collapsedPreview}
                        </div>
                      ) : selected ? (
                        <>
                          <input
                            value={block.label}
                            onChange={(event) => {
                              updateBlock(block.id, { label: event.target.value });
                            }}
                            placeholder="título (opcional)"
                            className="min-h-9 w-full border-0 bg-transparent px-0 py-1 text-xl font-display font-semibold text-foreground outline-none placeholder:text-muted-foreground/30"
                          />

                          <div
                            ref={(element) => setContentInputRef(block.id, element, block.content)}
                            contentEditable
                            suppressContentEditableWarning
                            onPaste={(event) => {
                              event.preventDefault();
                              const plainText = event.clipboardData.getData("text/plain");
                              document.execCommand("insertText", false, plainText);
                              const activeInput = contentInputRefs.current[block.id];
                              if (activeInput) {
                                updateBlock(block.id, { content: activeInput.innerHTML });
                              }
                            }}
                            onInput={(event) => {
                              updateBlock(block.id, { content: event.currentTarget.innerHTML });
                            }}
                            className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-blockquote:my-1 min-h-24 w-full border-0 bg-transparent px-0 py-1 text-base leading-7 text-foreground/95 outline-none"
                          />
                        </>
                      ) : (
                        <>
                          <div className="min-h-9 w-full px-0 py-1 text-xl font-display font-semibold text-foreground">
                            {block.label.trim() || "..."}
                          </div>
                          <div
                            className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-blockquote:my-1 min-h-24 w-full px-0 py-1 text-base leading-7 text-foreground/95 break-words"
                            dangerouslySetInnerHTML={{ __html: renderFormattedContent(block.content || "...") }}
                          />
                        </>
                      )}

                      {selected && !collapsed ? (
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-2">
                          <div className="flex items-center gap-2">
                            <select
                              className="h-8 bg-transparent border border-border/50 rounded-md px-2 text-[11px] uppercase tracking-wider text-muted-foreground outline-none"
                              value={block.type}
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  type: event.target.value as keyof typeof CreateReferenceNodeBodyType,
                                })
                              }
                            >
                              {Object.keys(CreateReferenceNodeBodyType).map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="h-8 rounded-md border border-border/50 bg-transparent px-3 text-[11px] text-muted-foreground hover:bg-secondary/40"
                              onClick={() => addChild(block.id)}
                              title="Adicionar nó"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" />
                                Adicionar nó
                              </span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => formatNodeContent(block.id, "bold")}
                              title="Negrito"
                              aria-label="Negrito"
                            >
                              <Bold className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => formatNodeContent(block.id, "italic")}
                              title="Itálico"
                              aria-label="Itálico"
                            >
                              <Italic className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => formatNodeContent(block.id, "underline")}
                              title="Sublinhado"
                              aria-label="Sublinhado"
                            >
                              <Underline className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => formatNodeContent(block.id, "quote")}
                              title="Citação"
                              aria-label="Citação"
                            >
                              <MessageSquareQuote className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-7 w-7 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-secondary/40 inline-flex items-center justify-center"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => formatNodeContent(block.id, "list")}
                              title="Lista"
                              aria-label="Lista"
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-md border border-transparent bg-transparent text-rose-600 hover:border-rose-200/80 hover:bg-rose-50 inline-flex items-center justify-center"
                              onClick={() => setPendingDeleteNodeId(block.id)}
                              title="Remover bloco"
                              aria-label="Remover bloco"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl"
                onClick={() => {
                  const siblings = blocks.filter((block) => block.parentId == null);
                  const nextPosition = siblings.length > 0 ? Math.max(...siblings.map((block) => block.position)) + 1 : 1;
                  const next = createEmptyBlock(null, nextPosition);
                  setBlocks((previous) => [...previous, next]);
                  setCollapsedById((previous) => ({
                    ...previous,
                    [next.id]: false,
                  }));
                  setSelectedId(next.id);
                }}
                aria-label="Criar nó"
                title="Criar nó"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
