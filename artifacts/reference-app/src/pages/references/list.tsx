import { useState } from "react";
import { Link } from "wouter";
import { useListReferences } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, Book, Music, PenTool, Library } from "lucide-react";
import { Input } from "@/components/ui/input";

const typeIcons: Record<string, React.ReactNode> = {
  BIBLE: <Book className="w-5 h-5" />,
  BOOK: <Library className="w-5 h-5" />,
  POEM: <PenTool className="w-5 h-5" />,
  MUSIC: <Music className="w-5 h-5" />,
  SERMON: <MessageSquare className="w-5 h-5" />,
};

import { MessageSquare } from "lucide-react";

export default function ReferencesList() {
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");
  
  const { data: references, isLoading } = useListReferences(filterType ? { type: filterType } : undefined);

  const filteredReferences = references?.filter(r => 
    r.title.toLowerCase().includes(search.toLowerCase()) || 
    r.author?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/50 pb-8">
          <div>
            <h1 className="text-4xl font-display font-bold mb-3">Library</h1>
            <p className="text-lg text-muted-foreground font-serif">Browse the core texts and references.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search titles or authors..." 
                className="pl-9 rounded-xl bg-card border-border/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select 
              className="h-10 rounded-xl bg-card border border-border/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="BIBLE">Bible</option>
              <option value="BOOK">Books</option>
              <option value="POEM">Poems</option>
              <option value="MUSIC">Music</option>
              <option value="SERMON">Sermons</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filteredReferences?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground font-serif text-lg">
            No references found matching your criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredReferences?.map((ref) => (
              <Link key={ref.id} href={`/references/${ref.id}`}>
                <Card className="h-full rounded-2xl border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 transition-all duration-300 cursor-pointer group bg-card overflow-hidden">
                  <div className="h-2 w-full bg-gradient-to-r from-primary/40 to-accent/40" />
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2.5 rounded-xl bg-secondary text-secondary-foreground">
                        {typeIcons[ref.type] || <Book className="w-5 h-5" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-background px-2 py-1 rounded-md border border-border/50">
                        {ref.type}
                      </span>
                    </div>
                    <CardTitle className="font-display text-xl leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {ref.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {ref.author && (
                      <p className="text-sm font-medium text-foreground/80 mb-2">{ref.author}</p>
                    )}
                    {ref.description && (
                      <p className="text-sm text-muted-foreground font-serif line-clamp-3 leading-relaxed">
                        {ref.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
