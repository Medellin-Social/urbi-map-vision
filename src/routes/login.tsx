import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLogin } from "@/hooks/useAuth";
import { useLang } from "@/lib/i18n";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const K = {
  paper:    "#FAF8F5",
  surface:  "#F2ECE2",
  line:     "#E8E0D0",
  ink:      "#14201d",
  muted:    "#62736d",
  tertiary: "#9B8B75",
  teal:     "#1D9E75",
  tealDeep: "#085041",
  coral:    "#D85A30",
  coralLight: "#FAECE7",
  serif:    "'Fraunces', Georgia, serif",
  manrope:  "'Manrope', system-ui, sans-serif",
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
            style={{ color: K.teal, fontSize: 13, fontFamily: K.manrope, fontWeight: 600, textDecoration: "none" }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {error && <ErrorBanner message={error} />}
        <AuthButton disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Iniciar sesión"}
        </AuthButton>
        <p style={{ textAlign: "center", fontSize: 13, fontFamily: K.manrope, color: K.muted, margin: 0 }}>
          ¿No tienes cuenta?{" "}
          <Link to="/register" style={{ color: K.teal, fontWeight: 700, textDecoration: "none" }}>
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
        .auth-input::placeholder {
          color: #9aada6;
          font-weight: 400;
        }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: K.paper, fontFamily: K.manrope }}>
        {/* Left editorial column — desktop only */}
        <div
          className="hidden lg:flex"
          style={{
            width: "48%",
            position: "relative",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "56px 52px",
            overflow: "hidden",
          }}
        >
          {/* Photo */}
          <img
            src="https://images.unsplash.com/photo-1611271689035-e01d1e8e87a2?auto=format&fit=crop&w=1200&q=80"
            alt="Medellín"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
          />
          {/* Gradient overlay */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,30,22,.92) 0%, rgba(8,30,22,.55) 55%, rgba(20,32,29,.2) 100%)", zIndex: 1 }} />

          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, maxWidth: 400 }}>
            <div style={{ fontFamily: K.manrope, fontSize: ".62rem", fontWeight: 800, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: "1.8px", marginBottom: 20 }}>
              Medellín Social
            </div>
            {editorial && (
              <p style={{
                fontFamily: K.serif,
                fontSize: "clamp(1.6rem, 2.8vw, 2.2rem)",
                fontWeight: 900,
                color: "#fff",
                lineHeight: 1.15,
                letterSpacing: "-0.5px",
                marginBottom: 32,
                whiteSpace: "pre-line",
              }}>
                {editorial}
              </p>
            )}
            {/* Stats pills */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["54K+ propiedades", "606 barrios", "12K+ negocios"].map(s => (
                <span key={s} style={{ fontFamily: K.manrope, fontSize: ".68rem", fontWeight: 600, color: "rgba(255,255,255,.7)", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", padding: "4px 11px", borderRadius: 999 }}>
                  {s}
                </span>
              ))}
            </div>
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
            background: K.paper,
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

          {/* Form area — no white card, form sits on paper */}
          <div style={{ width: "100%", maxWidth: 400 }}>
            <h1 style={{
              fontFamily: K.serif,
              fontSize: "clamp(1.7rem, 3.5vw, 2rem)",
              fontWeight: 900,
              color: K.ink,
              margin: "0 0 8px 0",
              lineHeight: 1.1,
              letterSpacing: "-.5px",
            }}>
              {title}
            </h1>
            <p style={{ fontFamily: K.manrope, fontSize: 14, color: K.muted, margin: "0 0 36px 0", lineHeight: 1.6 }}>
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
  background: "#fff",
  border: "1px solid #E8E0D0",
  borderRadius: 10,
  padding: "13px 16px",
  color: "#14201d",
  fontFamily: "'Manrope', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 500,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "'Manrope', system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: "#62736d",
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          marginBottom: 7,
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
    <div style={{ display: "inline-flex", gap: 6 }}>
      {(["es", "en"] as const).map(l => (
        <button
          key={l}
          onClick={lang !== l ? toggle : undefined}
          title={l === "es" ? "Español (Colombia)" : "English (USA)"}
          style={{
            borderRadius: 999,
            border: `1.5px solid ${lang === l ? K.teal : K.line}`,
            background: lang === l ? "#E1F5EE" : K.paper,
            padding: "4px 8px",
            cursor: lang === l ? "default" : "pointer",
            fontSize: 18, lineHeight: 1,
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          {l === "es" ? "🇨🇴" : "🇺🇸"}
        </button>
      ))}
    </div>
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
        fontFamily: "'Manrope', system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: ".2px",
        border: "none",
        borderRadius: 999,
        padding: "14px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        transition: "background 0.15s",
        boxShadow: "0 4px 16px rgba(29,158,117,.25)",
      }}
    >
      {children}
    </button>
  );
}
