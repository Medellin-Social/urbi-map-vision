import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRegister } from "@/hooks/useAuth";
import { AuthShell, Field, ErrorBanner, AuthButton, inputStyle } from "./login";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const MLS_PATHS = ["/map", "/listing", "/vender", "/planes"];

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
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Explora el mercado inmobiliario y la comunidad del Valle de Aburrá"
      editorial={"Únete a la comunidad que\nestá construyendo Medellín."}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="auth-input"
            style={inputStyle}
            placeholder="Nombre completo"
          />
        </Field>
        <Field label="Correo">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            style={inputStyle}
            placeholder="tu@correo.com"
          />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            style={inputStyle}
            placeholder="Mínimo 8 caracteres"
          />
        </Field>
        {error && <ErrorBanner message={error} />}
        <AuthButton disabled={register.isPending}>
          {register.isPending ? "Creando cuenta…" : "Crear cuenta →"}
        </AuthButton>
        <p style={{ textAlign: "center", fontSize: 13, fontFamily: "'Manrope', system-ui, sans-serif", color: "#62736d", margin: 0 }}>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" style={{ color: "#1D9E75", fontWeight: 700, textDecoration: "none" }}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
