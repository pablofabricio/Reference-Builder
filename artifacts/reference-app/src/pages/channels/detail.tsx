import { useParams, Link } from "wouter";
import { useGetChannel, useListNotes, useLeaveChannel, getGetChannelQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Hash, Users, BookOpen, MessageSquare, ArrowLeft, LogOut } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ChannelDetail() {
  const { id } = useParams();
  const channelId = parseInt(id || "0", 10);
  const { user } = useAuth();
  
  const { data: channel, isLoading: loadingChannel } = useGetChannel(channelId);
  const { data: notes, isLoading: loadingNotes } = useListNotes({ visibility: "CHANNEL" });
  
  // Filter notes that belong to this channel
  const channelNotes = notes?.filter(n => n.channelId === channelId) || [];

  const leaveMutation = useLeaveChannel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleLeave = () => {
    if (window.confirm("Are you sure you want to leave this channel?")) {
      leaveMutation.mutate({ id: channelId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetChannelQueryKey(channelId) });
          toast({ title: "Left channel" });
          history.back();
        }
      });
    }
  };

  if (loadingChannel) {
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

  const channelReferences = (channel as any).references ?? [];
  const channelMembers = (channel as any).members ?? [];
  const memberCount = (channel as any).memberCount ?? channelMembers.length ?? 0;
  const isMember = Boolean((channel as any).myRole || (channel as any).createdBy || (channel as any).created_by);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 md:p-10">
        
        {/* Header */}
        <div className="bg-card rounded-3xl p-8 md:p-10 border border-border/50 shadow-sm mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row gap-6 md:items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                  <Hash className="w-6 h-6" />
                </div>
                <h1 className="text-4xl font-display font-bold text-foreground">{channel.name}</h1>
              </div>
              {channel.description && (
                <p className="text-lg text-muted-foreground font-serif max-w-2xl">{channel.description}</p>
              )}
              
              <div className="flex items-center gap-6 mt-6">
                <div className="flex items-center text-sm font-medium bg-secondary px-3 py-1.5 rounded-lg text-secondary-foreground">
                  <Users className="w-4 h-4 mr-2" />
                  {memberCount} Members
                </div>
                <div className="flex items-center text-sm font-medium bg-secondary px-3 py-1.5 rounded-lg text-secondary-foreground">
                  <BookOpen className="w-4 h-4 mr-2" />
                  {channelReferences.length} References
                </div>
              </div>
            </div>

            {isMember && (
              <Button 
                variant="outline" 
                className="rounded-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                onClick={handleLeave}
                disabled={leaveMutation.isPending}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Channel
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <h2 className="text-2xl font-display font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Discussions
              </h2>
              {isMember && (
                <Link href={`/notes/new?channelId=${channel.id}`}>
                  <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90">Post Note</Button>
                </Link>
              )}
            </div>

            {!isMember ? (
              <div className="text-center p-12 bg-card rounded-2xl border border-border/50">
                <Hash className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-medium mb-2">Join to view discussions</h3>
                <p className="text-muted-foreground font-serif">You need to be a member of this channel to read and post notes.</p>
              </div>
            ) : loadingNotes ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : channelNotes.length === 0 ? (
              <div className="text-center p-12 border border-dashed border-border rounded-2xl bg-card/50">
                <p className="text-muted-foreground font-serif">No discussions yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {channelNotes.map((note) => (
                  (() => {
                    const authorName = (note as any).user?.name || `User ${(note as any).userId ?? ''}`.trim();
                    const createdAt = (note as any).createdAt || (note as any).created_at;
                    return (
                  <Card key={note.id} className="rounded-2xl border-border/50 shadow-sm bg-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-secondary-foreground border border-border">
                            {(authorName.charAt(0) || 'U').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold font-sans text-foreground">{authorName}</p>
                            <p className="text-xs text-muted-foreground font-sans">{createdAt ? format(new Date(createdAt), 'MMM d, yyyy h:mm a') : ''}</p>
                          </div>
                        </div>
                      </div>
                      
                      {note.referenceNode && (
                        <Link href={`/references/${note.referenceNode.referenceId}`}>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/30 hover:bg-secondary rounded-lg text-xs font-medium text-foreground cursor-pointer transition-colors border border-border/30 mb-4">
                            <BookOpen className="w-3.5 h-3.5 text-primary" />
                            {note.referenceNode.label}
                          </div>
                        </Link>
                      )}
                      
                      <p className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap">
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

          {/* Sidebar */}
          <div className="space-y-8">
            <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-lg font-display font-semibold mb-4 border-b border-border/50 pb-2">Focused Texts</h3>
              {channelReferences.length === 0 ? (
                <p className="text-sm text-muted-foreground font-serif">No specific texts added yet.</p>
              ) : (
                <ul className="space-y-3">
                  {channelReferences.map((ref: any) => (
                    <li key={ref.id}>
                      <Link href={`/references/${ref.id}`}>
                        <div className="flex items-start gap-3 group cursor-pointer">
                          <BookOpen className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                          <div>
                            <p className="text-sm font-medium group-hover:underline text-foreground leading-tight">{ref.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{ref.type}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-lg font-display font-semibold mb-4 border-b border-border/50 pb-2 flex items-center justify-between">
                <span>Members</span>
                <span className="text-sm font-sans font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">{memberCount}</span>
              </h3>
              <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {channelMembers.map((member: any) => {
                  const memberName = member?.user?.name || `User ${member?.userId ?? member?.user_id ?? ''}`.trim();
                  const memberId = member?.userId ?? member?.user_id;
                  return (
                  <div key={memberId ?? member?.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold border border-border">
                        {(memberName.charAt(0) || 'U').toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground">{memberName}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{member.role}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
