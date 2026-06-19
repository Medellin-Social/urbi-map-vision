import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLogin } from "@/hooks/useAuth";
import { useLang } from "@/lib/i18n";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const K = {
  paper:    "#FAF7F2",
  surface:  "#F5F0E8",
  line:     "#E8E0D0",
  ink:      "#1A1208",
  muted:    "#6B5B45",
  tertiary: "#9B8B75",
  teal:     "#1D9E75",
  tealDeep: "#085041",
  coral:    "#D85A30",
  serif:    "'Fraunces', Georgia, serif",
  sans:     "'Inter', system-ui, sans-serif",
} as const;

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setError("");
    try {
      const res = await login.mutateAsync({ email, password });
      const hasProfile = !!res.perfil_inversor?.objetivo;
      navigate({ to: hasProfile ? "/map" : "/onboarding" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Credenciales inválidas.");
    }
  };

  return (
    <AuthShell
      title="Bienvenido de nuevo"
      subtitle="Ingresa a tu cuenta para continuar"
      editorial={"Tu ciudad, tus datos,\ntus decisiones."}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            placeholder="••••••••"
          />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            to="/forgot-password"
            style={{ color: K.teal, fontSize: 13, fontFamily: K.sans, textDecoration: "none" }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {error && <ErrorBanner message={error} />}
        <AuthButton disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Iniciar sesión"}
        </AuthButton>
        <p style={{ textAlign: "center", fontSize: 14, fontFamily: K.sans, color: K.muted, margin: 0 }}>
          ¿No tienes cuenta?{" "}
          <Link to="/register" style={{ color: K.teal, textDecoration: "none" }}>
            Regístrate
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  editorial,
  children,
}: {
  title: string;
  subtitle: string;
  editorial?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        .auth-input:focus {
          border-color: #1D9E75 !important;
          box-shadow: 0 0 0 3px rgba(29,158,117,0.12) !important;
          outline: none;
        }
        .auth-btn:hover:not(:disabled) {
          background: #085041 !important;
        }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: K.paper, fontFamily: K.sans }}>
        {/* Left editorial column — desktop only */}
        <div
          className="hidden lg:flex"
          style={{
            width: "50%",
            background: `linear-gradient(135deg, ${K.tealDeep} 0%, ${K.ink} 100%)`,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "48px 56px",
          }}
        >
          <div style={{ maxWidth: 400, textAlign: "center" }}>
            <div
              style={{
                fontFamily: K.serif,
                fontSize: "2.4rem",
                fontWeight: 900,
                color: "#fff",
                marginBottom: 24,
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              Medellín Social.
            </div>
            {editorial && (
              <p
                style={{
                  fontFamily: K.sans,
                  fontSize: 16,
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.65,
                  marginBottom: 48,
                  whiteSpace: "pre-line",
                }}
              >
                {editorial}
              </p>
            )}
            <p
              style={{
                fontFamily: K.sans,
                fontSize: 13,
                color: "rgba(255,255,255,0.52)",
                letterSpacing: "0.02em",
                margin: 0,
              }}
            >
              54,000+ propiedades · 606 barrios · 12,000+ negocios
            </p>
          </div>
        </div>

        {/* Right form column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            position: "relative",
          }}
        >
          {/* Language toggle */}
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <AuthLangToggle />
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ marginBottom: 28, textAlign: "center" }}>
            <span style={{ fontFamily: K.serif, fontSize: "1.7rem", fontWeight: 900, color: K.ink }}>
              Medellín Social.
            </span>
          </div>

          {/* Card */}
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 2px 12px rgba(26,18,8,0.06)",
              padding: 40,
            }}
          >
            <h1
              style={{
                fontFamily: K.serif,
                fontSize: 28,
                fontWeight: 900,
                color: K.ink,
                margin: "0 0 6px 0",
                lineHeight: 1.15,
              }}
            >
              {title}
            </h1>
            <p style={{ fontFamily: K.sans, fontSize: 14, color: K.muted, margin: "0 0 28px 0", lineHeight: 1.5 }}>
              {subtitle}
            </p>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#F5F0E8",
  border: "1px solid #E8E0D0",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#1A1208",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 500,
          color: "#6B5B45",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#FAECE7",
        border: "1px solid #D85A30",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
        color: "#8B2A10",
      }}
    >
      <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, color: "#D85A30" }} />
      {message}
    </div>
  );
}

function AuthLangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      title={lang === "es" ? "Switch to English" : "Cambiar a Español"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        border: `1px solid ${K.line}`,
        background: "#fff",
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: K.sans,
        cursor: "pointer",
        color: K.ink,
        boxShadow: "0 1px 4px rgba(26,18,8,0.06)",
        transition: "border-color 0.15s",
      }}
    >
      <span style={{ fontSize: 12 }}>🌐</span>
      <span style={{ color: lang === "es" ? K.teal : K.tertiary }}>ES</span>
      <span style={{ color: K.line, margin: "0 1px" }}>|</span>
      <span style={{ color: lang === "en" ? K.teal : K.tertiary }}>EN</span>
    </button>
  );
}

export function AuthButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="auth-btn"
      style={{
        width: "100%",
        background: "#1D9E75",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 15,
        fontWeight: 500,
        border: "none",
        borderRadius: 8,
        padding: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}
