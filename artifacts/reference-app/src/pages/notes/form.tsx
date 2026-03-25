import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useCreateNote, useGetNote, useUpdateNote, getGetNoteQueryKey, getListNotesQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

// Wouter doesn't have a built-in search params hook that parses easily, so let's do a simple one
function useQueryParams() {
  const search = useSearch();
  return new URLSearchParams(search);
}

export default function NoteForm({ params }: { params?: { id?: string } }) {
  const isEditing = !!params?.id;
  const noteId = parseInt(params?.id || "0", 10);
  
  const [, setLocation] = useLocation();
  const queryParams = useQueryParams();
  const refNodeId = queryParams.get("refNodeId");
  const channelId = queryParams.get("channelId");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC" | "CHANNEL">("PRIVATE");

  const { data: existingNote, isLoading: loadingExisting } = useGetNote(noteId, { 
    query: { enabled: isEditing, queryKey: getGetNoteQueryKey(noteId) } 
  });

  const createMutation = useCreateNote();
  const updateMutation = useUpdateNote();

  useEffect(() => {
    if (existingNote && isEditing) {
      setContent(existingNote.content);
      setVisibility(existingNote.visibility as any);
    } else if (!isEditing) {
      if (channelId) setVisibility("CHANNEL");
    }
  }, [existingNote, isEditing, channelId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (isEditing) {
      updateMutation.mutate({ 
        id: noteId, 
        data: { content, visibility, channelId: existingNote?.channelId } 
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
          toast({ title: "Note updated" });
          setLocation("/references");
        }
      });
    } else {
      createMutation.mutate({ 
        data: { 
          content, 
          visibility, 
          referenceNodeId: refNodeId ? parseInt(refNodeId, 10) : null,
          channelId: channelId ? parseInt(channelId, 10) : null
        } 
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
          toast({ title: "Note saved" });
          if (channelId) setLocation(`/channels/${channelId}`);
          else if (refNodeId) history.back();
          else setLocation("/references");
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditing && loadingExisting) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center h-[50vh]"><Loader2 className="w-8 h-8 animate-spin" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground hover:text-foreground" onClick={() => history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <h1 className="text-4xl font-display font-bold mb-8">{isEditing ? "Edit Reflection" : "New Reflection"}</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="bg-card rounded-3xl p-1 shadow-sm border border-border/50">
            <textarea
              className="w-full min-h-[40vh] p-8 bg-transparent border-0 focus:ring-0 resize-y font-serif text-xl leading-loose text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
              placeholder="Write your thoughts here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 bg-secondary/30 p-6 rounded-2xl border border-border/50">
            <div className="space-y-2 w-full sm:w-auto">
              <Label className="text-sm font-semibold text-foreground">Visibility</Label>
              <select 
                className="w-full sm:w-64 h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                disabled={!!channelId && !isEditing} // Lock to channel if created from channel
              >
                <option value="PRIVATE">Private (Only me)</option>
                <option value="PUBLIC">Public (Everyone)</option>
                <option value="CHANNEL">Channel Only</option>
              </select>
            </div>

            <Button 
              type="submit" 
              size="lg"
              className="w-full sm:w-auto rounded-xl px-10 h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 text-base"
              disabled={isPending || !content.trim()}
            >
              {isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
              {isEditing ? "Save Changes" : "Save Reflection"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
