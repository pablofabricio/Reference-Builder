import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListChannels, getListChannelsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, Plus, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

export default function ChannelsList() {
  const { data: channels, isLoading } = useListChannels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [memberChannelIds, setMemberChannelIds] = useState<number[]>([]);
  const [usersById, setUsersById] = useState<Record<number, string>>({});

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelVisibility, setNewChannelVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadMemberships = async () => {
      try {
        const response = await fetch("/api/channel-members");
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows
          .filter((row: any) => Number(row.user_id ?? row.userId) === Number(user?.id))
          .map((row: any) => Number(row.channel_id ?? row.channelId))
          .filter((id: number) => !Number.isNaN(id));

        if (isMounted) {
          setMemberChannelIds(Array.from(new Set(mine)));
        }
      } catch {
        if (isMounted) {
          setMemberChannelIds([]);
        }
      }
    };

    if (user?.id) {
      loadMemberships();
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id, channels]);

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      try {
        const response = await fetch("/api/users");
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mapped = rows.reduce((acc: Record<number, string>, row: any) => {
          const id = Number(row.id);
          if (!Number.isNaN(id) && typeof row.name === "string") {
            acc[id] = row.name;
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    setIsCreating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newChannelName,
          description: newChannelDesc || undefined,
          visibility: newChannelVisibility,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel criar channel");
      }

      queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      toast({ title: "Channel criado" });
      setIsDialogOpen(false);
      setNewChannelName("");
      setNewChannelDesc("");
      setNewChannelVisibility("PRIVATE");
    } catch (error: any) {
      toast({ title: "Erro ao criar channel", description: error?.message || "Erro inesperado", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const getCreatorId = (channel: any) => Number(channel.createdBy ?? channel.created_by ?? 0);

  const ownChannels = useMemo(
    () => (channels ?? []).filter((channel: any) => getCreatorId(channel) === Number(user?.id)),
    [channels, user?.id],
  );

  const subscribedChannels = useMemo(
    () =>
      (channels ?? []).filter((channel: any) => {
        const channelId = Number(channel.id);
        const creatorId = getCreatorId(channel);
        return creatorId !== Number(user?.id) && memberChannelIds.includes(channelId);
      }),
    [channels, memberChannelIds, user?.id],
  );

  const renderChannelCard = (channel: any) => {
    const memberCount = Number((channel as any).memberCount ?? (channel as any).members?.length ?? 0);
    const creatorId = getCreatorId(channel);
    const creatorName = usersById[creatorId] || (creatorId === Number(user?.id) ? "Voce" : `Usuario ${creatorId}`);

    return (
      <Card
        key={channel.id}
        className="h-full rounded-2xl border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer bg-card group flex flex-col"
        role="button"
        tabIndex={0}
        onClick={() => setLocation(`/channels/${channel.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLocation(`/channels/${channel.id}`);
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <UserRound className="w-4 h-4" />
            <span>{creatorName}</span>
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
        <CardContent className="mt-auto pt-4 border-t border-border/30">
          <div className="flex items-center text-sm text-muted-foreground font-medium">
            <Users className="w-4 h-4 mr-1.5" />
            {memberCount} membros
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
        <div className="flex justify-end border-b border-border/50 pb-6">
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
                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <select
                    value={newChannelVisibility}
                    onChange={(e) => setNewChannelVisibility(e.target.value as "PRIVATE" | "PUBLIC")}
                    className="w-full rounded-xl bg-background border border-border/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 h-12"
                  >
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="PUBLIC">PUBLIC</option>
                  </select>
                </div>
                <Button type="submit" className="w-full rounded-xl h-12 bg-primary text-primary-foreground" disabled={isCreating}>
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Channel"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : !ownChannels.length && !subscribedChannels.length ? (
          <div className="text-center py-20 text-muted-foreground font-serif text-lg">
            Nenhum canal encontrado para voce.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ownChannels.map((channel: any) => renderChannelCard(channel))}
            </div>

            {subscribedChannels.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {subscribedChannels.map((channel: any) => renderChannelCard(channel))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
