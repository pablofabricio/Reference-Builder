import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListChannels, useListReferences } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Library } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";

type UserSummary = { name: string; avatarUrl?: string };

export default function ReferencesList() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: references, isLoading: loadingReferences } = useListReferences();
  const { data: channels, isLoading: loadingChannels } = useListChannels();
  const [channelReferenceLinks, setChannelReferenceLinks] = useState<any[]>([]);
  const [memberChannelIds, setMemberChannelIds] = useState<number[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserSummary>>({});
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [loadingMemberships, setLoadingMemberships] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadChannelReferences = async () => {
      setLoadingLinks(true);
      try {
        const token = localStorage.getItem("auth_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch("/api/channel-references", { headers });
        if (!response.ok) throw new Error("Failed to load channel references");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        if (isMounted) setChannelReferenceLinks(rows);
      } catch {
        if (isMounted) setChannelReferenceLinks([]);
      } finally {
        if (isMounted) setLoadingLinks(false);
      }
    };

    loadChannelReferences();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMemberships = async () => {
      if (!user?.id) {
        if (isMounted) {
          setMemberChannelIds([]);
          setLoadingMemberships(false);
        }
        return;
      }

      setLoadingMemberships(true);
      try {
        const res = await fetch("/api/channel-members");
        if (!res.ok) throw new Error("Failed to load memberships");

        const payload = await res.json();
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

        const mine = rows
          .filter((row: any) => Number(row.user_id ?? row.userId ?? 0) === Number(user.id))
          .map((row: any) => Number(row.channel_id ?? row.channelId ?? 0))
          .filter((id: number) => id > 0);

        if (isMounted) setMemberChannelIds(Array.from(new Set(mine)));
      } catch {
        if (isMounted) setMemberChannelIds([]);
      } finally {
        if (isMounted) setLoadingMemberships(false);
      }
    };

    loadMemberships();

    return () => { isMounted = false; };
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

        const mapped = rows.reduce((acc: Record<number, UserSummary>, row: any) => {
          const id = Number(row.id);
          if (!Number.isNaN(id) && typeof row.name === "string") {
            acc[id] = {
              name: row.name,
              avatarUrl: String(row?.avatar_url || row?.avatarUrl || "").trim() || undefined,
            };
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

  const referencesById = useMemo(() => {
    const map = new Map<number, any>();
    (references ?? []).forEach((r: any) => {
      const id = Number(r?.id ?? 0);
      if (id > 0) map.set(id, r);
    });
    return map;
  }, [references]);

  const channelSections = useMemo(() => {
    const PRIVATE = "PRIVATE";
    const PUBLIC = "PUBLIC";

    return (channels ?? [])
      .filter((channel: any) => {
        const channelId = Number(channel?.id ?? 0);
        const creatorId = Number(channel?.createdBy ?? channel?.created_by ?? 0);
        const isOwner = creatorId === Number(user?.id ?? 0);
        const isMember = memberChannelIds.includes(channelId);
        return isOwner || isMember;
      })
      .map((channel: any) => {
        const channelId = Number(channel?.id ?? 0);
        const creatorId = Number(channel?.createdBy ?? channel?.created_by ?? 0);
        const isOwner = creatorId === Number(user?.id ?? 0);
        const visibility = String(channel?.visibility || PRIVATE).toUpperCase();

        const group = isOwner
          ? (visibility === PUBLIC ? PUBLIC : PRIVATE)
          : "INSCRITO";

        return {
          id: channelId,
          name: String(channel?.name || `Canal ${channelId}`),
          creatorId,
          group,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [channels, memberChannelIds, user?.id]);

  const standaloneTypes = useMemo(() => {
    const linkedReferenceIds = new Set(
      (channelReferenceLinks ?? [])
        .map((link: any) => Number(link?.reference_id ?? link?.referenceId ?? 0))
        .filter((id: number) => id > 0),
    );

    const standaloneReferences = (references ?? []).filter(
      (reference: any) => !linkedReferenceIds.has(Number(reference?.id ?? 0)),
    );

    const grouped = standaloneReferences.reduce((acc: Record<string, any[]>, reference: any) => {
      const type = String(reference?.type || reference?.referenceType || "SEM_TIPO").trim().toUpperCase();
      if (!acc[type]) acc[type] = [];
      acc[type].push(reference);
      return acc;
    }, {});

    const preferredOrder = ["BOOK", "BIBLE", "MUSIC", "POEM", "SERMON"];
    const sortedTypes = Object.keys(grouped).sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a);
      const bIndex = preferredOrder.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

    const typeTitles: Record<string, string> = {
      BOOK: "Books",
      BIBLE: "Bibles",
      MUSIC: "Music",
      POEM: "Poems",
      SERMON: "Sermons",
      SEM_TIPO: "Sem tipo",
    };

    return sortedTypes.map((type) => ({
      type,
      title: typeTitles[type] || type,
      references: grouped[type]
        .slice()
        .sort((a: any, b: any) => String(a?.title || "").localeCompare(String(b?.title || ""))),
    }));
  }, [references, channelReferenceLinks]);

  const channelsByGroup = useMemo(() => {
    return {
      private: channelSections.filter((item) => item.group === "PRIVATE"),
      public: channelSections.filter((item) => item.group === "PUBLIC"),
      subscribed: channelSections.filter((item) => item.group === "INSCRITO"),
    };
  }, [channelSections]);

  const isLoading = loadingReferences || loadingChannels || loadingMemberships || loadingLinks;

  return (
    <AppLayout>
      <div className="min-h-full bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

          {/* Page header */}
          <div className="flex items-center gap-3 mb-10">
            <Library className="w-7 h-7 text-muted-foreground" />
            <h1 className="text-3xl font-display font-semibold text-foreground">Biblioteca</h1>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : channelSections.length === 0 && standaloneTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic font-serif">Nenhuma referência encontrada.</p>
          ) : (
            <div className="space-y-12">

              {/* Channel sections */}
              {channelSections.length > 0 && (
                <section>
                  <h2 className="text-lg font-display font-semibold text-foreground mb-4">Canais</h2>
                  <div className="space-y-8">
                    {channelsByGroup.private.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Privados</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {channelsByGroup.private.map((section) => (
                            <Card key={`private-${section.id}`} className="border-border/50 shadow-sm">
                              <CardHeader className="pb-2">
                                <CardDescription>Canal privado</CardDescription>
                                <CardTitle className="text-base">
                                  <button
                                    type="button"
                                    onClick={() => setLocation(`/channels/${section.id}`)}
                                    className="text-left hover:text-primary transition-colors"
                                  >
                                    {section.name}
                                  </button>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <UserAvatar
                                    name={usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}
                                    src={usersById[section.creatorId]?.avatarUrl}
                                    size="sm"
                                  />
                                  <span>{usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {channelsByGroup.public.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Públicos</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {channelsByGroup.public.map((section) => (
                            <Card key={`public-${section.id}`} className="border-border/50 shadow-sm">
                              <CardHeader className="pb-2">
                                <CardDescription>Canal público</CardDescription>
                                <CardTitle className="text-base">
                                  <button
                                    type="button"
                                    onClick={() => setLocation(`/channels/${section.id}`)}
                                    className="text-left hover:text-primary transition-colors"
                                  >
                                    {section.name}
                                  </button>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <UserAvatar
                                    name={usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}
                                    src={usersById[section.creatorId]?.avatarUrl}
                                    size="sm"
                                  />
                                  <span>{usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {channelsByGroup.subscribed.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Inscrito</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {channelsByGroup.subscribed.map((section) => (
                            <Card key={`subscribed-${section.id}`} className="border-border/50 shadow-sm">
                              <CardHeader className="pb-2">
                                <CardDescription>Canal inscrito</CardDescription>
                                <CardTitle className="text-base">
                                  <button
                                    type="button"
                                    onClick={() => setLocation(`/channels/${section.id}`)}
                                    className="text-left hover:text-primary transition-colors"
                                  >
                                    {section.name}
                                  </button>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <UserAvatar
                                    name={usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}
                                    src={usersById[section.creatorId]?.avatarUrl}
                                    size="sm"
                                  />
                                  <span>{usersById[section.creatorId]?.name || `Usuário ${section.creatorId || "desconhecido"}`}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* References outside channels grouped by type */}
              {standaloneTypes.length > 0 && (
                <section>
                  <div className="space-y-8">
                    {standaloneTypes.map((section) => (
                      <div key={section.type}>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">{section.title}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {section.references.map((reference: any) => (
                            <Card key={`${section.type}-${reference.id}`} className="border-border/50 shadow-sm">
                              <CardHeader className="pb-2">
                                <CardDescription>{section.type}</CardDescription>
                                <CardTitle className="text-base">
                                  <button
                                    type="button"
                                    onClick={() => setLocation(`/references/${reference.id}?view=reading`)}
                                    className="text-left hover:text-primary transition-colors"
                                  >
                                    {reference.title}
                                  </button>
                                </CardTitle>
                              </CardHeader>
                              {reference.author ? (
                                <CardContent className="pt-0 text-sm text-muted-foreground">
                                  {reference.author}
                                </CardContent>
                              ) : null}
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
