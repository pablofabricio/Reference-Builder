import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useListChannels, useListReferences, type ReferenceNode } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AlignLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import ReferenceDetail from "@/pages/references/detail";

const getNodeParentId = (node: ReferenceNode | any) => node.parentNodeId ?? node.parent_node_id ?? null;
const getNodePosition = (node: ReferenceNode | any) => Number(node.position ?? 0);

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
      .sort((a, b) => getNodePosition(a) - getNodePosition(b));

    if (children.length > 0) {
      output.push(...flattenNodesForReading(nodes, children, level + 1));
    }
  });

  return output;
};

const getReferenceSortOrder = (reference: any) => {
  const title = String(reference?.title || "");
  const weekMatch = title.match(/Semana\s*(\d+)/i);
  if (weekMatch) return Number(weekMatch[1]);
  return 999;
};

export default function ReferencesList() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: references, isLoading: loadingReferences } = useListReferences();
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const [allNodes, setAllNodes] = useState<ReferenceNode[]>([]);
  const [loadingAllNodes, setLoadingAllNodes] = useState(true);
  const [channelReferenceLinks, setChannelReferenceLinks] = useState<any[]>([]);
  const [loadingChannelReferenceLinks, setLoadingChannelReferenceLinks] = useState(true);
  const [expandedChannelIds, setExpandedChannelIds] = useState<number[]>([]);
  const [expandedReferenceIds, setExpandedReferenceIds] = useState<number[]>([]);

  const selectedReferenceId = useMemo(() => {
    const raw = new URLSearchParams(search).get("ref");
    const parsed = Number(raw ?? 0);
    return parsed > 0 ? parsed : null;
  }, [search]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoadingChannelReferenceLinks(true);
      setLoadingAllNodes(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const [channelRefsResponse, nodesResponse] = await Promise.all([
          fetch("/api/channel-references", { headers }),
          fetch("/api/reference-nodes", { headers }),
        ]);

        if (!channelRefsResponse.ok) throw new Error("Failed to load channel references");
        if (!nodesResponse.ok) throw new Error("Failed to load nodes");

        const channelRefsPayload = await channelRefsResponse.json();
        const nodesPayload = await nodesResponse.json();

        const channelRows = Array.isArray(channelRefsPayload?.data)
          ? channelRefsPayload.data
          : Array.isArray(channelRefsPayload)
            ? channelRefsPayload
            : [];

        const nodeRows = Array.isArray(nodesPayload?.data)
          ? nodesPayload.data
          : Array.isArray(nodesPayload)
            ? nodesPayload
            : [];

        if (isMounted) {
          setChannelReferenceLinks(channelRows);
          setAllNodes(nodeRows as ReferenceNode[]);
        }
      } catch {
        if (isMounted) {
          setChannelReferenceLinks([]);
          setAllNodes([]);
        }
      } finally {
        if (isMounted) {
          setLoadingChannelReferenceLinks(false);
          setLoadingAllNodes(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const referencesById = useMemo(() => {
    const map = new Map<number, any>();
    (references ?? []).forEach((reference: any) => {
      const id = Number(reference?.id ?? 0);
      if (id > 0) map.set(id, reference);
    });
    return map;
  }, [references]);

  const channelRows = useMemo(() => {
    const rows = (channels ?? []).map((channel: any) => {
      const channelId = Number(channel?.id ?? 0);
      const referenceIds = (channelReferenceLinks ?? [])
        .filter((link: any) => Number(link?.channel_id ?? link?.channelId ?? 0) === channelId)
        .map((link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0))
        .filter((value: number) => value > 0);

      const mappedReferences = referenceIds
        .map((referenceId: number) => referencesById.get(referenceId))
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const orderDiff = getReferenceSortOrder(a) - getReferenceSortOrder(b);
          if (orderDiff !== 0) return orderDiff;
          return String(a?.title || "").localeCompare(String(b?.title || ""));
        });

      return {
        id: channelId,
        name: String(channel?.name || `Canal ${channelId}`),
        references: mappedReferences,
      };
    });

    return rows.sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [channels, channelReferenceLinks, referencesById]);

  const referencesWithoutChannel = useMemo(() => {
    const linkedIds = new Set(
      (channelReferenceLinks ?? [])
        .map((link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0))
        .filter((value: number) => value > 0),
    );

    return (references ?? [])
      .filter((reference: any) => !linkedIds.has(Number(reference?.id ?? 0)))
      .sort((a: any, b: any) => {
        const orderDiff = getReferenceSortOrder(a) - getReferenceSortOrder(b);
        if (orderDiff !== 0) return orderDiff;
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });
  }, [references, channelReferenceLinks]);

  const selectedReference = useMemo(
    () => (references ?? []).find((reference: any) => Number(reference?.id ?? 0) === Number(selectedReferenceId ?? 0)) ?? null,
    [references, selectedReferenceId],
  );

  const selectedChannelId = useMemo(() => {
    if (!selectedReferenceId) return null;
    const link = (channelReferenceLinks ?? []).find(
      (row: any) => Number(row?.reference_id ?? row?.referenceId ?? 0) === Number(selectedReferenceId),
    );
    const channelId = Number(link?.channel_id ?? link?.channelId ?? 0);
    return channelId > 0 ? channelId : null;
  }, [channelReferenceLinks, selectedReferenceId]);

  const selectedChannel = useMemo(
    () => (channels ?? []).find((channel: any) => Number(channel?.id ?? 0) === Number(selectedChannelId ?? 0)) ?? null,
    [channels, selectedChannelId],
  );

  const selectedNodes = useMemo(
    () => (nodesByReferenceId.get(Number(selectedReferenceId ?? 0)) ?? []).slice().sort((a, b) => getNodePosition(a) - getNodePosition(b)),
    [nodesByReferenceId, selectedReferenceId],
  );

  const selectedRootNodes = useMemo(
    () => getReferenceVisibleRootNodes((selectedReference as any)?.title, selectedNodes),
    [selectedNodes, selectedReference],
  );

  const selectedReadingRows = useMemo(
    () => flattenNodesForReading(selectedNodes, selectedRootNodes),
    [selectedNodes, selectedRootNodes],
  );

  const isLoading = loadingReferences || loadingChannels || loadingChannelReferenceLinks || loadingAllNodes;

  const toggleChannel = (channelId: number) => {
    setExpandedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  };

  const toggleReference = (referenceId: number) => {
    setExpandedReferenceIds((prev) =>
      prev.includes(referenceId) ? prev.filter((id) => id !== referenceId) : [...prev, referenceId],
    );
  };

  const selectReference = (referenceId: number, channelId?: number) => {
    if (channelId && !expandedChannelIds.includes(channelId)) {
      setExpandedChannelIds((prev) => [...prev, channelId]);
    }
    setLocation(`/references?ref=${referenceId}&view=reading`);
  };

  if (selectedReferenceId) {
    return <ReferenceDetail />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-full md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh)]">
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 bg-sidebar/50 flex flex-col h-[50vh] md:h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : channelRows.length === 0 && referencesWithoutChannel.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-4 font-serif">Nenhuma referencia encontrada.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="rounded-xl border border-border/50 bg-card/70 overflow-hidden">
                  <div className="px-2 py-2 space-y-1.5">
                    {channelRows.map((channel) => {
                      const isExpanded = expandedChannelIds.includes(channel.id);
                      return (
                        <div
                          key={channel.id}
                          className="rounded-lg border border-border/40 bg-background/70 overflow-hidden"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
                            onClick={() => toggleChannel(channel.id)}
                          >
                            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </span>
                            <p className="truncate text-sm font-semibold text-foreground">{channel.name}</p>
                          </button>

                          {isExpanded && (
                            <div className="px-2 pb-2 pt-1 space-y-1">
                              {channel.references.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-muted-foreground">Sem referencias vinculadas.</p>
                              ) : (
                                channel.references.map((reference: any) => (
                                  <div
                                    key={reference.id}
                                    className="rounded-lg border border-border/40 bg-card/80 overflow-hidden"
                                  >
                                    <div
                                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${Number(selectedReferenceId ?? 0) === Number(reference.id) ? "bg-primary/10" : "hover:bg-secondary/40"}`}
                                      onClick={() => selectReference(Number(reference.id), channel.id)}
                                    >
                                      <button
                                        type="button"
                                        className="w-5 h-5 flex items-center justify-center text-muted-foreground"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          toggleReference(Number(reference.id));
                                        }}
                                      >
                                        {expandedReferenceIds.includes(Number(reference.id)) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </button>
                                      <span className={`truncate text-sm ${Number(selectedReferenceId ?? 0) === Number(reference.id) ? "text-primary font-medium" : "text-foreground"}`}>{reference.title}</span>
                                    </div>

                                    {expandedReferenceIds.includes(Number(reference.id)) && (
                                      <div className="px-2 pb-2 pt-1 border-t border-border/40">
                                        {(() => {
                                          const referenceNodes = (nodesByReferenceId.get(Number(reference.id)) ?? [])
                                            .slice()
                                            .sort((a, b) => getNodePosition(a) - getNodePosition(b));
                                          const visibleRoots = getReferenceVisibleRootNodes(reference.title, referenceNodes);
                                          const treeRows = flattenNodesForReading(referenceNodes, visibleRoots);

                                          if (treeRows.length === 0) {
                                            return <p className="px-1 py-1 text-xs text-muted-foreground">Sem nodes.</p>;
                                          }

                                          return (
                                            <div className="space-y-0.5">
                                              {treeRows.map(({ node, level }) => (
                                                <div
                                                  key={`tree-${reference.id}-${node.id}`}
                                                  className="truncate rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                                                  style={{ paddingLeft: `${level * 12 + 6}px` }}
                                                >
                                                  {node.label}
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {referencesWithoutChannel.map((reference: any) => (
                      <button
                        key={`standalone-${reference.id}`}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-lg border border-border/40 bg-background/70 px-3 py-2.5 text-left transition-colors ${Number(selectedReferenceId ?? 0) === Number(reference.id) ? "bg-primary/10 text-primary" : "hover:bg-secondary/40"}`}
                        onClick={() => selectReference(Number(reference.id))}
                      >
                        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                          <ChevronRight className="w-4 h-4" />
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground">{reference.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col h-auto md:h-full overflow-hidden bg-background">
          {!selectedReference ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50">
              <AlignLeft className="w-16 h-16 mb-4 text-muted-foreground" />
              <h2 className="text-xl font-display text-foreground">Selecione uma referencia</h2>
              <p className="text-sm text-muted-foreground font-serif mt-2">Clique em uma referencia na esquerda para navegar sem sair desta pagina.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 p-6 border-b border-border/50 bg-card/70 space-y-3">
                {selectedChannel ? (
                  <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{selectedChannel.name}</span></p>
                ) : null}
                <h2 className="text-2xl font-display font-semibold text-foreground">{selectedReference.title}</h2>
              </div>

              <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar">
                {selectedReadingRows.length === 0 ? (
                  <div className="max-w-3xl opacity-60">
                    <h3 className="text-xl font-display text-foreground">Sem estrutura definida</h3>
                    <p className="text-sm text-muted-foreground font-serif mt-2">Esta referencia ainda nao possui nodes cadastrados.</p>
                  </div>
                ) : (
                  <div className="max-w-3xl space-y-3">
                    {selectedReadingRows.map(({ node, level }) => {
                      const label = String((node as any)?.label || "").trim();
                      const content = String((node as any)?.content || "").trim();
                      const type = String((node as any)?.type || "").toUpperCase();

                      return (
                        <div
                          key={node.id}
                          className="rounded-2xl border border-border/60 bg-card p-4 md:p-5 shadow-sm"
                          style={{ marginLeft: `${level * 8}px` }}
                        >
                          <div className="mb-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{type || "NODE"}</p>
                            <h3 className="text-xl md:text-2xl font-display font-semibold text-foreground/95 mt-1">{label || "Sem titulo"}</h3>
                          </div>
                          {content ? (
                            <p className="font-serif text-xl leading-loose text-foreground whitespace-pre-wrap">{content}</p>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">Sem conteudo textual.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
