import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useListChannels, getListChannelsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, Plus, UserRound, Pencil, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

type ProfilePayload = {
  id: number;
  name?: string;
  email?: string;
  description?: string;
  avatarUrl?: string;
  avatar_url?: string;
  channels?: any[];
};

const normalizeProfilePayload = (payload: any, fallbackChannels: any[] = []): ProfilePayload => {
  const rawData = payload?.data ?? payload;
  const userData = (rawData?.user ?? rawData) as any;

  return {
    id: Number(userData?.id ?? 0),
    name: String(userData?.name || "") || undefined,
    email: String(userData?.email || "") || undefined,
    description: userData?.description ?? null,
    avatarUrl: userData?.avatar_url ?? userData?.avatarUrl,
    channels: Array.isArray(rawData?.channels) ? rawData.channels : fallbackChannels,
  };
};

export default function ChannelsList() {
  const { data: channels, isLoading } = useListChannels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { userId } = useParams<{ userId?: string }>();

  const [memberChannelIds, setMemberChannelIds] = useState<number[]>([]);
  const [pendingRequestByChannelId, setPendingRequestByChannelId] = useState<Record<number, number>>({});
  const [usersById, setUsersById] = useState<Record<number, string>>({});

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelVisibility, setNewChannelVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [isCreating, setIsCreating] = useState(false);
  const [requestingChannelId, setRequestingChannelId] = useState<number | null>(null);

  // Fallback: parse directly from the URL path in case Wouter v3 doesn't propagate
  // the param through the component-prop wrapper chain.
  const urlUserId = typeof window !== "undefined"
    ? (window.location.pathname.match(/\/channels\/user\/(\d+)/) ?? [])[1]
    : undefined;
  const resolvedUserId = userId ?? urlUserId;

  const viewedUserId = Number(resolvedUserId ?? user?.id ?? 0);
  const isOwnProfile = !resolvedUserId || viewedUserId === Number(user?.id);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!viewedUserId) {
        if (isMounted) {
          setProfile(null);
          setProfileError(null);
          setDescriptionDraft("");
        }
        return;
      }

      setLoadingProfile(true);
      setProfileError(null);
      try {
        const response = await fetch(`/api/users/${viewedUserId}/profile`);
        if (!response.ok) throw new Error("Falha ao carregar perfil");

        const payload = await response.json();
        const data = normalizeProfilePayload(payload, []);

        if (isMounted) {
          setProfile(data);
          setDescriptionDraft(String(data?.description || ""));
          setAvatarLoadFailed(false);
        }
      } catch {
        if (isMounted) {
          if (isOwnProfile && user) {
            setProfile({
              id: Number(user.id),
              name: user.name,
              email: user.email,
              description: String((user as any)?.description || ""),
              channels: [],
            });
            setDescriptionDraft(String((user as any)?.description || ""));
            setProfileError(null);
            setAvatarLoadFailed(false);
          } else {
            setProfile(null);
            setProfileError("Nao foi possivel carregar este perfil agora.");
          }
        }
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [viewedUserId, isOwnProfile, user]);

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

    const loadPendingRequests = async () => {
      if (!user?.id) {
        if (isMounted) setPendingRequestByChannelId({});
        return;
      }

      try {
        const response = await fetch("/api/channel-join-requests?status=PENDING");
        if (!response.ok) return;

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        const mine = rows
          .filter((row: any) => Number(row.requester_id ?? row.requesterId ?? 0) === Number(user?.id))
          .filter((row: any) => Number(row.id ?? 0) > 0)
          .reduce((acc: Record<number, number>, row: any) => {
            const channelId = Number(row.channel_id ?? row.channelId ?? 0);
            const requestId = Number(row.id ?? 0);
            if (!Number.isNaN(channelId) && channelId > 0 && !Number.isNaN(requestId) && requestId > 0) {
              acc[channelId] = requestId;
            }
            return acc;
          }, {});

        if (isMounted) {
          setPendingRequestByChannelId(mine);
        }
      } catch {
        if (isMounted) {
          setPendingRequestByChannelId({});
        }
      }
    };

    loadPendingRequests();

    const refreshRequests = () => {
      loadPendingRequests();
    };

    window.addEventListener("channel-requests-changed", refreshRequests);

    return () => {
      isMounted = false;
      window.removeEventListener("channel-requests-changed", refreshRequests);
    };
  }, [user?.id]);

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
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

  const handleSaveDescription = async () => {
    if (!user?.id) return;

    setIsSavingProfile(true);
    try {
      const response = await fetch(`/api/users/${user.id}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description: descriptionDraft.trim() || null }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel atualizar perfil");
      }

      const payload = await response.json();
      const data = normalizeProfilePayload(payload, profile?.channels ?? []);

      setProfile((prev) => ({
        ...(prev || { id: Number(user.id) }),
        ...data,
        description: data?.description ?? descriptionDraft,
        channels: Array.isArray(data?.channels) ? data.channels : (prev?.channels ?? []),
      }));
      setDescriptionDraft(String(data?.description ?? descriptionDraft));

      // Force a fresh read from backend to avoid stale UI when response shapes differ.
      const refreshResponse = await fetch(`/api/users/${user.id}/profile`);
      if (refreshResponse.ok) {
        const refreshPayload = await refreshResponse.json();
        const refreshed = normalizeProfilePayload(refreshPayload, profile?.channels ?? []);
        setProfile((prev) => ({
          ...(prev || { id: Number(user.id) }),
          ...refreshed,
          channels: Array.isArray(refreshed?.channels) ? refreshed.channels : (prev?.channels ?? []),
        }));
        setDescriptionDraft(String(refreshed?.description ?? ""));
      }

      setIsEditingDescription(false);
      toast({ title: "Descricao atualizada" });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar perfil", description: error?.message || "Erro inesperado", variant: "destructive" });
    } finally {
      setIsSavingProfile(false);
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

  const profileChannels = useMemo(() => {
    if (isOwnProfile) {
      return [...ownChannels, ...subscribedChannels];
    }

    return Array.isArray(profile?.channels) ? profile.channels : [];
  }, [isOwnProfile, ownChannels, subscribedChannels, profile?.channels]);

  const activeName = profile?.name || user?.name || "Usuario";
  const activeEmail = profile?.email || user?.email || "Sem email";
  const activeDescription = String(profile?.description || "");
  const hasDescription = activeDescription.trim().length > 0;
  const avatarSrc = String(
    profile?.avatarUrl ||
    profile?.avatar_url ||
    (user as any)?.avatarUrl ||
    (user as any)?.avatar_url ||
    "",
  ).trim();
  const showAvatarImage = !!avatarSrc && !avatarLoadFailed;

  const renderChannelCard = (channel: any) => {
    const memberCount = Number((channel as any).memberCount ?? (channel as any).members?.length ?? 0);
    const creatorId = getCreatorId(channel);
    const creatorName = usersById[creatorId] || (creatorId === Number(user?.id) ? "Voce" : `Usuario ${creatorId}`);
    const channelId = Number(channel.id);
    const channelVisibility = String(channel.visibility || "PRIVATE").toUpperCase();
    const isOwnChannel = creatorId === Number(user?.id);
    const isMember = memberChannelIds.includes(channelId);
    const canOpenChannel = isOwnChannel || isMember;
    const pendingRequestId = pendingRequestByChannelId[channelId];
    const hasPendingRequest = Number.isFinite(pendingRequestId) && pendingRequestId > 0;
    const canRequestJoin = channelVisibility === "PUBLIC" && !isOwnChannel && !isMember && !hasPendingRequest;

    return (
      <Card
        key={channel.id}
        className={`h-full rounded-2xl border-border/50 shadow-sm transition-all duration-300 bg-card group flex flex-col ${canOpenChannel ? "hover:shadow-xl hover:-translate-y-1 cursor-pointer" : "cursor-default"}`}
        role={canOpenChannel ? "button" : undefined}
        tabIndex={canOpenChannel ? 0 : -1}
        onClick={() => {
          if (!canOpenChannel) return;
          setLocation(`/channels/${channel.id}`);
        }}
        onKeyDown={(e) => {
          if (!canOpenChannel) return;
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
          <CardTitle className={`font-display text-xl line-clamp-1 transition-colors ${canOpenChannel ? "group-hover:text-primary" : ""}`}>
            {channel.name}
          </CardTitle>
          {channel.description && (
            <CardDescription className="font-serif text-muted-foreground line-clamp-2 mt-2">
              {channel.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="mt-auto pt-4 border-t border-border/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center text-sm text-muted-foreground font-medium">
              <Users className="w-4 h-4 mr-1.5" />
              {memberCount} membros
            </div>
            {(canRequestJoin || hasPendingRequest) && (
              <Button
                type="button"
                size="sm"
                className="rounded-xl cursor-pointer disabled:cursor-not-allowed"
                disabled={requestingChannelId === channelId}
                onClick={async (event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (!canRequestJoin && !hasPendingRequest) return;

                  setRequestingChannelId(channelId);
                  try {
                    if (hasPendingRequest) {
                      const response = await fetch(`/api/channel-join-requests/${pendingRequestId}`, {
                        method: "DELETE",
                      });

                      if (!response.ok) {
                        const errorBody = await response.json().catch(() => ({}));
                        throw new Error(errorBody?.message || "Nao foi possivel cancelar solicitacao");
                      }

                      setPendingRequestByChannelId((prev) => {
                        const next = { ...prev };
                        delete next[channelId];
                        return next;
                      });
                      window.dispatchEvent(new Event("channel-requests-changed"));
                      toast({ title: "Solicitacao cancelada" });
                    } else {
                      const response = await fetch(`/api/channels/${channelId}/join`, {
                        method: "POST",
                      });

                      if (!response.ok) {
                        const errorBody = await response.json().catch(() => ({}));
                        throw new Error(errorBody?.message || "Nao foi possivel solicitar entrada");
                      }

                      const payload = await response.json().catch(() => ({}));
                      const requestId = Number(payload?.data?.id ?? payload?.id ?? 0);
                      if (requestId > 0) {
                        setPendingRequestByChannelId((prev) => ({ ...prev, [channelId]: requestId }));
                      }
                      window.dispatchEvent(new Event("channel-requests-changed"));
                      toast({ title: "Solicitacao enviada" });
                      setLocation("/requests?tab=outgoing");
                    }
                  } catch (error: any) {
                    toast({ title: error?.message || "Erro ao atualizar solicitacao", variant: "destructive" });
                  } finally {
                    setRequestingChannelId(null);
                  }
                }}
              >
                {requestingChannelId === channelId ? <Loader2 className="w-4 h-4 animate-spin" /> : hasPendingRequest ? "Solicitado" : "Solicitar entrada"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
        <div className="rounded-2xl border border-border/50 bg-card/80 px-5 py-5 md:px-6 md:py-6 shadow-sm">
          <div className="flex items-center gap-4">
            {showAvatarImage ? (
              <img
                src={avatarSrc}
                alt={`Avatar de ${activeName}`}
                className="h-12 w-12 rounded-xl border border-primary/20 object-cover shrink-0"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-display font-bold text-lg shrink-0">
                {activeName?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground truncate">
                {activeName}
              </h1>
              <p className="text-sm text-muted-foreground truncate">{activeEmail}</p>

              {isOwnProfile ? (
                <div className="mt-2">
                  {isEditingDescription ? (
                    <div className="space-y-2">
                      <textarea
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        placeholder="Escreva uma descricao sobre voce"
                        className="w-full rounded-xl bg-background border border-border/50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-24 font-sans"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-lg"
                          onClick={handleSaveDescription}
                          disabled={isSavingProfile}
                        >
                          {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsEditingDescription(false);
                            setDescriptionDraft(activeDescription);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    hasDescription ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingDescription(true)}
                        className="mt-1 text-left text-sm md:text-base text-foreground/75 font-serif hover:text-foreground transition-colors inline-flex items-center gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        {activeDescription}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingDescription(true)}
                        className="mt-2 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Editar descricao"
                        title="Editar descricao"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              ) : (
                hasDescription ? (
                  <p className="mt-1 text-sm md:text-base text-foreground/75 font-serif">
                    {activeDescription}
                  </p>
                ) : null
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end border-b border-border/50 pb-6">
          {isOwnProfile && (
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
          )}
        </div>

        {isLoading || loadingProfile ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : profileError ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
            <p className="text-sm md:text-base text-destructive font-medium">{profileError}</p>
          </div>
        ) : profileChannels.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground font-serif text-lg">
            {isOwnProfile ? "Nenhum canal encontrado para voce." : "Nenhum channel publico desse usuario."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profileChannels.map((channel: any) => renderChannelCard(channel))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
