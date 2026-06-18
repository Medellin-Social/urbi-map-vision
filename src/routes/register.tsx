import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRegister } from "@/hooks/useAuth";
import { AuthShell } from "./login";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const MLS_PATHS = ["/map", "/listing", "/vender", "/agentes", "/planes"];

function getOrigenFromReferrer(): "mls" | "comunidad" {
  try {
    const stored = localStorage.getItem("registro_origen");
    if (stored === "mls" || stored === "comunidad") return stored;
    // Fallback: check document.referrer pathname for hard-navigations
    const ref = new URL(document.referrer || location.href).pathname;
    return MLS_PATHS.some((p) => ref.includes(p)) ? "mls" : "comunidad";
  } catch {
    return "comunidad";
  }
}

function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [origen, setOrigen] = useState<"mls" | "comunidad">("comunidad");

  useEffect(() => {
    setOrigen(getOrigenFromReferrer());
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Completa todos los campos.");
      return;
    }
    setError("");
    try {
      await register.mutateAsync({ email, password, nombre: name, origen });
      localStorage.removeItem("registro_origen");
      localStorage.removeItem("onboarding_complete");
      localStorage.setItem("onboarding_origen", origen);
      window.dispatchEvent(new CustomEvent("show-onboarding", { detail: { origen } }));
      navigate({ to: origen === "mls" ? "/map" : "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la cuenta.");
    }
  };

  return (
    <AuthShell title="Crear cuenta" subtitle="Inteligencia inmobiliaria de Medellín">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Nombre completo"
          />
        </Field>
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
            placeholder="Mínimo 8 caracteres"
          />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={register.isPending}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground glow-cyan disabled:opacity-60"
        >
          {register.isPending ? "Creando cuenta…" : "Crear cuenta"}
        </motion.button>
        <p className="text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthShell>
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
