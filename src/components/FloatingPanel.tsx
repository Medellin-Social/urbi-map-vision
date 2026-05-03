import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  GripVertical,
  Minus,
  Train,
  Trees,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CITY_STATS,
  NEIGHBORHOODS,
  type Neighborhood,
  listingsFor,
  priceTrend,
} from "@/data/neighborhoods";
import { auth, GOAL_LABEL, recommendation } from "@/lib/auth";
import { formatCOP, formatPct, yieldColor, yieldLabel } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";

type View = "city" | "barrio" | "listings";

type Props = {
  selected: Neighborhood | null;
  onClear: () => void;
};

export function FloatingPanel({ selected, onClear }: Props) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>("city");
  const [minimized, setMinimized] = useState(false);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const user = typeof window !== "undefined" ? auth.get() : null;

  // when a barrio is selected, jump to barrio view
  useMemo(() => {
    if (selected) setView("barrio");
    else setView("city");
  }, [selected?.id]);

  // ---- Mobile bottom sheet ----
  if (isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: 400 }}
          animate={{ y: minimized ? 360 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="absolute inset-x-0 bottom-0 z-20 max-h-[78vh] overflow-hidden rounded-t-2xl border-t border-border bg-surface/95 backdrop-blur-xl"
          drag="y"
          dragConstraints={{ top: 0, bottom: 360 }}
          onDragEnd={(_, info) => setMinimized(info.offset.y > 80)}
        >
          <div className="flex justify-center pt-2">
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-6">
            <PanelContent
              view={view}
              setView={setView}
              selected={selected}
              onClear={onClear}
              user={user}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Desktop draggable floating panel ----
  return (
    <div ref={constraintsRef} className="pointer-events-none absolute inset-0 z-20">
      <AnimatePresence mode="wait">
        {minimized ? (
          <motion.button
            key="min"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onClick={() => setMinimized(false)}
            className="pointer-events-auto absolute right-4 top-1/2 flex h-32 -translate-y-1/2 items-center justify-center gap-2 rounded-l-xl border border-border bg-surface/90 px-2 text-xs font-medium text-primary backdrop-blur-xl glow-cyan"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            <span style={{ writingMode: "vertical-rl" }} className="rotate-180 uppercase tracking-widest">
              Panel
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto absolute right-4 top-20 flex max-h-[calc(100vh-7rem)] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-surface/85 shadow-2xl backdrop-blur-xl"
          >
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex cursor-grab items-center justify-between border-b border-border/60 px-3 py-2 active:cursor-grabbing"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <GripVertical className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-widest">Mueve el panel</span>
              </div>
              <button
                onClick={() => setMinimized(true)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
                title="Minimizar"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <PanelContent
                view={view}
                setView={setView}
                selected={selected}
                onClear={onClear}
                user={user}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelContent({
  view,
  setView,
  selected,
  onClear,
  user,
}: {
  view: View;
  setView: (v: View) => void;
  selected: Neighborhood | null;
  onClear: () => void;
  user: ReturnType<typeof auth.get>;
}) {
  return (
    <AnimatePresence mode="wait">
      {view === "city" && (
        <motion.div key="city" {...transition}>
          <CityOverview goal={user?.goal} />
        </motion.div>
      )}
      {view === "barrio" && selected && (
        <motion.div key={`b-${selected.id}`} {...transition}>
          <BarrioDetail
            n={selected}
            onBack={() => {
              onClear();
              setView("city");
            }}
            onListings={() => setView("listings")}
          />
        </motion.div>
      )}
      {view === "listings" && selected && (
        <motion.div key={`l-${selected.id}`} {...transition}>
          <ListingsView n={selected} onBack={() => setView("barrio")} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const transition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

/* ------------- City overview ------------- */

function CityOverview({ goal }: { goal?: ReturnType<typeof auth.get> extends infer U ? (U extends { goal?: infer G } ? G : never) : never }) {
  const top5 = [...NEIGHBORHOODS].sort((a, b) => b.yield - a.yield).slice(0, 5);
  const best = top5[0];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-widest text-primary">Vista de ciudad</div>
        <h2 className="mt-1 font-display text-xl font-semibold">Medellín · Valle de Aburrá</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tu perfil:{" "}
          <span className="text-foreground">{goal ? GOAL_LABEL[goal] : "—"}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Yield promedio" value={`${CITY_STATS.yield_promedio}%`} accent="cyan" />
        <Metric label="Barrios analizados" value={String(CITY_STATS.barrios_analizados)} />
        <Metric label="Precio m² mediana" value={formatCOP(CITY_STATS.precio_m2_mediana)} />
        <Metric label="Mejor zona perfil" value={best.nombre} accent="green" />
      </div>

      <Section title="Top 5 barrios por yield">
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={top5.map((n) => ({ name: shortName(n.nombre), yield: n.yield }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(0,212,255,0.06)" }}
                contentStyle={tooltipStyle}
                formatter={(v: number) => [`${v.toFixed(1)}%`, "Yield"]}
              />
              <Bar dataKey="yield" radius={[6, 6, 0, 0]} fill="url(#barGrad)" />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-primary">
          <Sparkles className="h-3 w-3" /> Recomendación
        </div>
        <p className="text-sm leading-relaxed">{recommendation(goal as never)}</p>
      </div>

      <p className="pt-1 text-center text-[11px] text-muted-foreground">
        Haz clic en un barrio del mapa para ver su análisis →
      </p>
    </div>
  );
}

function shortName(s: string) {
  return s.length > 8 ? s.slice(0, 7) + "…" : s;
}

/* ------------- Barrio detail ------------- */

function BarrioDetail({ n, onBack, onListings }: { n: Neighborhood; onBack: () => void; onListings: () => void }) {
  const trend = useMemo(() => priceTrend(n.id), [n.id]);
  const last = trend[trend.length - 1].precio;
  const avg = trend.reduce((a, b) => a + b.precio, 0) / trend.length;
  const diffPct = ((last - avg) / avg) * 100;
  const below = diffPct < 0;
  const ylabel = yieldLabel(n.yield);

  const listings = listingsFor(n).slice(0, 3);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a ciudad
      </button>

      <div>
        <h2 className="font-display text-xl font-semibold">{titleCase(n.nombre)}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{n.comuna}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>Estrato {n.estrato}</Badge>
          <Badge>{n.municipio}</Badge>
          <Badge color={yieldColor(n.yield)}>{ylabel}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Precio m² (venta)" value={formatCOP(n.precio_m2)} />
        <Metric label="Arriendo prom." value={`${formatCOP(n.arriendo)}/mes`} />
        <Metric label="Yield bruto" value={formatPct(n.yield)} accent="cyan" />
        <Metric label="Años recupero" value={`${n.anos_recupero.toFixed(1)} años`} />
      </div>

      <Section title="Conectividad">
        <div className="space-y-2">
          <ConnRow icon={<Train className="h-3.5 w-3.5" />} label="Metro más cercano" value={`${n.dist_metro.toFixed(1)} km`} />
          <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
          <ConnRow icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Mall más cercano" value={`${n.dist_mall.toFixed(1)} km`} />
        </div>
      </Section>

      <Section title="Tendencia de precio · 12 meses">
        <div className="h-32">
          <ResponsiveContainer>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`Idx ${v.toFixed(1)}`, "Precio"]} />
              <Line type="monotone" dataKey="precio" stroke="#00d4ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${below ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {below ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
          Precio actual: {below ? "BAJO" : "SOBRE"} el promedio ({diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%)
        </div>
      </Section>

      <Section title="Listings destacados">
        <div className="space-y-2">
          {listings.map((l) => (
            <div key={l.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {l.tipo_inmueble} · {l.tipo_operacion}
                  </div>
                  <div className="mt-1 font-semibold">{formatCOP(l.precio)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {l.area_m2} m² · {l.habitaciones} hab · {l.banos} baños
                  </div>
                </div>
                <div className="text-right">
                  {l.buena_oferta && (
                    <span className="inline-block rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">
                      Buena oferta
                    </span>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">{formatCOP(l.precio_m2)}/m²</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onListings}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-primary/50 bg-primary/10 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          Ver todos los listings <ArrowRight className="h-3 w-3" />
        </button>
      </Section>
    </div>
  );
}

/* ------------- Listings view ------------- */

function ListingsView({ n, onBack }: { n: Neighborhood; onBack: () => void }) {
  const all = useMemo(() => listingsFor(n), [n.id]);
  const [op, setOp] = useState<"venta" | "arriendo">("venta");
  const inOp = all.filter((l) => l.tipo_operacion === op);
  const maxPrecio = Math.max(...inOp.map((l) => l.precio), 1);
  const [precioMax, setPrecioMax] = useState(maxPrecio);
  const [areaMin, setAreaMin] = useState(0);

  const filtered = inOp.filter((l) => l.precio <= precioMax && l.area_m2 >= areaMin);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Volver al barrio
      </button>

      <div>
        <h2 className="font-display text-xl font-semibold">Listings · {titleCase(n.nombre)}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} resultados</p>
      </div>

      <div className="inline-flex rounded-md border border-border p-0.5">
        {(["venta", "arriendo"] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOp(o);
              const next = all.filter((l) => l.tipo_operacion === o);
              setPrecioMax(Math.max(...next.map((l) => l.precio), 1));
            }}
            className={`rounded px-3 py-1 text-xs font-medium uppercase tracking-wider transition ${op === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <FilterRow label={`Precio máx · ${formatCOP(precioMax)}`}>
          <input
            type="range"
            min={0}
            max={maxPrecio}
            step={Math.max(1_000_000, Math.round(maxPrecio / 50))}
            value={precioMax}
            onChange={(e) => setPrecioMax(Number(e.target.value))}
            className="w-full accent-[#00d4ff]"
          />
        </FilterRow>
        <FilterRow label={`Área mín · ${areaMin} m²`}>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={areaMin}
            onChange={(e) => setAreaMin(Number(e.target.value))}
            className="w-full accent-[#00d4ff]"
          />
        </FilterRow>
      </div>

      <div className="space-y-2">
        {filtered.map((l) => (
          <div key={l.id} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {l.tipo_inmueble}
                </div>
                <div className="mt-1 font-semibold">{formatCOP(l.precio)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {l.area_m2} m² · {l.habitaciones} hab · {l.banos} baños
                </div>
              </div>
              <div className="text-right">
                {l.buena_oferta && (
                  <span className="inline-block rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">
                    Buena oferta
                  </span>
                )}
                <div className="mt-1 text-[11px] text-muted-foreground">{formatCOP(l.precio_m2)}/m²</div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No hay listings con estos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------- Atoms ------------- */

function Metric({ label, value, accent }: { label: string; value: string; accent?: "cyan" | "green" }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-base font-semibold ${
          accent === "cyan" ? "text-primary" : accent === "green" ? "text-success" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest"
      style={
        color
          ? { borderColor: `${color}66`, color, background: `${color}10` }
          : { borderColor: "rgba(255,255,255,0.12)", color: "#9ca3af" }
      }
    >
      {children}
    </span>
  );
}

function ConnRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span> {label}
      </div>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

const tooltipStyle: React.CSSProperties = {
  background: "rgba(17,24,39,0.95)",
  border: "1px solid rgba(0,212,255,0.4)",
  borderRadius: 8,
  fontSize: 11,
  color: "#f9fafb",
};
