import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Check,
  CreditCard,
  Heart,
  History,
  Map as MapIcon,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  TrendingUp,
  User as UserIcon,
  X,
} from "lucide-react";
import {
  auth,
  GOAL_LABEL,
  MAP_STYLES,
  type Budget,
  type Goal,
  type MapStyleId,
  type PaymentMethod,
  type PerfilBusqueda,
  type Risk,
  type UrbiUser,
} from "@/lib/auth";
import { useUpdateAuthPerfil } from "@/hooks/useAuth";
import { useTarget } from "@/contexts/TargetContext";
import { useFavoritos, useToggleFavorito, useHistorial } from "@/hooks/useUser";
import {
  SCORE_PALETTES,
  getActivePaletteId,
  setActivePalette,
  type ScorePaletteId,
} from "@/config/mapColors";
import { Navbar } from "@/components/Navbar";
import { formatCOP } from "@/lib/format";

export const Route = createFileRoute("/perfil")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("medellin-social.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: PerfilPage,
});

type Tab = "cuenta" | "busqueda" | "inversor" | "pagos" | "favoritos" | "historial" | "mapa";

const TABS: { id: Tab; label: string; Icon: typeof UserIcon }[] = [
  { id: "cuenta", label: "Cuenta", Icon: UserIcon },
  { id: "busqueda", label: "Perfil de búsqueda", Icon: Search },
  { id: "inversor", label: "Perfil inversor", Icon: TrendingUp },
  { id: "pagos", label: "Métodos de pago", Icon: CreditCard },
  { id: "favoritos", label: "Favoritos", Icon: Heart },
  { id: "historial", label: "Historial", Icon: History },
  { id: "mapa", label: "Configuración mapa", Icon: MapIcon },
];

function PerfilPage() {
  const [tab, setTab] = useState<Tab>("cuenta");
  const [user, setUser] = useState<UrbiUser | null>(() => auth.get());

  useEffect(() => {
    const sync = () => setUser(auth.get());
    window.addEventListener("medellin-social:user", sync);
    return () => window.removeEventListener("medellin-social:user", sync);
  }, []);

  if (!user) return null;

  return (
    <div className="relative min-h-screen bg-[#FAF7F2]">
      <Navbar />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#FAF7F2]/80 to-transparent" />

      <main className="perfil-light mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
        <Link
          to="/map"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al mapa
        </Link>

        <div className="mt-4 flex items-center gap-1.5 text-[#9B8B75]">
          <Settings className="h-3 w-3" />
          <h1 className="text-[11px] font-bold uppercase tracking-[0.15em]">Configuración</h1>
        </div>

        <ProfileHeader user={user} />

        <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
          {/* Sidebar tabs */}
          <aside className="flex flex-row gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`group flex items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition ${
                    active
                      ? "border-[#1D9E75]/50 border-l-[3px] border-l-[#1D9E75] bg-[#E1F5EE] text-[#085041] font-semibold"
                      : "border-transparent bg-transparent text-[#6B5B45] hover:bg-[#F5F0E8] hover:text-[#1A1208]"
                  }`}
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <section className="rounded-2xl p-5 sm:p-6" style={{ background: '#FFFFFF', border: '0.5px solid #E8E0D0', boxShadow: '0 1px 3px rgba(26,18,8,0.05)' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {tab === "cuenta" && <CuentaTab user={user} />}
                {tab === "busqueda" && <BusquedaTab user={user} />}
                {tab === "inversor" && <InversorTab user={user} />}
                {tab === "pagos" && <PagosTab user={user} />}
                {tab === "favoritos" && <FavoritosTab user={user} />}
                {tab === "historial" && <HistorialTab user={user} />}
                {tab === "mapa" && <MapaTab user={user} />}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ---------------- Header ---------------- */

const PLAN_LABEL: Record<string, string> = { pro: "Pro", agente: "Agente" };

// Agrupa favoritos por comuna (o municipio si la comuna no aplica, p.ej. otros
// municipios del Valle) — el "huella" es literalmente un eco comprimido del mapa,
// construido con la actividad real del usuario, no un contador genérico.
function zonaFootprint(favs: { comuna?: string | null; municipio?: string | null }[]) {
  const counts = new Map<string, number>();
  for (const f of favs) {
    const key = f.comuna || f.municipio || "Otra zona";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function ProfileHeader({ user }: { user: UrbiUser }) {
  const { data: favs } = useFavoritos();
  const { data: hist } = useHistorial();
  const initials = user.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const perfilInfo = user.perfilBusqueda ? BUSQUEDA_OPTIONS.find((o) => o.value === user.perfilBusqueda) : null;
  const footprint = zonaFootprint(favs ?? []);
  const maxCount = footprint[0]?.[1] ?? 1;

  return (
    <div
      className="mt-6 overflow-hidden rounded-2xl"
      style={{ background: "#FFFFFF", border: "0.5px solid #E8E0D0", boxShadow: "0 1px 3px rgba(26,18,8,0.05)" }}
    >
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#1D9E75] to-[#085041] text-xl font-bold text-[#E1F5EE] ring-2 ring-[#1D9E75]/30">
            {user.avatar ? <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" /> : initials || "U"}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[#1A1208]">{user.name}</h2>
              {user.plan && PLAN_LABEL[user.plan] && (
                <span className="rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A6D1D]">
                  {PLAN_LABEL[user.plan]}
                </span>
              )}
            </div>
            <div className="text-xs text-[#6B5B45]">{user.email}</div>
            {perfilInfo && (
              <div className="mt-1 text-[11px] font-medium text-[#1D9E75]">
                {perfilInfo.icon} {perfilInfo.title}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-6 sm:gap-8">
          <StatBlock label="Barrios guardados" value={favs?.length ?? 0} />
          <StatBlock label="Actividad reciente" value={hist?.length ?? 0} />
        </div>
      </div>

      {/* Huella en el Valle de Aburrá — un eco del mapa, no una estadística genérica */}
      <div className="border-t px-6 py-3.5" style={{ borderColor: "#F0EBE1", background: "#FDFBF7" }}>
        {footprint.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9B8B75]">
              Tu huella en el Valle de Aburrá
            </span>
            <div className="flex flex-wrap gap-1.5">
              {footprint.slice(0, 8).map(([zona, count]) => (
                <span
                  key={zona}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    // Capped at alpha 0.5 so #085041 text stays WCAG AA (4.5:1+) at every intensity.
                    background: `rgba(29,158,117,${0.12 + 0.38 * (count / maxCount)})`,
                    color: "#085041",
                  }}
                >
                  {zona} · {count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-[11px] text-[#9B8B75]">
            <span>Aún no guardas zonas. Toca ⭐ en un barrio del mapa para empezar tu huella.</span>
            <Link to="/map" className="shrink-0 font-semibold text-[#1D9E75] hover:underline">
              Ir al mapa →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center sm:text-right">
      <div className="font-display text-2xl font-bold text-[#1A1208]">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[#6B5B45]">{label}</div>
    </div>
  );
}

/* ---------------- Cuenta ---------------- */

function CuentaTab({ user }: { user: UrbiUser }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const initials = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const onPickFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (pwd && pwd !== pwd2) return alert("Las contraseñas no coinciden");
    auth.patch({
      name: name.trim(),
      email: email.trim(),
      avatar,
      ...(pwd ? { password: pwd } : {}),
    });
    setPwd("");
    setPwd2("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Cuenta" hint="Foto, nombre, correo y contraseña." />

      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#1D9E75] to-[#085041] text-2xl font-bold text-[#E1F5EE] ring-2 ring-[#1D9E75]/40">
            {avatar ? <img src={avatar} alt="avatar" className="h-full w-full object-cover" /> : initials || "U"}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-primary transition hover:bg-primary hover:text-primary-foreground"
            title="Cambiar foto"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
          />
        </div>

        <div className="text-xs text-muted-foreground">
          PNG o JPG. La imagen se guarda solo en tu dispositivo.
          {avatar && (
            <button
              onClick={() => setAvatar(undefined)}
              className="ml-3 inline-flex items-center gap-1 text-danger hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Quitar
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Correo">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Nueva contraseña">
          <input className={inputCls} type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Dejar en blanco para no cambiar" />
        </Field>
        <Field label="Confirmar contraseña">
          <input className={inputCls} type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan">
          Guardar cambios
        </button>
        {saved && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-success">
            ✓ Guardado
          </motion.span>
        )}
        <button
          onClick={() => {
            if (confirm("¿Cerrar sesión?")) {
              auth.clear();
              navigate({ to: "/login" });
            }
          }}
          className="ml-auto text-xs text-muted-foreground hover:text-danger"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ---------------- Búsqueda ---------------- */

const BUSQUEDA_OPTIONS: { value: PerfilBusqueda; icon: string; title: string; hint: string }[] = [
  { value: "comprador", icon: "🏠", title: "Comprar o arrendar", hint: "Busco una propiedad para vivir en el Valle de Aburrá" },
  { value: "inversor", icon: "📈", title: "Invertir en finca raíz", hint: "Analizo rentabilidad, yields y oportunidades" },
  { value: "vendedor", icon: "🏡", title: "Vender mi propiedad", hint: "Quiero publicar y conectar con compradores" },
  { value: "agente", icon: "🤝", title: "Soy agente inmobiliario", hint: "Uso las herramientas profesionales del MLS" },
];

const PERFIL_TO_TARGET: Record<PerfilBusqueda, "buyer" | "investor" | "seller" | null> = {
  comprador: "buyer",
  inversor: "investor",
  vendedor: "seller",
  agente: null,
};

function BusquedaTab({ user }: { user: UrbiUser }) {
  const [selected, setSelected] = useState<PerfilBusqueda | null>(
    (user.perfilBusqueda as PerfilBusqueda) ?? null
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<"ok" | "err" | null>(null);
  const updatePerfil = useUpdateAuthPerfil();
  const { setTarget } = useTarget();

  async function save(perfil: PerfilBusqueda) {
    setSelected(perfil);
    setSaving(true);
    try {
      await updatePerfil.mutateAsync({ perfil_busqueda: perfil });
      auth.patch({ perfilBusqueda: perfil });
      const target = PERFIL_TO_TARGET[perfil];
      if (target) setTarget(target as never);
      setToast("ok");
    } catch {
      setToast("err");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="¿Qué estás buscando?"
        hint="Personalizamos el mapa y las recomendaciones según tu perfil."
      />

      <div className="space-y-2.5">
        {BUSQUEDA_OPTIONS.map((o) => {
          const active = selected === o.value;
          return (
            <button
              key={o.value}
              onClick={() => !saving && save(o.value)}
              disabled={saving}
              className="flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition disabled:opacity-60"
              style={{
                background: "#FFFFFF",
                borderColor: active ? "#1D9E75" : "#E8E0D0",
                boxShadow: active ? "0 0 0 1px #1D9E75" : "none",
              }}
            >
              <span className="mt-0.5 text-xl leading-none">{o.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#1A1208]">{o.title}</span>
                  {active && <Check className="h-4 w-4 text-[#1D9E75]" />}
                </div>
                <p className="mt-0.5 text-xs text-[#6B5B45]">{o.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {toast === "ok" && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-success">
            ✅ Perfil actualizado
          </motion.span>
        )}
        {toast === "err" && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-danger">
            ❌ Error al guardar. Intenta de nuevo.
          </motion.span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Inversor ---------------- */

const N_UNIDADES_OPTS = [
  { v: "1 unit — personal", label: "1 unidad" },
  { v: "2-5 units — small portfolio", label: "2-5 unidades" },
  { v: "5+ units — full portfolio", label: "5+ unidades" },
];
const TIPO_GESTION_OPTS = [
  { v: "Self-managed", label: "Self-managed" },
  { v: "Hire property manager", label: "Con administrador" },
  { v: "Not sure yet", label: "No sé aún" },
];
const TARGET_INQUILINO_OPTS = [
  { v: "Digital nomads & remote workers", label: "Nómadas digitales" },
  { v: "Local executives & professionals", label: "Ejecutivos locales" },
  { v: "Students", label: "Estudiantes" },
  { v: "Flexible — any", label: "Flexible" },
];
const AMOBLADO_OPTS = [
  { v: "Fully furnished (higher rent)", label: "Amoblado (renta premium)" },
  { v: "Unfurnished (easier to find)", label: "Sin amueblar" },
  { v: "Flexible", label: "Flexible" },
];
const TIPO_PAGO_OPTS = [
  { v: "Cash — full payment", label: "Contado" },
  { v: "Mortgage/financing", label: "Crédito hipotecario" },
  { v: "Not sure yet", label: "No sé aún" },
];
const HORIZONTE_OPTS = [
  { v: "5 years", label: "5 años" },
  { v: "10 years", label: "10 años" },
  { v: "20+ years — long term", label: "20+ años" },
];

function InversorTab({ user }: { user: UrbiUser }) {
  const [budget, setBudget] = useState<Budget | undefined>(user.budget);
  const [goal, setGoal] = useState<Goal | undefined>(user.goal);
  const [risk, setRisk] = useState<Risk | undefined>(user.risk);
  const [nUnidades, setNUnidades] = useState(user.nUnidades ?? "");
  const [tipoGestion, setTipoGestion] = useState(user.tipoGestion ?? "");
  const [targetInquilino, setTargetInquilino] = useState(user.targetInquilino ?? "");
  const [amoblado, setAmoblado] = useState(user.amoblado ?? "");
  const [tipoPago, setTipoPago] = useState(user.tipoPago ?? "");
  const [horizonteInversion, setHorizonteInversion] = useState(user.horizonteInversion ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<"ok" | "err" | null>(null);

  function changeGoal(g: Goal) {
    setGoal(g);
    setNUnidades("");
    setTipoGestion("");
    setTargetInquilino("");
    setAmoblado("");
    setTipoPago("");
    setHorizonteInversion("");
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(API_ENDPOINTS.perfil, {
        method: "PUT",
        body: JSON.stringify({
          objetivo: goal ?? null,
          perfil_riesgo: risk ?? null,
          presupuesto: budget ?? null,
          n_unidades: goal === "airbnb" ? nUnidades || null : null,
          tipo_gestion: goal === "airbnb" ? tipoGestion || null : null,
          target_inquilino: goal === "mediano_plazo" ? targetInquilino || null : null,
          amoblado: goal === "mediano_plazo" ? amoblado || null : null,
          tipo_pago: goal === "renta-larga" ? tipoPago || null : null,
          horizonte_inversion: goal === "renta-larga" ? horizonteInversion || null : null,
        }),
      });
      auth.patch({
        budget,
        goal,
        risk,
        nUnidades: goal === "airbnb" ? nUnidades || undefined : undefined,
        tipoGestion: goal === "airbnb" ? tipoGestion || undefined : undefined,
        targetInquilino: goal === "mediano_plazo" ? targetInquilino || undefined : undefined,
        amoblado: goal === "mediano_plazo" ? amoblado || undefined : undefined,
        tipoPago: goal === "renta-larga" ? tipoPago || undefined : undefined,
        horizonteInversion: goal === "renta-larga" ? horizonteInversion || undefined : undefined,
      });
      window.dispatchEvent(new CustomEvent("perfil-updated", { detail: auth.get() }));
      setDirty(false);
      setToast("ok");
    } catch {
      setToast("err");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="Perfil inversor" hint="Editamos tus filtros y recomendaciones del mapa." />

      <Field label="Presupuesto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["<200", "200-500", "500-1000", ">1000"] as Budget[]).map((b) => (
            <Pill key={b} active={budget === b} onClick={() => { setBudget(b); setDirty(true); }}>
              {b === "<200" ? "< $200M" : b === "200-500" ? "$200–500M" : b === "500-1000" ? "$500M–1.000M" : "> $1.000M"}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label="Objetivo">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(GOAL_LABEL) as Goal[]).filter((g) => g !== "valorizacion").map((g) => (
            <Pill key={g} active={goal === g} onClick={() => changeGoal(g as Goal)}>{GOAL_LABEL[g]}</Pill>
          ))}
        </div>
      </Field>

      {goal === "airbnb" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unidades">
            <select className={inputCls} value={nUnidades} onChange={(e) => { setNUnidades(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {N_UNIDADES_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Gestión">
            <select className={inputCls} value={tipoGestion} onChange={(e) => { setTipoGestion(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {TIPO_GESTION_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      )}

      {goal === "mediano_plazo" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inquilino objetivo">
            <select className={inputCls} value={targetInquilino} onChange={(e) => { setTargetInquilino(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {TARGET_INQUILINO_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Amoblado">
            <select className={inputCls} value={amoblado} onChange={(e) => { setAmoblado(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {AMOBLADO_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      )}

      {goal === "renta-larga" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forma de pago">
            <select className={inputCls} value={tipoPago} onChange={(e) => { setTipoPago(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {TIPO_PAGO_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Horizonte de inversión">
            <select className={inputCls} value={horizonteInversion} onChange={(e) => { setHorizonteInversion(e.target.value); setDirty(true); }}>
              <option value="">Seleccionar…</option>
              {HORIZONTE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      )}

      <Field label="Perfil de riesgo">
        <div className="grid grid-cols-3 gap-2">
          {(["conservador", "moderado", "agresivo"] as Risk[]).map((r) => (
            <Pill key={r} active={risk === r} onClick={() => { setRisk(r); setDirty(true); }}>
              <span className="capitalize">{r}</span>
            </Pill>
          ))}
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        )}
        {toast === "ok" && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-success">
            ✅ Perfil actualizado
          </motion.span>
        )}
        {toast === "err" && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-xs text-danger">
            ❌ Error al guardar. Intenta de nuevo.
          </motion.span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Pagos ---------------- */

function PagosTab({ user }: { user: UrbiUser }) {
  const [list, setList] = useState<PaymentMethod[]>(user.payments ?? []);
  const [adding, setAdding] = useState(false);

  const persist = (next: PaymentMethod[]) => {
    setList(next);
    auth.patch({ payments: next });
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Métodos de pago"
        hint="Tarjetas y métodos para suscripciones premium y reportes."
      />

      <div className="space-y-2">
        {list.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aún no tienes métodos de pago guardados.
          </div>
        )}
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#E8E0D0] bg-[#FAF7F2] p-3">
            <div className="grid h-10 w-14 place-items-center rounded-md bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{p.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {p.type.toUpperCase()}{p.last4 ? ` · •••• ${p.last4}` : ""}{p.holder ? ` · ${p.holder}` : ""}
              </div>
            </div>
            <button
              onClick={() => persist(list.filter((x) => x.id !== p.id))}
              className="text-muted-foreground transition hover:text-danger"
              title="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar método de pago
      </button>

      <p className="text-[11px] text-muted-foreground">
        🔒 Demo: los datos se guardan localmente. Próximamente integraremos pasarela segura.
      </p>

      <AnimatePresence>
        {adding && (
          <AddPaymentModal
            onClose={() => setAdding(false)}
            onAdd={(p) => {
              persist([...list, p]);
              setAdding(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPaymentModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: PaymentMethod) => void }) {
  const [type, setType] = useState<PaymentMethod["type"]>("card");
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");

  const submit = () => {
    const last4 = number.replace(/\s+/g, "").slice(-4);
    onAdd({
      id: crypto.randomUUID(),
      type,
      label: label || (type === "card" ? "Tarjeta" : type === "pse" ? "PSE" : "Nequi"),
      holder: holder || undefined,
      last4: type === "card" && last4 ? last4 : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6"
      >
        <button onClick={onClose} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <h3 className="font-display text-lg font-semibold">Nuevo método de pago</h3>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["card", "pse", "nequi"] as const).map((t) => (
              <Pill key={t} active={type === t} onClick={() => setType(t)}>
                {t === "card" ? "Tarjeta" : t.toUpperCase()}
              </Pill>
            ))}
          </div>
          <Field label="Nombre / Etiqueta">
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tarjeta principal" />
          </Field>
          <Field label="Titular">
            <input className={inputCls} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nombre completo" />
          </Field>
          {type === "card" && (
            <Field label="Número (últimos 4 visibles)">
              <input
                className={inputCls}
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, "").slice(0, 19))}
                placeholder="•••• •••• •••• 1234"
              />
            </Field>
          )}
          <button onClick={submit} className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan">
            Guardar método
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Favoritos ---------------- */

function FavoritosTab({ user: _user }: { user: UrbiUser }) {
  const { data: favs = [], isLoading, isError } = useFavoritos();
  const { remove } = useToggleFavorito();

  return (
    <div className="space-y-5">
      <SectionTitle title="Favoritos" hint="Barrios guardados con tu configuración exacta." />
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Cargando favoritos...</div>
      ) : isError ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Error al cargar favoritos. Verifica tu conexión.
        </div>
      ) : favs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sin favoritos aún. Toca el ⭐ en un barrio para guardarlo.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {favs.map((f) => (
            <div
              key={f.id}
              className="overflow-hidden rounded-2xl border border-[#E8E0D0] bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1A1208]/5"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-[#9B8B75]">
                      {f.municipio ?? "Barrio"}
                    </div>
                    <div className="mt-0.5 truncate font-display text-lg font-semibold text-[#1A1208]">
                      {f.nombre ?? `Barrio ${f.barrio_id}`}
                    </div>
                    {f.comuna && (
                      <div className="text-[11px] text-[#6B5B45]">{f.comuna}</div>
                    )}
                  </div>
                  <button
                    onClick={() => remove.mutate(f.barrio_id)}
                    disabled={remove.isPending}
                    title="Quitar de favoritos"
                    className="shrink-0 text-[#D85A30] transition hover:scale-110 disabled:opacity-50"
                  >
                    <Star className="h-[18px] w-[18px] fill-current" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F5F0E8] px-3 py-2">
                  <span className="text-[11px] font-medium text-[#6B5B45]">Yield bruto</span>
                  <span className="font-display text-sm font-bold text-[#1D9E75]">
                    {f.yield_bruto != null ? `${f.yield_bruto.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
              <Link
                to="/map"
                className="block border-t border-[#E8E0D0] px-4 py-2.5 text-center text-[11px] font-semibold text-[#1D9E75] transition hover:bg-[#E1F5EE]"
              >
                Ver en el mapa →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Historial ---------------- */

const HISTORIAL_ICON: Record<string, string> = {
  simulacion: "💰",
  vista_barrio: "👁",
  comparacion: "↔️",
  favorito: "⭐",
};

function HistorialTab({ user: _user }: { user: UrbiUser }) {
  const { data: items = [], isLoading, isError } = useHistorial();

  return (
    <div className="space-y-5">
      <SectionTitle title="Historial" hint="Tus últimas simulaciones y búsquedas (últimas 20)." />
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Cargando historial...</div>
      ) : isError ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Error al cargar historial. Verifica tu conexión.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Sin actividad reciente.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((h) => {
            const label =
              h.tipo === "simulacion"
                ? `Simuló ${h.barrio_nombre ?? `barrio ${h.barrio_id}`}`
                : h.tipo === "comparacion"
                ? "Comparó barrios"
                : `Vio ${h.barrio_nombre ?? `barrio ${h.barrio_id}`}`;
            return (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-xl border border-[#E8E0D0] bg-white px-3.5 py-2.5 text-sm text-[#1A1208] transition hover:border-[#1D9E75]/30"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E1F5EE] text-sm">
                    {HISTORIAL_ICON[h.tipo] ?? "📋"}
                  </span>
                  <span className="font-medium">{label}</span>
                </div>
                <time className="shrink-0 text-[11px] text-[#9B8B75]">
                  {relativeTime(new Date(h.created_at).getTime())}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

/* ---------------- Mapa ---------------- */

const SCORE_LABELS = ["≥70", "≥50", "≥30", "<30"] as const;

function MapaTab({ user }: { user: UrbiUser }) {
  const [style, setStyle] = useState<MapStyleId>(user.mapStyle ?? "monochrome");
  const [oportunidades, setOportunidades] = useState(user.mostrarOportunidades ?? false);
  const [scorePalette, setScorePalette] = useState<ScorePaletteId>(getActivePaletteId);

  const applyMapStyle = (id: MapStyleId) => {
    setStyle(id);
    auth.patch({ mapStyle: id });
  };

  const applyScorePalette = (id: ScorePaletteId) => {
    setScorePalette(id);
    setActivePalette(id);
  };

  const toggleOportunidades = () => {
    const next = !oportunidades;
    setOportunidades(next);
    auth.patch({ mostrarOportunidades: next });
  };

  return (
    <div className="space-y-7">
      {/* ── Estilo del mapa base ── */}
      <div className="space-y-3">
        <SectionTitle title="Estilo del mapa" hint="Fondo cartográfico. Se aplica al volver al mapa." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(MAP_STYLES) as MapStyleId[]).map((id) => {
            const s = MAP_STYLES[id];
            const active = style === id;
            return (
              <button
                key={id}
                onClick={() => applyMapStyle(id)}
                className={`overflow-hidden rounded-xl border text-left transition ${
                  active ? "border-[#1D9E75] shadow-sm shadow-[#1D9E75]/20" : "border-[#E8E0D0] hover:border-[#1D9E75]/40"
                }`}
              >
                <div className="flex h-16">
                  {s.swatch.map((c) => (
                    <div key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex items-center justify-between bg-[#FAF7F2] px-3 py-2">
                  <span className="text-sm font-semibold text-[#1A1208]">{s.label}</span>
                  {active && <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75]">Activo</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Paleta de barrios por score ── */}
      <div className="space-y-3">
        <SectionTitle
          title="Paleta de barrios"
          hint="Color de los polígonos según score de inversión. Cambio inmediato."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SCORE_PALETTES) as ScorePaletteId[]).map((id) => {
            const p = SCORE_PALETTES[id];
            const active = scorePalette === id;
            return (
              <button
                key={id}
                onClick={() => applyScorePalette(id)}
                className={`overflow-hidden rounded-xl border text-left transition ${
                  active ? "border-[#1D9E75] shadow-sm shadow-[#1D9E75]/20" : "border-[#E8E0D0] hover:border-[#1D9E75]/40"
                }`}
              >
                <div className="flex h-14">
                  {p.swatch.map((c, i) => (
                    <div key={c} className="relative flex-1" style={{ background: c }}>
                      <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold"
                        style={{ color: i < 2 ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" }}>
                        {SCORE_LABELS[i]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between bg-[#FAF7F2] px-3 py-2">
                  <span className="text-sm font-semibold text-[#1A1208]">{p.label}</span>
                  {active && <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75]">Activa</span>}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          El cambio colorea los polígonos de barrios en tiempo real. El fondo del mapa no cambia.
        </p>
      </div>

      {/* ── Alertas de oportunidad ── */}
      <div className="rounded-xl border border-[#E8E0D0] bg-[#FAF7F2] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Alertas de oportunidad</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Muestra barrios con oportunidades detectadas directamente en el mapa
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={oportunidades}
            onClick={toggleOportunidades}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              oportunidades ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                oportunidades ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <Link to="/map" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan">
        Ir al mapa
      </Link>
    </div>
  );
}

/* ---------------- Atoms ---------------- */

const inputCls =
  "w-full rounded-md border border-[#E8E0D0] bg-[#FAF7F2] px-3 py-2 text-sm text-[#1A1208] outline-none transition placeholder:text-[#6B5B45]/60 focus:border-[#1D9E75] focus:ring-2 focus:ring-[#E1F5EE]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#6B5B45]">{label}</div>
      {children}
    </label>
  );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
        active ? "border-[#1D9E75] bg-[#E1F5EE] text-[#085041] font-semibold" : "border-[#E8E0D0] bg-[#FAF7F2] text-[#6B5B45] hover:bg-[#F5F0E8] hover:text-[#1A1208]"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Use formatCOP elsewhere to satisfy any future budget displays
void formatCOP;
