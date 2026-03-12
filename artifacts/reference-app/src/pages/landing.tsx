import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Compass, BookOpen, Users, Feather } from "lucide-react";
import heroImg from "../../public/images/hero-library.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background bg-texture flex flex-col font-sans">
      <header className="px-6 lg:px-12 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2 text-primary">
          <Compass className="w-8 h-8" />
          <span className="font-display font-bold text-2xl tracking-tight text-foreground">Reference</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <Link href="/register">
            <Button className="rounded-full px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:-translate-y-0.5">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 -mt-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4">
            <Feather className="w-4 h-4" />
            <span>A quiet place for deep study</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold text-foreground leading-[1.1]">
            Read, reflect, and <br/>
            <span className="text-primary italic">connect the dots.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground font-serif max-w-2xl mx-auto leading-relaxed">
            A contemplative platform designed for studying sacred texts, literature, and poetry. 
            Build a personal repository of insights, or form channels to explore profound ideas together.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href="/register">
              <Button size="lg" className="rounded-full px-8 h-14 text-base bg-foreground hover:bg-foreground/90 text-background shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
                Begin Your Journey
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
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-black/10 border border-border/50 aspect-video md:aspect-[21/9]">
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent z-10" />
            {/* abstract library representation */}
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-library.png`} 
              alt="Serene study space" 
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      </main>
      
      <footer className="py-12 text-center text-muted-foreground text-sm font-serif z-10 relative">
        <p>A place for reflection &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
