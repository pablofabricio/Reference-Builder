import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { UserAvatar } from "@/components/ui/user-avatar";

type JoinRequest = {
  id: number;
  channel_id: number;
  requester_id: number;
  status: string;
  created_at?: string;
  reviewed_at?: string;
  reviewed_by?: number | null;
  channel?: {
    id: number;
    name?: string;
    visibility?: string;
  } | null;
  requester?: {
    id: number;
    name?: string;
    email?: string;
    avatar_url?: string;
    avatarUrl?: string;
  } | null;
  reviewer?: {
    id: number;
    name?: string;
    avatar_url?: string;
    avatarUrl?: string;
  } | null;
};

type UserSummary = {
  name?: string;
  avatarUrl?: string;
};

export default function RequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserSummary>>({});
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">(() => {
    if (typeof window === "undefined") return "incoming";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "outgoing" ? "outgoing" : "incoming";
  });

  useEffect(() => {
    const tab = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tab")
      : null;
    setActiveTab(tab === "outgoing" ? "outgoing" : "incoming");
  }, [location]);

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
          const id = Number(row?.id ?? 0);
          if (id > 0) {
            acc[id] = {
              name: typeof row?.name === "string" ? row.name : undefined,
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

  useEffect(() => {
    let isMounted = true;

    const loadRequests = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/channel-join-requests");
        if (!response.ok) throw new Error("Falha ao carregar solicitacoes");

        const payload = await response.json();
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];

        if (isMounted) {
          setRequests(rows);
        }
      } catch (error: any) {
        if (isMounted) {
          setRequests([]);
          toast({ title: error?.message || "Erro ao carregar solicitacoes", variant: "destructive" });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRequests();

    const refreshRequests = () => {
      loadRequests();
    };

    window.addEventListener("channel-requests-changed", refreshRequests);

    return () => {
      isMounted = false;
      window.removeEventListener("channel-requests-changed", refreshRequests);
    };
  }, [toast]);

  const incomingRequests = useMemo(
    () => requests.filter((request) => Number(request.requester_id) !== Number(user?.id)),
    [requests, user?.id],
  );

  const outgoingRequests = useMemo(
    () => requests.filter((request) => Number(request.requester_id) === Number(user?.id)),
    [requests, user?.id],
  );

  const handleReview = async (requestId: number, status: "APPROVED" | "REJECTED") => {
    setActingId(requestId);
    try {
      const response = await fetch(`/api/channel-join-requests/${requestId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel revisar a solicitacao");
      }

      const payload = await response.json();
      const updated = payload?.data ?? payload;

      setRequests((prev) => prev.map((request) => (Number(request.id) === Number(updated.id) ? updated : request)));
      window.dispatchEvent(new Event("channel-requests-changed"));
      toast({ title: status === "APPROVED" ? "Solicitacao aprovada" : "Solicitacao rejeitada" });
    } catch (error: any) {
      toast({ title: error?.message || "Erro ao revisar solicitacao", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (requestId: number) => {
    setActingId(requestId);
    try {
      const response = await fetch(`/api/channel-join-requests/${requestId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || "Nao foi possivel cancelar a solicitacao");
      }

      setRequests((prev) => prev.filter((request) => Number(request.id) !== requestId));
      window.dispatchEvent(new Event("channel-requests-changed"));
      toast({ title: "Solicitacao cancelada" });
    } catch (error: any) {
      toast({ title: error?.message || "Erro ao cancelar solicitacao", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const renderRequestCard = (request: JoinRequest, canReview: boolean) => {
    const status = String(request.status || "PENDING").toUpperCase();
    const channelName = String(request.channel?.name || `Canal ${request.channel_id}`);
    const requesterName = String(request.requester?.name || usersById[request.requester_id]?.name || `Usuario ${request.requester_id}`);
    const requesterAvatar = String(
      request.requester?.avatar_url ||
      request.requester?.avatarUrl ||
      usersById[request.requester_id]?.avatarUrl ||
      (Number(request.requester_id) === Number(user?.id)
        ? ((user as any)?.avatar_url || (user as any)?.avatarUrl || "")
        : "") ||
      "",
    ).trim();
    const createdAt = request.created_at ? new Date(request.created_at).toLocaleString("pt-BR") : null;
    const statusTone = status === "APPROVED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-amber-50 text-amber-700 border-amber-200";

    return (
      <Card key={request.id} className="rounded-2xl border-border/50 shadow-sm">
        <CardHeader className="px-5 pt-5 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex items-start gap-3">
              <UserAvatar
                name={requesterName}
                src={requesterAvatar}
                size="md"
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-2">
              <button
                type="button"
                className="block w-full text-left font-display text-xl leading-tight text-foreground hover:text-primary transition-colors truncate"
                onClick={() => setLocation(`/channels/${request.channel_id}`)}
              >
                {channelName}
              </button>
              <button
                type="button"
                className="block w-full text-left text-sm leading-relaxed text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setLocation(`/channels/user/${request.requester_id}`)}
              >
                {requesterName}
              </button>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusTone}`}>
              {status}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-5 pt-0 pb-5 space-y-3">
          {createdAt && (
            <p className="text-sm text-muted-foreground">
              Criada em {createdAt}
            </p>
          )}
          {canReview && status === "PENDING" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => handleReview(request.id, "APPROVED")}
                disabled={actingId === request.id}
              >
                {actingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                Aprovar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => handleReview(request.id, "REJECTED")}
                disabled={actingId === request.id}
              >
                <X className="w-4 h-4 mr-1" />
                Rejeitar
              </Button>
            </div>
          )}
          {!canReview && status === "PENDING" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => handleCancel(request.id)}
                disabled={actingId === request.id}
              >
                {actingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                Cancelar solicitacao
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-6">
        <div className="rounded-3xl border border-border/50 bg-card px-6 py-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Solicitacoes</h1>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = value === "outgoing" ? "outgoing" : "incoming";
              setActiveTab(nextTab);
              setLocation(`/requests?tab=${nextTab}`);
            }}
            className="space-y-4"
          >
            <TabsList className="rounded-2xl bg-card border border-border/50 h-auto p-1">
              <TabsTrigger value="incoming" className="rounded-xl px-4 py-2.5 gap-2">
                Recebidas
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground border border-border/50">{incomingRequests.length}</span>
              </TabsTrigger>
              <TabsTrigger value="outgoing" className="rounded-xl px-4 py-2.5 gap-2">
                Enviadas
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground border border-border/50">{outgoingRequests.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="incoming" className="mt-0 space-y-3">
              {incomingRequests.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground font-serif text-lg">Nenhuma solicitacao recebida.</div>
              ) : (
                incomingRequests.map((request) => renderRequestCard(request, true))
              )}
            </TabsContent>

            <TabsContent value="outgoing" className="mt-0 space-y-3">
              {outgoingRequests.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground font-serif text-lg">Nenhuma solicitacao enviada.</div>
              ) : (
                outgoingRequests.map((request) => renderRequestCard(request, false))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}