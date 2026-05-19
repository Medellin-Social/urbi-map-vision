import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { AuthShell } from "./login";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Ingresa tu correo."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; reset_token: string | null }>(
        API_ENDPOINTS.forgotPassword,
        { method: "POST", body: JSON.stringify({ email }), skipAuth: true },
      );
      setResetToken(res.reset_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (resetToken) {
    return (
      <AuthShell title="Token generado" subtitle="Copia el token para restablecer tu contraseña">
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Token de recuperación (beta)
            </p>
            <p className="mt-2 break-all font-mono text-xs text-foreground">{resetToken}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              En producción esto llegaría a tu email. Válido por 1 hora.
            </p>
          </div>
          <Link
            to="/reset-password"
            search={{ token: resetToken }}
            className="block w-full rounded-md bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground glow-cyan"
          >
            Ir a restablecer contraseña →
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="¿Olvidaste tu contraseña?" subtitle="Te enviaremos instrucciones para recuperarla">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Correo registrado
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="tu@correo.com"
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground glow-cyan disabled:opacity-60"
        >
          {loading ? "Enviando…" : "Enviar instrucciones"}
        </motion.button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Volver al login
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
