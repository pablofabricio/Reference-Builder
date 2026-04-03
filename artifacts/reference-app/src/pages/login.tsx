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
        const token = data?.token || data?.access_token || data?.data?.token || data?.data?.access_token;

        if (!token) {
          toast({
            title: "Falha no login",
            description: "Token não retornado pela API.",
            variant: "destructive"
          });
          return;
        }

        let user = data?.user || data?.data?.user;
        if (!user) {
          const meResponse = await fetch('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!meResponse.ok) {
            toast({
              title: "Falha no login",
              description: "Não foi possível carregar o perfil do usuário.",
              variant: "destructive"
            });
            return;
          }

          const mePayload = await meResponse.json();
          user = mePayload?.data ?? mePayload;
        }

        login(token, user);
        toast({ title: "Bem-vindo de volta", description: "Login realizado com sucesso." });
        const nextPath = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
        const safeNextPath = nextPath && nextPath.startsWith("/") ? nextPath : "/home";
        setLocation(safeNextPath);
      },
      onError: (error: any) => {
        toast({ 
          title: "Falha no login", 
          description: error?.response?.data?.error || "Credenciais inválidas",
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
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Bem-vindo de volta</h2>
            <p className="text-muted-foreground font-serif text-lg">Informe seus dados para continuar lendo.</p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-xl shadow-black/5 border border-border/50">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
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
                <Label htmlFor="password">Senha</Label>
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
                {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar"}
              </Button>
            </form>
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Crie agora
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
              "A leitura de todos os bons livros é como conversar com os melhores homens dos séculos passados."
            </p>
            <footer className="mt-6 font-serif text-muted-foreground text-lg">— Descartes</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
