import { useListNotes, useListChannels } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Hash, BookOpen } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { data: publicNotes, isLoading: loadingNotes } = useListNotes({ visibility: 'PUBLIC' });
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const myChannels = channels?.filter((c: any) => c.myRole || c.createdBy != null) ?? channels ?? [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-12">
        <div>
          <h1 className="text-4xl font-display font-bold mb-3">Dashboard</h1>
          <p className="text-lg text-muted-foreground font-serif">A window into the community's reflections.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Public Feed Feed */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-display font-semibold border-b border-border/50 pb-4">Recent Insights</h2>
            
            {loadingNotes ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : publicNotes?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground font-serif bg-card rounded-2xl border border-border/50">
                No public notes found.
              </div>
            ) : (
              <div className="space-y-6">
                {publicNotes?.map((note) => (
                  (() => {
                    const authorName = (note as any).user?.name || `User ${(note as any).userId ?? ''}`.trim();
                    const createdAt = (note as any).createdAt || (note as any).created_at;
                    return (
                  <Card key={note.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3 flex flex-row items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-secondary-foreground border border-border">
                        {(authorName.charAt(0) || 'U').toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base font-sans">{authorName}</CardTitle>
                        <p className="text-xs text-muted-foreground font-sans">{createdAt ? format(new Date(createdAt), 'MMM d, yyyy') : ''}</p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {note.referenceNode && (
                        <Link href={`/references/${note.referenceNode.referenceId}`}>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/50 hover:bg-secondary rounded-lg text-xs font-medium text-secondary-foreground cursor-pointer transition-colors border border-border/50">
                            <BookOpen className="w-3.5 h-3.5" />
                            {note.referenceNode.label}
                          </div>
                        </Link>
                      )}
                      <p className="font-serif text-foreground leading-relaxed whitespace-pre-wrap text-lg">
                        {note.content}
                      </p>
                    </CardContent>
                  </Card>
                    );
                  })()
                ))}
              </div>
            )}
          </div>

          {/* Sidebar / Widgets */}
          <div className="space-y-8">
            <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-xl font-display font-semibold mb-4">Your Channels</h3>
              {loadingChannels ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : myChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground font-serif text-center py-4">You haven't joined any channels yet.</p>
              ) : (
                <ul className="space-y-3">
                  {myChannels.map((channel: any) => (
                    <li key={channel.id}>
                      <Link href={`/channels/${channel.id}`}>
                        <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors border border-transparent hover:border-border/50">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Hash className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground">{channel.name}</p>
                            <p className="text-xs text-muted-foreground">{channel.memberCount ?? '-'} members</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 pt-4 border-t border-border/50 text-center">
                <Link href="/channels" className="text-sm font-medium text-primary hover:underline">
                  Discover more channels →
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
