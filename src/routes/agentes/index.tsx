import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ComunidadLayout } from "@/components/comunidad/ComunidadLayout";
import { API_ENDPOINTS } from "@/config/api";

export const Route = createFileRoute("/agentes/")({
  component: AgentesRoot,
  head: () => ({
    meta: [
      { title: "Agentes · Medellín Social" },
      {
        name: "description",
        content:
          "Directorio de agentes inmobiliarios verificados en el Valle de Aburrá con experiencia local comprobada.",
      },
    ],
  }),
});

function AgentesRoot() {
  return (
    <ComunidadLayout>
      <AgentesDirectorioPage />
    </ComunidadLayout>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const K = {
  paper:     "#FAF7F2",
  surface:   "#F5F0E8",
  line:      "#E9E4D8",
  ink:       "#1A1208",
  muted:     "#6B5B45",
  teal:      "#1D9E75",
  tealDeep:  "#085041",
  tealLight: "#E1F5EE",
  coral:     "#D85A30",
  white:     "#FFFFFF",
  serif:     "'Fraunces', Georgia, serif" as const,
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface Agente {
  id: number;
  nombre_completo: string;
  slug: string;
  foto_perfil: string | null;
  especialidad: string[] | null;
  tipo_inmueble: string[] | null;
  anos_experiencia: number | null;
  inmobiliaria_nombre: string | null;
  es_independiente: boolean;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  sitio_web: string | null;
  zonas_nombres: string[];
  precio_rango_min: number | null;
  precio_rango_max: number | null;
}

// ── Fallback hardcoded agents ──────────────────────────────────────────────────
const FALLBACK_AGENTS: Agente[] = [
  {
    id: -1,
    nombre_completo: "Ken Munro",
    slug: "ken-munro",
    foto_perfil: null,
    especialidad: ["Venta", "Arriendo"],
    tipo_inmueble: ["Apartamento", "Casa"],
    anos_experiencia: 20,
    inmobiliaria_nombre: "Medellín Social",
    es_independiente: false,
    whatsapp: "573001234567",
    linkedin: null,
    instagram: null,
    sitio_web: "https://medellinsocial.com",
    zonas_nombres: ["El Poblado", "Laureles", "Envigado"],
    precio_rango_min: 200_000_000,
    precio_rango_max: 2_000_000_000,
  },
  {
    id: -2,
    nombre_completo: "Kathy Munro",
    slug: "kathy-munro",
    foto_perfil: null,
    especialidad: ["Venta", "Arriendo"],
    tipo_inmueble: ["Apartamento", "Casa", "Lote"],
    anos_experiencia: 15,
    inmobiliaria_nombre: "Medellín Social",
    es_independiente: false,
    whatsapp: "573001234568",
    linkedin: null,
    instagram: null,
    sitio_web: "https://medellinsocial.com",
    zonas_nombres: ["Sabaneta", "La Estrella", "Itagüí"],
    precio_rango_min: 150_000_000,
    precio_rango_max: 1_500_000_000,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function formatCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  return `$${n.toLocaleString("es-CO")}`;
}

const ZONAS_OPCIONES = [
  "El Poblado",
  "Laureles",
  "Envigado",
  "Sabaneta",
  "Itagüí",
  "Bello",
  "La Estrella",
  "Castilla",
  "Robledo",
  "Belén",
];

// ── Main page ──────────────────────────────────────────────────────────────────
function AgentesDirectorioPage() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEsp, setFilterEsp] = useState("todos");
  const [filterIdioma, setFilterIdioma] = useState("todos");
  const [filterZona, setFilterZona] = useState("todos");
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_ENDPOINTS.agentesAprobadosFiltros())
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Agente[]) => {
        setAgentes(data.length > 0 ? data : FALLBACK_AGENTS);
      })
      .catch(() => setAgentes(FALLBACK_AGENTS))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return agentes.filter((a) => {
      if (filterEsp !== "todos") {
        const esp = (a.especialidad ?? []).map((e) => e.toLowerCase());
        if (!esp.some((e) => e.includes(filterEsp))) return false;
      }
      if (filterZona !== "todos") {
        const zonas = (a.zonas_nombres ?? []).map((z) => z.toLowerCase());
        if (!zonas.some((z) => z.includes(filterZona.toLowerCase()))) return false;
      }
      return true;
    });
  }, [agentes, filterEsp, filterZona]);

  return (
    <div style={{ background: K.paper, minHeight: "100vh" }}>
      {/* Hero */}
      <section style={{ padding: "72px 24px 56px", textAlign: "center", background: K.paper }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: K.muted,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Nuestros Agentes
        </p>
        <h1
          style={{
            fontFamily: K.serif,
            fontSize: "clamp(28px, 5vw, 48px)",
            fontWeight: 600,
            color: K.ink,
            maxWidth: 640,
            margin: "0 auto 16px",
            lineHeight: 1.15,
          }}
        >
          Encuentra tu experto inmobiliario en el Valle de Aburrá
        </h1>
        <p style={{ color: K.muted, fontSize: 16, maxWidth: 520, margin: "0 auto" }}>
          Agentes verificados por Medellín Social con experiencia local comprobada
        </p>
      </section>

      {/* Sticky filter bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: K.white,
          borderBottom: `1px solid ${K.line}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <FilterSelect
          label="Zona"
          value={filterZona}
          options={[
            { value: "todos", label: "Todas las zonas" },
            ...ZONAS_OPCIONES.map((z) => ({ value: z.toLowerCase(), label: z })),
          ]}
          open={openFilter === "zona"}
          onToggle={() => setOpenFilter(openFilter === "zona" ? null : "zona")}
          onChange={(v) => { setFilterZona(v); setOpenFilter(null); }}
        />
        <FilterSelect
          label="Especialidad"
          value={filterEsp}
          options={[
            { value: "todos", label: "Todas" },
            { value: "venta", label: "Venta" },
            { value: "arriendo", label: "Arriendo" },
            { value: "ambas", label: "Venta y Arriendo" },
          ]}
          open={openFilter === "esp"}
          onToggle={() => setOpenFilter(openFilter === "esp" ? null : "esp")}
          onChange={(v) => { setFilterEsp(v); setOpenFilter(null); }}
        />
        <FilterSelect
          label="Idioma"
          value={filterIdioma}
          options={[
            { value: "todos", label: "Todos" },
            { value: "espanol", label: "Español" },
            { value: "ingles", label: "Inglés" },
            { value: "biligue", label: "Bilingüe" },
          ]}
          open={openFilter === "idioma"}
          onToggle={() => setOpenFilter(openFilter === "idioma" ? null : "idioma")}
          onChange={(v) => { setFilterIdioma(v); setOpenFilter(null); }}
        />
        <span
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: K.muted,
            background: K.surface,
            padding: "4px 12px",
            borderRadius: 99,
            fontWeight: 500,
          }}
        >
          {filtered.length} agente{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: K.muted }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>No se encontraron agentes con esos filtros.</p>
            <button
              style={{ color: K.teal, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
              onClick={() => { setFilterEsp("todos"); setFilterZona("todos"); setFilterIdioma("todos"); }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 24,
            }}
          >
            {filtered.map((agente) => (
              <AgenteCard key={agente.id} agente={agente} />
            ))}
          </div>
        )}
      </section>

      {/* CTA bottom */}
      <section
        style={{
          background: K.tealDeep,
          padding: "64px 24px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: K.serif,
            fontSize: "clamp(22px, 4vw, 32px)",
            fontWeight: 600,
            color: K.white,
            marginBottom: 12,
          }}
        >
          ¿Eres agente inmobiliario?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 16, marginBottom: 32 }}>
          Únete a nuestra red de expertos verificados
        </p>
        <Link
          to="/agentes/registro"
          style={{
            display: "inline-block",
            background: K.coral,
            color: K.white,
            padding: "14px 32px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            textDecoration: "none",
          }}
        >
          Registrarme como agente →
        </Link>
      </section>
    </div>
  );
}

// ── AgenteCard ─────────────────────────────────────────────────────────────────
function AgenteCard({ agente }: { agente: Agente }) {
  const [hovered, setHovered] = useState(false);

  const role = agente.inmobiliaria_nombre
    ? `${agente.inmobiliaria_nombre}`
    : "Agente independiente";

  const especialidades = (agente.especialidad ?? []).join(" · ") || "Consultar";
  const zonas = (agente.zonas_nombres ?? []).slice(0, 3).join(" · ");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: K.white,
        border: `1px solid ${K.line}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "box-shadow 0.2s, transform 0.2s",
        boxShadow: hovered ? "0 8px 32px rgba(26,18,8,0.12)" : "0 2px 8px rgba(26,18,8,0.06)",
        transform: hovered ? "translateY(-2px) scale(1.005)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo */}
      <div
        style={{
          width: "100%",
          height: 220,
          background: K.surface,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {agente.foto_perfil ? (
          <img
            src={agente.foto_perfil}
            alt={agente.nombre_completo}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <InitialsAvatar name={agente.nombre_completo} size={80} />
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 20px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
        <h3
          style={{
            fontFamily: K.serif,
            fontSize: 20,
            fontWeight: 600,
            color: K.ink,
            margin: "0 0 4px",
          }}
        >
          {agente.nombre_completo}
        </h3>
        <p style={{ color: K.muted, fontSize: 13, margin: "0 0 16px" }}>{role}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, marginBottom: 20 }}>
          {zonas && (
            <DataRow icon="📍" text={zonas} />
          )}
          <DataRow icon="🏠" text={especialidades} />
          {agente.anos_experiencia && (
            <DataRow icon="⭐" text={`${agente.anos_experiencia} años de experiencia`} />
          )}
          {agente.precio_rango_min && agente.precio_rango_max && (
            <DataRow
              icon="💰"
              text={`${formatCOP(agente.precio_rango_min)} – ${formatCOP(agente.precio_rango_max)}`}
            />
          )}
        </div>

        <Link
          to="/agentes/$slug"
          params={{ slug: agente.slug }}
          style={{
            display: "block",
            textAlign: "center",
            background: K.teal,
            color: K.white,
            padding: "10px 0",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Ver perfil →
        </Link>
      </div>
    </div>
  );
}

// ── FilterSelect ───────────────────────────────────────────────────────────────
interface FilterOption { value: string; label: string }

function FilterSelect({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  open: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          border: `1px solid ${open ? K.teal : K.line}`,
          borderRadius: 8,
          background: open ? K.tealLight : K.white,
          color: K.ink,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}: <span style={{ color: K.teal }}>{selected?.label ?? label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: K.white,
            border: `1px solid ${K.line}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 100,
            minWidth: 180,
            overflow: "hidden",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                background: opt.value === value ? K.tealLight : "transparent",
                color: opt.value === value ? K.teal : K.ink,
                fontSize: 13,
                border: "none",
                cursor: "pointer",
                fontWeight: opt.value === value ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function DataRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: K.muted, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function InitialsAvatar({ name, size }: { name: string; size: number }) {
  const initials = getInitials(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: K.tealLight,
        border: `2px solid ${K.teal}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: K.serif,
        fontSize: size * 0.35,
        fontWeight: 600,
        color: K.tealDeep,
      }}
    >
      {initials}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: K.white,
        border: `1px solid ${K.line}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 220, background: K.surface }} />
      <div style={{ padding: 20 }}>
        <div style={{ height: 20, background: K.surface, borderRadius: 4, marginBottom: 8, width: "60%" }} />
        <div style={{ height: 14, background: K.surface, borderRadius: 4, marginBottom: 16, width: "40%" }} />
        <div style={{ height: 12, background: K.surface, borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 12, background: K.surface, borderRadius: 4, marginBottom: 6, width: "80%" }} />
        <div style={{ height: 38, background: K.surface, borderRadius: 8, marginTop: 20 }} />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 24,
      }}
    >
      {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
    </div>
  );
}
