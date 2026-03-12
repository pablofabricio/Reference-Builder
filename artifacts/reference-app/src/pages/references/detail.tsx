import { useState } from "react";
import { useParams } from "wouter";
import { useGetReference, useListReferenceNodes, useListNotes, type ReferenceNode } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, ChevronDown, AlignLeft, FileText, Plus } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

// Recursive component to render the hierarchy
const TreeNode = ({ 
  node, 
  nodes, 
  level = 0, 
  selectedNodeId, 
  onSelect 
}: { 
  node: ReferenceNode, 
  nodes: ReferenceNode[], 
  level?: number,
  selectedNodeId: number | null,
  onSelect: (id: number) => void
}) => {
  const [expanded, setExpanded] = useState(level < 1);
  const children = nodes.filter(n => n.parentNodeId === node.id).sort((a, b) => a.position - b.position);
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
          if (hasChildren && !isSelected) setExpanded(true);
        }}
      >
        <div 
          className="w-5 h-5 flex items-center justify-center mr-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setExpanded(!expanded);
            }
          }}
        >
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function ReferenceDetail() {
  const { id } = useParams();
  const refId = parseInt(id || "0", 10);
  
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const { data: reference, isLoading: loadingRef } = useGetReference(refId);
  const { data: nodes, isLoading: loadingNodes } = useListReferenceNodes(refId);
  
  // Fetch notes for the selected node
  const { data: notes, isLoading: loadingNotes } = useListNotes(
    selectedNodeId ? { referenceNodeId: selectedNodeId } : undefined,
    { query: { enabled: !!selectedNodeId } }
  );

  const rootNodes = nodes?.filter(n => !n.parentNodeId).sort((a, b) => a.position - b.position) || [];
  const selectedNode = nodes?.find(n => n.id === selectedNodeId);

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-full md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh)]">
        
        {/* Left Pane: Hierarchy Tree */}
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 bg-sidebar/50 flex flex-col h-[50vh] md:h-full overflow-hidden">
          {loadingRef ? (
            <div className="p-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="p-6 border-b border-border/50 shrink-0 bg-sidebar">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                {reference?.type}
              </span>
              <h1 className="text-2xl font-display font-bold leading-tight mb-2">{reference?.title}</h1>
              {reference?.author && <p className="text-sm font-medium">{reference.author}</p>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loadingNodes ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : rootNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic p-4 font-serif">No structure defined yet.</p>
            ) : (
              <div className="space-y-0.5">
                {rootNodes.map(node => (
                  <TreeNode 
                    key={node.id} 
                    node={node} 
                    nodes={nodes!} 
                    selectedNodeId={selectedNodeId}
                    onSelect={setSelectedNodeId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Content & Notes */}
        <div className="flex-1 flex flex-col h-auto md:h-full overflow-hidden bg-background">
          {!selectedNodeId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50">
              <AlignLeft className="w-16 h-16 mb-4 text-muted-foreground" />
              <h2 className="text-xl font-display text-foreground">Select a section</h2>
              <p className="text-sm text-muted-foreground font-serif mt-2">Choose an item from the structure on the left to read and view notes.</p>
            </div>
          ) : (
            <>
              {/* Content Area */}
              <div className="shrink-0 p-8 md:p-12 border-b border-border/50 bg-card">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-display font-bold">{selectedNode?.label}</h2>
                    <span className="text-xs font-medium px-2.5 py-1 bg-secondary rounded-md text-secondary-foreground border border-border">
                      {selectedNode?.type}
                    </span>
                  </div>
                  {selectedNode?.content ? (
                    <div className="prose prose-stone dark:prose-invert max-w-none font-serif text-lg leading-loose text-foreground/90 whitespace-pre-wrap">
                      {selectedNode.content}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic font-serif">No text content available for this section.</p>
                  )}
                </div>
              </div>

              {/* Notes Area */}
              <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-background">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-display font-semibold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      Reflections
                    </h3>
                    <Link href={`/notes/new?refNodeId=${selectedNodeId}`}>
                      <Button size="sm" className="rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-none border-0">
                        <Plus className="w-4 h-4 mr-1.5" />
                        Write Note
                      </Button>
                    </Link>
                  </div>

                  {loadingNotes ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : notes?.length === 0 ? (
                    <div className="text-center p-12 border border-dashed border-border rounded-2xl bg-card/50">
                      <p className="text-muted-foreground font-serif">No reflections here yet. Be the first to write one.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {notes?.map(note => (
                        <div key={note.id} className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-sm text-secondary-foreground border border-border">
                                {note.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{note.user.name}</p>
                                <p className="text-xs text-muted-foreground">{format(new Date(note.createdAt), 'MMM d, yyyy')}</p>
                              </div>
                            </div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-background px-2 py-1 rounded border border-border">
                              {note.visibility}
                            </span>
                          </div>
                          <p className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap">
                            {note.content}
                          </p>
                        </div>
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
