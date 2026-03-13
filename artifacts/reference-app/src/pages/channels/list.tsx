import { useState } from "react";
import { Link } from "wouter";
import { useListChannels, useCreateChannel, useJoinChannel, getListChannelsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hash, Users, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ChannelsList() {
  const { data: channels, isLoading } = useListChannels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const joinMutation = useJoinChannel();
  const createMutation = useCreateChannel();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");

  const handleJoin = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    joinMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: "Joined channel" });
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: { name: newChannelName, description: newChannelDesc } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: "Channel created" });
        setIsDialogOpen(false);
        setNewChannelName("");
        setNewChannelDesc("");
      }
    });
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-3">Study Channels</h1>
            <p className="text-lg text-muted-foreground font-serif">Join groups focused on specific texts and topics.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Create Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md rounded-3xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">New Channel</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label>Channel Name</Label>
                  <Input 
                    value={newChannelName} 
                    onChange={e => setNewChannelName(e.target.value)} 
                    placeholder="e.g. Genesis Study Group" 
                    required 
                    className="rounded-xl h-12 bg-background border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <textarea 
                    value={newChannelDesc} 
                    onChange={e => setNewChannelDesc(e.target.value)} 
                    placeholder="What is this channel about?" 
                    className="w-full rounded-xl bg-background border border-border/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-24 font-sans"
                  />
                </div>
                <Button type="submit" className="w-full rounded-xl h-12 bg-primary text-primary-foreground" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Channel"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : channels?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground font-serif text-lg">
            No channels exist yet. Be the first to create one!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {channels?.map(channel => (
              (() => {
                const memberCount = (channel as any).memberCount ?? (channel as any).members?.length ?? 0;
                const isJoined = Boolean((channel as any).myRole || (channel as any).createdBy || (channel as any).created_by);
                return (
              <Link key={channel.id} href={`/channels/${channel.id}`}>
                <Card className="h-full rounded-2xl border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer bg-card group flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Hash className="w-6 h-6" />
                    </div>
                    <CardTitle className="font-display text-xl line-clamp-1 group-hover:text-primary transition-colors">
                      {channel.name}
                    </CardTitle>
                    {channel.description && (
                      <CardDescription className="font-serif text-muted-foreground line-clamp-2 mt-2">
                        {channel.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto pt-4 flex items-center justify-between border-t border-border/30">
                    <div className="flex items-center text-sm text-muted-foreground font-medium">
                      <Users className="w-4 h-4 mr-1.5" />
                      {memberCount} members
                    </div>
                    {isJoined ? (
                      <span className="text-xs font-bold uppercase text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                        Joined
                      </span>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="rounded-full h-8 text-xs font-bold uppercase tracking-wide hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={(e) => handleJoin(channel.id, e)}
                        disabled={joinMutation.isPending}
                      >
                        Join
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Link>
                );
              })()
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
