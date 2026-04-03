import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Home from "@/pages/home";
import ReferencesList from "@/pages/references/list";
import ReferenceDetail from "@/pages/references/detail";
import ReferenceCreate from "@/pages/references/create";
import NoteForm from "@/pages/notes/form";
import ChannelsList from "@/pages/channels/list";
import ChannelDetail from "@/pages/channels/detail";
import RequestsPage from "@/pages/requests";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Protected Route Wrapper
const ProtectedRoute = ({ component: Component, ...rest }: any) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  
  if (!isAuthenticated) {
    const nextPath = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/home";
    return <Redirect to={`/login?next=${encodeURIComponent(nextPath)}`} />;
  }
  
  return <Component {...rest} />;
};

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <Switch>
      <Route path="/">
        {isAuthenticated ? <Redirect to="/home" /> : <Landing />}
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/home" component={(props) => <ProtectedRoute component={Home} {...props} />} />
      
      <Route path="/references" component={(props) => <ProtectedRoute component={ReferencesList} {...props} />} />
      <Route path="/references/new" component={(props) => <ProtectedRoute component={ReferenceCreate} {...props} />} />
      <Route path="/references/:id" component={(props) => <ProtectedRoute component={ReferenceDetail} {...props} />} />
      
      <Route path="/notes">
        <Redirect to="/references" />
      </Route>
      <Route path="/notes/new" component={(props) => <ProtectedRoute component={NoteForm} {...props} />} />
      <Route path="/notes/:id/edit" component={(props) => <ProtectedRoute component={NoteForm} {...props} />} />
      
      <Route path="/channels" component={(props) => <ProtectedRoute component={ChannelsList} {...props} />} />
      <Route path="/channels/user/:userId" component={(props) => <ProtectedRoute component={ChannelsList} {...props} />} />
      <Route path="/channels/:id" component={(props) => <ProtectedRoute component={ChannelDetail} {...props} />} />
      <Route path="/requests" component={(props) => <ProtectedRoute component={RequestsPage} {...props} />} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
