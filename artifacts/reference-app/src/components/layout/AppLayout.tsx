import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BookOpen, 
  Home, 
  LogOut, 
  Menu, 
  X,
  Compass,
  UserCircle2,
  Users,
  FilePlus2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadPendingRequests = async () => {
      if (!user?.id) {
        if (isMounted) setPendingRequestsCount(0);
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

        if (isMounted) {
          setPendingRequestsCount(rows.length);
        }
      } catch {
        if (isMounted) {
          setPendingRequestsCount(0);
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
  }, [location, user?.id]);

  const navItems = [
    { href: "/home", label: "Dashboard", icon: Home },
    { href: "/references", label: "Library", icon: BookOpen },
    { href: "/references/new", label: "Add Ref", icon: FilePlus2 },
    { href: "/requests", label: "Solicitacoes", icon: Users, badge: pendingRequestsCount },
    { href: "/channels", label: "Profile", icon: UserCircle2 },
  ];

  const DesktopSidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border relative z-10 items-center py-5">
      <div className="group relative mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/10 shadow-sm">
          <Compass className="w-5 h-5" />
        </div>
        <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg opacity-0 translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
          Reference
        </div>
      </div>

      <nav className="flex-1 flex flex-col items-center gap-3">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="group relative"
            >
              <div
                className={`
                  flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200
                  ${isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "border-transparent text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                {item.badge ? (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </div>
              <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg opacity-0 translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-col items-center gap-3 border-t border-sidebar-border pt-4 w-full">
        <div className="group relative">
          <UserAvatar
            name={user?.name}
            src={(user as any)?.avatar_url ?? (user as any)?.avatarUrl}
            size="lg"
            className="border-border bg-secondary"
            fallbackClassName="bg-secondary text-secondary-foreground"
          />
          <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 min-w-44 rounded-xl border border-border/60 bg-background/95 px-3 py-2 shadow-lg opacity-0 translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
            <p className="text-sm font-semibold truncate text-foreground font-sans">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate font-sans">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          onClick={() => logout()}
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
          <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg opacity-0 translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
            Sign Out
          </div>
        </button>
      </div>
    </div>
  );

  const MobileSidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border relative z-10">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-xl text-primary">
          <Compass className="w-6 h-6" />
        </div>
        <span className="font-display font-bold text-xl tracking-tight text-sidebar-foreground">
          Reference
        </span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                ${isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium font-sans">{item.label}</span>
              {item.badge ? (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-3 px-4 py-3 mb-2">
          <UserAvatar
            name={user?.name}
            src={(user as any)?.avatar_url ?? (user as any)?.avatarUrl}
            size="md"
            className="border-border bg-secondary"
            fallbackClassName="bg-secondary text-secondary-foreground"
          />
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate text-sidebar-foreground font-sans">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate font-sans">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded-xl"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          <span className="font-sans">Sign Out</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-24 flex-col fixed inset-y-0 left-0 z-50 overflow-visible">
        <DesktopSidebarContent />
      </aside>

      {/* Mobile Header & Nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-lg">Reference</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          >
            <div className="w-4/5 max-w-sm h-full pt-16 shadow-2xl">
              <MobileSidebarContent />
            </div>
            <div 
              className="absolute inset-y-0 right-0 left-[80%] max-w-[calc(100%-24rem)]" 
              onClick={() => setIsMobileMenuOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen md:pl-24 pt-16 md:pt-0">
        <div className="flex-1 w-full bg-texture">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
