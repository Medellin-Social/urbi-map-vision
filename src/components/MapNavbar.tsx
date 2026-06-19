import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, ArrowLeft, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { useIsPro } from "@/components/LockedField";
import type { Neighborhood } from "@/lib/adapters";

export type MapTab = "buy" | "rent" | "sell" | "agent" | "simulator" | "comparador";

const TABS: { id: MapTab; label: string; route?: string }[] = [
  { id: "buy",        label: "Comprar" },
  { id: "rent",       label: "Arrendar" },
  { id: "sell",       label: "Vender / Arrendar", route: "/vender" },
  { id: "agent",      label: "Agentes",            route: "/agentes" },
  { id: "simulator",  label: "Simulador",           route: "/simulador" },
  { id: "comparador", label: "Comparador",          route: "/comparador" },
];

type MapNavbarProps = {
  activeTab: MapTab;
  onTabChange: (tab: MapTab) => void;
  mlsBarrio?: Neighborhood | null;
  mlsTotal?: number;
  onBack?: () => void;
};

const C = {
  paper:    "#FAF7F2",
  tealDeep: "#085041",
  teal:     "#1D9E75",
  muted:    "#6B5B45",
  border:   "#E8E0D0",
  ink:      "#1A1208",
  coral:    "#D85A30",
  serif:    "'Fraunces', Georgia, serif" as const,
};

export function MapNavbar({ activeTab, onTabChange, mlsBarrio, mlsTotal, onBack }: MapNavbarProps) {
  const navigate = useNavigate();
  const { lang, toggle } = useLang();
  const isPro = useIsPro();
  const user = typeof window !== "undefined" ? auth.get() : null;

  const initials = (user?.name ?? "U")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      style={{
        position: "absolute", inset: "0 0 auto 0", zIndex: 30,
        background: C.paper,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "stretch",
        padding: "0 16px", height: 52, gap: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <Link
        to="/"
        style={{
          textDecoration: "none", display: "flex", alignItems: "center",
          flexShrink: 0, marginRight: 12,
        }}
      >
        <span style={{ fontFamily: C.serif, fontWeight: 900, fontSize: "1.05rem", color: C.ink, letterSpacing: "-0.5px" }}>
          Medellín <span style={{ color: C.teal }}>Social</span>
          <span style={{ color: C.coral }}>.</span>
        </span>
      </Link>

      {/* MLS back breadcrumb */}
      {mlsBarrio && (
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "4px 12px", alignSelf: "center",
            color: C.muted, fontSize: 12, fontWeight: 600,
            cursor: "pointer", marginRight: 12, flexShrink: 0,
          }}
        >
          <ArrowLeft size={13} />
          <span>{mlsBarrio.nombre}</span>
          {mlsTotal != null && mlsTotal > 0 && (
            <span style={{
              background: C.teal, color: "#fff",
              borderRadius: 999, padding: "1px 7px",
              fontSize: 10, fontWeight: 700,
            }}>
              {mlsTotal}
            </span>
          )}
        </button>
      )}

      {/* Tabs */}
      <nav style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;

          if (tab.route) {
            return (
              <button
                key={tab.id}
                onClick={() => navigate({ to: tab.route as any })}
                style={{
                  background: "none", border: "none", padding: "0 14px",
                  borderBottom: active ? `2px solid ${C.teal}` : "2px solid transparent",
                  color: active ? C.tealDeep : C.muted,
                  fontWeight: active ? 700 : 500,
                  fontSize: 13, cursor: "pointer",
                  transition: "color 0.15s",
                  letterSpacing: "0.1px",
                  flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 4,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = C.ink; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = active ? C.tealDeep : C.muted; }}
              >
                {tab.label}
                {tab.id === "simulator" && !isPro && (
                  <Lock size={10} style={{ opacity: 0.45, flexShrink: 0 }} />
                )}
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTab === "simulator" || activeTab === "comparador") {
                  navigate({ to: "/map" });
                } else {
                  onTabChange(tab.id);
                }
              }}
              style={{
                background: "none", border: "none", padding: "0 14px",
                borderBottom: active ? `2px solid ${C.teal}` : "2px solid transparent",
                color: active ? C.tealDeep : C.muted,
                fontWeight: active ? 700 : 500,
                fontSize: 13, cursor: "pointer",
                transition: "color 0.15s",
                letterSpacing: "0.1px",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = C.ink; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = C.muted; }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {/* Language */}
        <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={toggle}
              style={{
                border: "none",
                background: lang === l ? C.teal : "transparent",
                color: lang === l ? "#fff" : C.muted,
                padding: "3px 9px", fontWeight: 700,
                cursor: "pointer", fontSize: 11,
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {user ? (
          <>
            {/* Avatar */}
            <Link to="/perfil" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 27, height: 27, borderRadius: "50%",
                background: `linear-gradient(135deg, ${C.teal}, #085041)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, color: "#fff", overflow: "hidden", flexShrink: 0,
              }}>
                {user.avatar
                  ? <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initials}
              </div>
              <span style={{
                fontSize: 12, color: C.muted, fontWeight: 600,
                maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user.name}
              </span>
            </Link>

            {/* Logout */}
            <button
              onClick={() => { auth.clear(); navigate({ to: "/login" }); }}
              title="Salir"
              style={{
                background: "none", border: "none", color: C.muted,
                cursor: "pointer", display: "flex", alignItems: "center", padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.coral)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                fontSize: 12, color: C.muted, fontWeight: 600,
                textDecoration: "none", padding: "4px 8px",
              }}
            >
              Ingresar
            </Link>
            <Link
              to="/register"
              onClick={() => localStorage.setItem("registro_origen", "mls")}
              style={{
                fontSize: 12, fontWeight: 700, color: "#fff",
                background: C.teal, borderRadius: 6, padding: "4px 12px",
                textDecoration: "none",
              }}
            >
              Registrarse
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
