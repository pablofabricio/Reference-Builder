import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Compass, Feather } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-sidebar bg-texture flex flex-col font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--sidebar-accent))_0%,transparent_38%),radial-gradient(circle_at_85%_20%,hsl(var(--primary)/0.12)_0%,transparent_32%)] pointer-events-none z-0" />
      <header className="px-6 lg:px-12 py-6 flex items-center justify-between relative z-30">
        <div className="flex items-center gap-2 text-primary">
          <Compass className="w-8 h-8" />
          <span className="font-display font-bold text-2xl tracking-tight text-foreground">Reference</span>
        </div>
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" className="rounded-full px-5 text-sm font-medium cursor-pointer">
            <Link href="/login">
              Entrar
            </Link>
          </Button>
          <Button asChild className="rounded-full px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:-translate-y-0.5 cursor-pointer">
            <Link href="/register">
              Começar
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4">
            <Feather className="w-4 h-4" />
            <span>Um lugar tranquilo para estudo profundo</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold text-foreground leading-[1.1]">
            Leia, reflita e <br/>
            <span className="text-primary italic">conecte os pontos.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground font-serif max-w-2xl mx-auto leading-relaxed">
            Uma plataforma contemplativa para estudar textos sagrados, literatura e poesia.
            Construa um repositório pessoal de insights ou crie canais para explorar ideias profundas em conjunto.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href="/register">
              <Button size="lg" className="rounded-full px-8 h-14 text-base bg-foreground hover:bg-foreground/90 text-background shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
                Comece sua jornada
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
          className="w-full max-w-6xl mx-auto mt-24 px-4"
        >
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-black/10 border border-sidebar-border/70 aspect-video md:aspect-[21/9]">
            <div className="absolute inset-0 bg-gradient-to-t from-sidebar/80 via-transparent to-transparent z-10" />
            {/* abstract library representation */}
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-library.png`} 
              alt="Espaço sereno de estudo" 
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      </main>
      
      <footer className="py-12 text-center text-muted-foreground text-sm font-serif z-10 relative border-t border-sidebar-border/60 mt-10">
        <p>Um espaço para reflexão &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
