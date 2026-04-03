import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  fallbackClassName?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-lg",
  xl: "h-14 w-14 text-xl",
  "2xl": "h-16 w-16 text-2xl",
} as const;

const getInitials = (name?: string | null) => {
  const normalized = String(name || "").trim();
  if (!normalized) return "U";

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

export function UserAvatar({ name, src, size = "md", className, fallbackClassName }: UserAvatarProps) {
  const normalizedSrc = String(src || "").trim();

  return (
    <Avatar className={cn(sizeClasses[size], "rounded-full border border-border/60 shadow-sm", className)}>
      {normalizedSrc ? <AvatarImage src={normalizedSrc} alt={`Avatar de ${name || "Usuario"}`} className="object-cover" /> : null}
      <AvatarFallback className={cn("bg-primary/10 text-primary font-display font-bold", fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}