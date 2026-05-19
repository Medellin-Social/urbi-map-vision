import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  CreditCard,
  Heart,
  History,
  Map as MapIcon,
  Plus,
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
  type Risk,
  type UrbiUser,
} from "@/lib/auth";
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
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: PerfilPage,
});

type Tab = "cuenta" | "inversor" | "pagos" | "favoritos" | "historial" | "mapa";

const TABS: { id: Tab; label: string; Icon: typeof UserIcon }[] = [
  { id: "cuenta", label: "Cuenta", Icon: UserIcon },
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
    window.addEventListener("urbidata:user", sync);
    return () => window.removeEventListener("urbidata:user", sync);
  }, []);

  if (!user) return null;

  return (
    <div className="relative min-h-screen bg-background">
      <Navbar />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background/80 to-transparent" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
        <Link
          to="/map"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al mapa
        </Link>

        <div className="mt-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Configuración</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Personaliza tu cuenta, perfil de inversor y experiencia de mapa.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-[240px_1fr]">
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
                      ? "border-primary/60 bg-primary/10 text-primary glow-cyan"
                      : "border-border bg-surface/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <section className="rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur-md sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {tab === "cuenta" && <CuentaTab user={user} />}
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
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-accent text-2xl font-bold text-background ring-2 ring-primary/40">
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

/* ---------------- Inversor ---------------- */

function InversorTab({ user }: { user: UrbiUser }) {
  const [budget, setBudget] = useState<Budget | undefined>(user.budget);
  const [goal, setGoal] = useState<Goal | undefined>(user.goal);
  const [risk, setRisk] = useState<Risk | undefined>(user.risk);
  const [saved, setSaved] = useState(false);

  const save = () => {
    auth.patch({ budget, goal, risk });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Perfil inversor" hint="Editamos tus filtros y recomendaciones del mapa." />

      <Field label="Presupuesto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["<200", "200-500", "500-1000", ">1000"] as Budget[]).map((b) => (
            <Pill key={b} active={budget === b} onClick={() => setBudget(b)}>
              {b === "<200" ? "< $200M" : b === "200-500" ? "$200–500M" : b === "500-1000" ? "$500M–1.000M" : "> $1.000M"}
            </Pill>
          ))}
        </div>
      </Field>

      <Field label="Objetivo">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
            <Pill key={g} active={goal === g} onClick={() => setGoal(g)}>{GOAL_LABEL[g]}</Pill>
          ))}
        </div>
      </Field>

      <Field label="Perfil de riesgo">
        <div className="grid grid-cols-3 gap-2">
          {(["conservador", "moderado", "agresivo"] as Risk[]).map((r) => (
            <Pill key={r} active={risk === r} onClick={() => setRisk(r)}>
              <span className="capitalize">{r}</span>
            </Pill>
          ))}
        </div>
      </Field>

      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan">
          Guardar perfil
        </button>
        {saved && <span className="text-xs text-success">✓ Actualizado</span>}
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
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
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
        <div className="grid gap-3 sm:grid-cols-2">
          {favs.map((f) => (
            <div key={f.id} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {f.municipio ?? "Barrio"}
                  </div>
                  <div className="mt-0.5 font-display text-lg font-semibold">
                    {f.nombre ?? `Barrio ${f.barrio_id}`}
                  </div>
                  {f.comuna && (
                    <div className="text-[11px] text-muted-foreground">{f.comuna}</div>
                  )}
                </div>
                <Star className="h-4 w-4 fill-warning text-warning" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Yield bruto</span>
                <span className="font-semibold text-primary">
                  {f.yield_bruto != null ? `${f.yield_bruto.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Link to="/map" className="text-[11px] font-semibold text-primary hover:underline">
                  Ver en mapa →
                </Link>
                <button
                  onClick={() => remove.mutate(f.barrio_id)}
                  disabled={remove.isPending}
                  className="text-[11px] text-muted-foreground hover:text-danger disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
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
                className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
                    {HISTORIAL_ICON[h.tipo] ?? "📋"}
                  </span>
                  <span>{label}</span>
                </div>
                <time className="text-[11px] text-muted-foreground">
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
  const [style, setStyle] = useState<MapStyleId>(user.mapStyle ?? "dark");
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
                  active ? "border-primary glow-cyan" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex h-16">
                  {s.swatch.map((c) => (
                    <div key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex items-center justify-between bg-background/40 px-3 py-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  {active && <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Activo</span>}
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
                  active ? "border-primary glow-cyan" : "border-border hover:border-primary/40"
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
                <div className="flex items-center justify-between bg-background/40 px-3 py-2">
                  <span className="text-sm font-semibold">{p.label}</span>
                  {active && <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Activa</span>}
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
      <div className="rounded-xl border border-border bg-background/40 p-4">
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
  "w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
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
        active ? "border-primary bg-primary/15 text-primary glow-cyan" : "border-border bg-surface/60 text-muted-foreground hover:text-foreground"
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
