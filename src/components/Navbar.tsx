import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Calculator, GitCompare, LogOut, User } from "lucide-react";
import { auth, GOAL_LABEL } from "@/lib/auth";

export function Navbar() {
  const user = typeof window !== "undefined" ? auth.get() : null;
  const navigate = useNavigate();

  const initials = (user?.name ?? "U")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <Link to="/map" className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-surface/80 text-primary backdrop-blur-md ring-1 ring-border glow-cyan">
          <Building2 className="h-4 w-4" />
        </div>
        <span className="font-display text-base font-semibold tracking-tight">
          Urbi<span className="text-primary">data</span>
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          to="/calculadora"
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary backdrop-blur-md transition hover:bg-primary/20"
        >
          <Calculator className="h-3.5 w-3.5" />
          Calculadora 💰
        </Link>
        <Link
          to="/comparador"
          className="hidden items-center gap-1.5 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition hover:text-foreground sm:inline-flex"
        >
          <GitCompare className="h-3.5 w-3.5" />
          Comparador
        </Link>

        {user?.goal && (
          <span className="hidden items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {GOAL_LABEL[user.goal]}
          </span>
        )}

        <Link
          to="/perfil"
          title="Configuración de cuenta"
          className="flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pl-1 pr-3 backdrop-blur-md transition hover:border-primary/60 hover:bg-surface"
        >
          <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-bold text-background">
            {user?.avatar ? <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" /> : initials}
          </div>
          <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:block">
            {user?.name ?? "Invitado"}
          </span>
        </Link>
        <button
          onClick={() => {
            auth.clear();
            navigate({ to: "/login" });
          }}
          className="rounded-full border border-border bg-surface/80 p-1.5 text-muted-foreground backdrop-blur-md transition hover:text-danger"
          title="Salir"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

export function ProfileChipMobile() {
  const user = typeof window !== "undefined" ? auth.get() : null;
  if (!user?.goal) return null;
  return (
    <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 md:hidden">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-surface/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary backdrop-blur-md">
        <User className="h-3 w-3" />
        {GOAL_LABEL[user.goal]}
      </span>
    </div>
  );
}
