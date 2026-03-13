import { useListNotes, useDeleteNote } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, PenTool, BookOpen, Trash2, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotesQueryKey } from "@workspace/api-client-react";

export default function NotesList() {
  const { user } = useAuth();
  // Fetch notes (the API listNotes will likely filter by user if we pass nothing, or we just filter client side for now assuming it returns all visible)
  // Actually, to get *my* notes, let's just filter the returned list by user.id
  const { data: allNotes, isLoading } = useListNotes();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteNote();

  const myNotes = allNotes
    ?.filter((n: any) => n.userId === user?.id)
    .sort((a: any, b: any) => {
      const aDate = a.createdAt || a.created_at;
      const bDate = b.createdAt || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        }
      });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-3">My Notes</h1>
            <p className="text-lg text-muted-foreground font-serif">Your personal thoughts and reflections.</p>
          </div>
          <Link href="/notes/new">
            <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" />
              New Note
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : myNotes?.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border/50 shadow-sm">
            <PenTool className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-xl font-display font-medium mb-2">No notes yet</h3>
            <p className="text-muted-foreground font-serif mb-6">Start writing to build your personal repository of insights.</p>
            <Link href="/notes/new">
              <Button variant="outline" className="rounded-full">Start Writing</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {myNotes?.map(note => (
              <Card key={note.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 bg-card group">
                <CardHeader className="pb-3 border-b border-border/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {format(new Date((note as any).createdAt || (note as any).created_at), 'MMMM d, yyyy')}
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(note.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {note.referenceNode && (
                    <Link href={`/references/${note.referenceNode.referenceId}`}>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/30 hover:bg-secondary rounded-lg text-xs font-medium text-foreground cursor-pointer transition-colors border border-border/30">
                        <BookOpen className="w-3.5 h-3.5 text-primary" />
                        {note.referenceNode.label}
                      </div>
                    </Link>
                  )}
                  <p className="font-serif text-foreground/90 text-lg leading-relaxed line-clamp-4">
                    {note.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
