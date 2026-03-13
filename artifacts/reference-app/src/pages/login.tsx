import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Compass, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } }, {
      onSuccess: async (data: any) => {
        const token = data?.token || data?.access_token;

        if (!token) {
          toast({
            title: "Login failed",
            description: "Token nao retornado pela API.",
            variant: "destructive"
          });
          return;
        }

        let user = data?.user;
        if (!user) {
          const meResponse = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!meResponse.ok) {
            toast({
              title: "Login failed",
              description: "Nao foi possivel carregar o perfil do usuario.",
              variant: "destructive"
            });
            return;
          }

          user = await meResponse.json();
        }

        login(token, user);
        toast({ title: "Welcome back", description: "Successfully logged in." });
        setLocation("/home");
      },
      onError: (error: any) => {
        toast({ 
          title: "Login failed", 
          description: error?.response?.data?.error || "Invalid credentials",
          variant: "destructive" 
        });
      }
    });
  };

  return (
    <div className="min-h-screen flex bg-background bg-texture font-sans">
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 z-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="mb-10 text-center sm:text-left">
            <Link href="/" className="inline-flex items-center gap-2 text-primary mb-8 hover:opacity-80 transition-opacity">
              <Compass className="w-8 h-8" />
            </Link>
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Welcome back</h2>
            <p className="text-muted-foreground font-serif text-lg">Enter your details to continue reading.</p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-xl shadow-black/5 border border-border/50">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="scholar@example.com"
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background rounded-xl h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background rounded-xl h-12"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign in"}
              </Button>
            </form>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create one now
            </Link>
          </div>
        </motion.div>
      </div>
      
      {/* Decorative right side */}
      <div className="hidden lg:block relative w-0 flex-1 bg-secondary border-l border-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent mix-blend-multiply" />
        <div className="absolute inset-0 flex items-center justify-center p-24">
          <blockquote className="max-w-md text-center">
            <p className="text-3xl font-display italic text-foreground leading-relaxed">
              "The reading of all good books is like conversation with the finest men of past centuries."
            </p>
            <footer className="mt-6 font-serif text-muted-foreground text-lg">— Descartes</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
