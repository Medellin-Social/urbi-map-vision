import { Link } from "@tanstack/react-router";
import { Building2, ArrowRight } from "lucide-react";
import { LanguageToggle } from "@/lib/i18n";

const NAV_LINKS = [
  { label: "Invertir",   href: "/map" },
  { label: "Comunidad",  href: "/eventos/el-poblado" },
  { label: "Tiendas",    href: "/stores" },
  { label: "Agentes",    href: "/real-estate" },
] as const;

export function SiteNavbar({ transparent = false }: { transparent?: boolean }) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 ${
        transparent
          ? "bg-gradient-to-b from-black/60 via-black/20 to-transparent"
          : "border-b border-border/40 bg-background/95 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className={`grid h-8 w-8 place-items-center rounded-md ring-1 ${
              transparent
                ? "bg-white/10 text-white ring-white/20 backdrop-blur-sm"
                : "bg-primary/20 text-primary ring-primary/30"
            }`}
          >
            <Building2 className="h-4 w-4" />
          </div>
          <span
            className={`font-display text-base font-semibold tracking-tight ${transparent ? "text-white" : "text-foreground"}`}
            style={transparent ? { textShadow: "0 1px 8px rgba(0,0,0,0.8)" } : undefined}
          >
            Medellín <span className="text-primary">Social</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                transparent
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
              style={transparent ? { textShadow: "0 1px 4px rgba(0,0,0,0.8)" } : undefined}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            to="/login"
            className={`hidden rounded-md px-3 py-1.5 text-xs font-medium transition sm:inline-flex ${
              transparent
                ? "text-white/70 hover:text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
          >
            Comenzar <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
