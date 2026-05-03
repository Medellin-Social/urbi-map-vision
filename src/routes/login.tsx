import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { auth } from "@/lib/auth";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const existing = auth.get();
    if (existing && existing.email === email) {
      navigate({ to: existing.goal ? "/map" : "/onboarding" });
      return;
    }
    if (!email || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    // Mock login: accept anything, create a user shell
    auth.set({ name: email.split("@")[0], email });
    navigate({ to: "/onboarding" });
  };

  return (
    <AuthShell title="Iniciar sesión" subtitle="Bienvenido de vuelta a Urbidata">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Correo">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="tu@correo.com"
          />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="••••••••"
          />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground glow-cyan"
        >
          Entrar
        </motion.button>
        <p className="text-center text-xs text-muted-foreground">
          ¿Sin cuenta?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Crear una cuenta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Background grid + glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(0,212,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-8 backdrop-blur-xl"
      >
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Urbidata</span>
        </div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
