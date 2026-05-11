import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
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
  Briefcase,
  Calculator,
  ChevronRight,
  Coffee,
  GripVertical,
  Minus,
  Train,
  Trees,
  ShoppingBag,
  Sparkles,
  Star,
  Info,
  Activity,
  Target,
  X,
} from "lucide-react";
import {
  CITY_STATS,
  NEIGHBORHOODS,
  type Neighborhood,
  listingsFor,
  priceTrend,
  valorizacionHistorica,
} from "@/data/neighborhoods";
import { liquidityFor, LIQUIDITY_COLORS, opportunityForBarrio } from "@/data/marketActivity";
import { OPP_COLORS } from "@/config/mapColors";
import { auth, GOAL_LABEL, recommendation, type Goal } from "@/lib/auth";
import { formatCOP, formatPct, yieldColor, yieldLabel } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useListings } from "@/hooks/useBarrios";
import type { ApiListing } from "@/lib/adapters";

type View = "city" | "barrio" | "listings";

// ── Panel persistence helpers ───────────────────────────────────────────────

const PANEL_LS = { pos: "urbi_panel_pos", size: "urbi_panel_size" };

function readPanelSize(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(PANEL_LS.size);
    if (raw) {
      const p = JSON.parse(raw) as { width: number; height: number };
      return {
        width: Math.max(300, Math.min(600, p.width)),
        height: Math.max(200, Math.min(900, p.height)),
      };
    }
  } catch {}
  return { width: 380, height: 520 };
}

function readPanelPos(width: number): { left: number; top: number } {
  if (typeof window === "undefined") return { left: 20, top: 80 };
  try {
    const raw = localStorage.getItem(PANEL_LS.pos);
    if (raw) {
      const p = JSON.parse(raw) as { left: number; top: number };
      return {
        left: Math.max(0, Math.min(window.innerWidth - width - 8, p.left)),
        top: Math.max(70, Math.min(window.innerHeight - 200, p.top)),
      };
    }
  } catch {}
  return { left: Math.max(0, window.innerWidth - width - 20), top: 80 };
}

type Props = {
  selected: Neighborhood | null;
  onClear: () => void;
};

export function FloatingPanel({ selected, onClear }: Props) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>("city");
  const [minimized, setMinimized] = useState(false);
  const user = typeof window !== "undefined" ? auth.get() : null;

  const [size, setSize] = useState<{ width: number; height: number }>(() =>
    typeof window !== "undefined" ? readPanelSize() : { width: 380, height: 520 }
  );
  const [pos, setPos] = useState<{ left: number; top: number }>(() =>
    typeof window !== "undefined" ? readPanelPos(size.width) : { left: 20, top: 80 }
  );

  // Capture latest size/pos in refs so event handlers are always current
  const sizeRef = useRef(size);
  const posRef = useRef(pos);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { posRef.current = pos; }, [pos]);

  useMemo(() => {
    if (selected) setView("barrio");
    else setView("city");
  }, [selected?.id]);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const offsetX = e.clientX - posRef.current.left;
    const offsetY = e.clientY - posRef.current.top;
    document.body.style.cursor = "grabbing";

    const onMove = (ev: MouseEvent) => {
      setPos({
        left: Math.max(0, Math.min(window.innerWidth - sizeRef.current.width - 8, ev.clientX - offsetX)),
        top: Math.max(70, Math.min(window.innerHeight - 200, ev.clientY - offsetY)),
      });
    };

    const onUp = (ev: MouseEvent) => {
      const newPos = {
        left: Math.max(0, Math.min(window.innerWidth - sizeRef.current.width - 8, ev.clientX - offsetX)),
        top: Math.max(70, Math.min(window.innerHeight - 200, ev.clientY - offsetY)),
      };
      setPos(newPos);
      localStorage.setItem(PANEL_LS.pos, JSON.stringify(newPos));
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = sizeRef.current.width;
    const startH = sizeRef.current.height;
    document.body.style.cursor = "se-resize";

    const onMove = (ev: MouseEvent) => {
      const maxH = window.innerHeight - posRef.current.top - 20;
      setSize({
        width: Math.max(300, Math.min(600, startW + (ev.clientX - startX))),
        height: Math.max(200, Math.min(maxH, startH + (ev.clientY - startY))),
      });
    };

    const onUp = (ev: MouseEvent) => {
      const maxH = window.innerHeight - posRef.current.top - 20;
      const newSize = {
        width: Math.max(300, Math.min(600, startW + (ev.clientX - startX))),
        height: Math.max(200, Math.min(maxH, startH + (ev.clientY - startY))),
      };
      setSize(newSize);
      localStorage.setItem(PANEL_LS.size, JSON.stringify(newSize));
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

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
            <PanelContent view={view} setView={setView} selected={selected} onClear={onClear} user={user} />
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Desktop draggable floating panel ----
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
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
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              width: size.width,
              height: size.height,
              minHeight: 200,
              maxHeight: `calc(100vh - ${pos.top + 20}px)`,
            }}
            className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/85 shadow-2xl backdrop-blur-xl"
          >
            {/* Drag handle */}
            <div
              onMouseDown={startDrag}
              className="flex h-10 shrink-0 cursor-grab select-none items-center justify-between border-b border-border/40 bg-background/50 px-3"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                <span className="text-[10px] font-medium uppercase tracking-widest">Mueve el panel</span>
              </div>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setMinimized(true)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
                title="Minimizar"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <PanelContent view={view} setView={setView} selected={selected} onClear={onClear} user={user} />
            </div>

            {/* Resize handle — bottom-right corner */}
            <div
              onMouseDown={startResize}
              className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize opacity-30 hover:opacity-70 transition-opacity"
              title="Redimensionar"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full text-muted-foreground">
                <circle cx="13" cy="13" r="1.4" />
                <circle cx="9" cy="13" r="1.4" />
                <circle cx="13" cy="9" r="1.4" />
                <circle cx="5" cy="13" r="1.4" />
                <circle cx="9" cy="9" r="1.4" />
                <circle cx="13" cy="5" r="1.4" />
              </svg>
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
            goal={user?.goal}
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
                formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, "Yield"]}
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

function mockConnAmenities(n: Neighborhood) {
  return {
    cafes: Math.round(3 + n.estrato * 1.5 + (n.id % 4)),
    coworks: Math.round(1 + n.estrato * 0.7 + (n.id % 3)),
  };
}

const ESTADO_PRECIO_STYLE: Record<string, { bg: string; badge: string }> = {
  BAJO:   { bg: "#99CDD8", badge: "✅ oportunidad" },
  NORMAL: { bg: "#DAEBE3", badge: "✅ precio justo" },
  SOBRE:  { bg: "#F3C3B2", badge: "⚠️ precio alto" },
};

function BarrioDetail({ n, onBack, onListings, goal }: { n: Neighborhood; onBack: () => void; onListings: () => void; goal?: Goal }) {
  const trend = useMemo(() => priceTrend(n.id), [n.id]);
  const last = trend[trend.length - 1].precio;
  const avg = trend.reduce((a, b) => a + b.precio, 0) / trend.length;
  const diffPct = ((last - avg) / avg) * 100;
  const below = diffPct < 0;
  const varAnual = trend.length >= 2
    ? ((trend[trend.length - 1].precio - trend[0].precio) / trend[0].precio) * 100
    : 0;
  const valoriz = useMemo(() => valorizacionHistorica(n.id, n.estrato), [n.id, n.estrato]);
  const { cafes, coworks } = mockConnAmenities(n);
  const ylabel = yieldLabel(n.yield);

  const { data: listingsData, isLoading: listingsLoading } = useListings(n.id, 6);
  const apiListings = listingsData?.listings ?? [];
  const listings: ApiListing[] = apiListings.length > 0
    ? apiListings.slice(0, 3)
    : listingsFor(n).slice(0, 3).map((l) => ({
        id: l.id as unknown as number,
        tipo_operacion: l.tipo_operacion,
        tipo_inmueble: l.tipo_inmueble,
        precio_cop: l.precio,
        area_m2: l.area_m2,
        precio_m2: l.precio_m2,
        habitaciones: l.habitaciones,
        banos: l.banos,
        buena_oferta: l.buena_oferta,
      }));
  const [fav, setFav] = useState<boolean>(() => auth.isFavorite(n.id));

  // Log view to history once per neighborhood
  useEffect(() => {
    auth.pushHistory({ type: "view", label: `Vio ${titleCase(n.nombre)}`, barrioId: n.id });
    setFav(auth.isFavorite(n.id));
  }, [n.id]);

  const toggleFav = () => {
    auth.toggleFavorite({ id: n.id, nombre: titleCase(n.nombre), yield: n.yield });
    setFav(auth.isFavorite(n.id));
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a ciudad
      </button>

      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold">{titleCase(n.nombre)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{n.comuna}</p>
          </div>
          <button
            onClick={toggleFav}
            title={fav ? "Quitar de favoritos" : "Guardar en favoritos"}
            className={`grid h-9 w-9 place-items-center rounded-full border transition ${
              fav ? "border-warning/60 bg-warning/15 text-warning" : "border-border bg-background/40 text-muted-foreground hover:text-warning"
            }`}
          >
            <Star className={`h-4 w-4 ${fav ? "fill-warning" : ""}`} />
          </button>
        </div>
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
          {goal === "airbnb" ? (
            <>
              <ConnRow icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Mall más cercano" value={`${n.dist_mall.toFixed(1)} km`} />
              <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
              <ConnRow icon={<Coffee className="h-3.5 w-3.5" />} label="Cafés en 500m" value={`${cafes} locales`} />
            </>
          ) : goal === "mixto" ? (
            <>
              <ConnRow icon={<Coffee className="h-3.5 w-3.5" />} label="Cafés en 500m" value={`${cafes} locales`} />
              <ConnRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Coworking en 1km" value={`${coworks} espacios`} />
              <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
            </>
          ) : goal === "renta-larga" ? (
            <>
              <ConnRow icon={<Train className="h-3.5 w-3.5" />} label="Metro más cercano" value={`${n.dist_metro.toFixed(1)} km`} />
              <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
              <ConnRow icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Mall más cercano" value={`${n.dist_mall.toFixed(1)} km`} />
            </>
          ) : (
            <>
              <ConnRow icon={<Train className="h-3.5 w-3.5" />} label="Metro más cercano" value={`${n.dist_metro.toFixed(1)} km`} />
              <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
              <ConnRow icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Mall más cercano" value={`${n.dist_mall.toFixed(1)} km`} />
            </>
          )}
        </div>
      </Section>

      <LiquiditySection n={n} />
      <OpportunityBanner n={n} />

      <Section title="Valorización histórica · 2015–2025">
        <div className="h-36">
          <ResponsiveContainer>
            <LineChart data={valoriz} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis
                width={44}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                domain={[0, "dataMax + 10"]}
                tickFormatter={(v: number) => `+${Math.round(v)}%`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as { year: string; acumulado: number; varAnual: number };
                  if (row.year === "2015") return (
                    <div style={tooltipStyle} className="px-2.5 py-1.5 text-[11px]">
                      <div className="font-semibold">2015</div>
                      <div>Base: 0%</div>
                    </div>
                  );
                  return (
                    <div style={tooltipStyle} className="px-2.5 py-1.5 text-[11px] space-y-0.5">
                      <div className="font-semibold">{label}</div>
                      <div>Acumulado desde 2015: +{row.acumulado.toFixed(1)}%</div>
                      <div>Ese año: +{row.varAnual.toFixed(1)}%</div>
                      <div className="text-muted-foreground/70">Fuente: DANE IPVN</div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="acumulado"
                stroke="#00d4ff"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#00d4ff", stroke: "#0f1a1f", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {(() => {
          const estadoActual = (n.estado_precio ?? (below ? "BAJO" : "SOBRE")).toUpperCase();
          const ep = ESTADO_PRECIO_STYLE[estadoActual] ?? ESTADO_PRECIO_STYLE.SOBRE;
          const pct = `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
          return (
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
              style={{ background: ep.bg, color: "#1a2e35" }}
            >
              {n.estado_precio
                ? `${estadoActual} · ${ep.badge}`
                : `${estadoActual} promedio (${pct}) · ${ep.badge}`}
            </div>
          );
        })()}
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          Fuente: DANE IPVN + Banrep IPVU · Base 2015=0% · Ajustado por estrato
        </p>
      </Section>

      <Link
        to="/calculadora"
        search={{ barrio: n.id }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-accent py-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
      >
        <Calculator className="h-3.5 w-3.5" />
        Simular inversión aquí <ArrowRight className="h-3 w-3" />
      </Link>

      <Section title="Listings destacados">
        {listingsLoading && apiListings.length === 0 && (
          <div className="mb-2 h-1 w-full animate-pulse rounded-full bg-primary/20" />
        )}
        <div className="space-y-2">
          {listings.map((l) => (
            <ListingCard key={l.id} l={l} />
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

function ListingCard({ l }: { l: ApiListing }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {l.tipo_inmueble ?? "—"} · {l.tipo_operacion ?? "—"}
          </div>
          <div className="mt-1 font-semibold">{formatCOP(l.precio_cop ?? 0)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {l.area_m2 != null ? `${l.area_m2} m²` : "—"}
            {l.habitaciones != null ? ` · ${l.habitaciones} hab` : ""}
            {l.banos != null ? ` · ${l.banos} baños` : ""}
          </div>
          {l.direccion_raw && (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{l.direccion_raw}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {l.buena_oferta && (
            <span className="inline-block rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">
              Buena oferta
            </span>
          )}
          {l.precio_m2 != null && (
            <div className="mt-1 text-[11px] text-muted-foreground">{formatCOP(l.precio_m2)}/m²</div>
          )}
          {l.url && (
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-[10px] text-primary hover:underline"
            >
              Ver →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingsView({ n, onBack }: { n: Neighborhood; onBack: () => void }) {
  const { data: listingsData, isLoading } = useListings(n.id, 100);
  const [op, setOp] = useState<"venta" | "arriendo">("venta");
  const [areaMin, setAreaMin] = useState(0);

  const allApi = listingsData?.listings ?? [];
  // Fall back to mock only when API returned but empty
  const source: ApiListing[] = allApi.length > 0
    ? allApi
    : listingsFor(n).map((l) => ({
        id: l.id as unknown as number,
        tipo_operacion: l.tipo_operacion,
        tipo_inmueble: l.tipo_inmueble,
        precio_cop: l.precio,
        area_m2: l.area_m2,
        precio_m2: l.precio_m2,
        habitaciones: l.habitaciones,
        banos: l.banos,
        buena_oferta: l.buena_oferta,
      }));

  const inOp = source.filter((l) => l.tipo_operacion === op);
  const maxPrecio = inOp.reduce((m, l) => Math.max(m, l.precio_cop ?? 0), 1);
  const [precioMax, setPrecioMax] = useState(() => maxPrecio);

  // Reset price filter when tab or data changes
  useMemo(() => { setPrecioMax(maxPrecio); }, [op, maxPrecio]);

  const filtered = inOp.filter(
    (l) => (l.precio_cop ?? 0) <= precioMax && (l.area_m2 ?? 0) >= areaMin
  );

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
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isLoading ? "Cargando…" : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${listingsData ? ` de ${listingsData.total} totales` : ""}`}
        </p>
      </div>

      <div className="inline-flex rounded-md border border-border p-0.5">
        {(["venta", "arriendo"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOp(o)}
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

      {isLoading && (
        <div className="h-1 w-full animate-pulse rounded-full bg-primary/20" />
      )}

      <div className="space-y-2">
        {filtered.map((l) => <ListingCard key={l.id} l={l} />)}
        {!isLoading && filtered.length === 0 && (
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

/* ------------- Liquidity / Opportunity ------------- */

function LiquiditySection({ n }: { n: Neighborhood }) {
  // Prefer real API liquidez data; fall back to mock lookup
  const apiLiq = n.liquidez_api;
  const liq = apiLiq ? null : liquidityFor(n);
  const cat = (apiLiq?.categoria ?? liq?.cat ?? "MEDIA") as import("@/data/marketActivity").LiquidityCat;
  const colors = LIQUIDITY_COLORS[cat] ?? LIQUIDITY_COLORS["MEDIA"];
  const score = apiLiq?.score ?? liq?.score ?? 50;
  const tiempoEstimado = apiLiq?.tiempo_estimado_venta ?? liq?.tiempoEstimado ?? "—";
  const label = liq?.label ?? cat;
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <Activity className="h-3 w-3 text-primary" /> 💧 Actividad de Mercado
        </div>
        <button
          onClick={() => setShowInfo(true)}
          className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition hover:bg-background/60 hover:text-primary"
          title="¿Cómo calculamos esto?"
        >
          <Info className="h-3 w-3" />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border p-3"
        style={{ borderColor: colors.border, background: colors.bg }}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.border }}>
            {cat} — {label}
          </div>
          <div className="text-[11px] font-semibold" style={{ color: colors.border }}>
            {score}/100
          </div>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Tiempo estimado: <span className="text-foreground">{tiempoEstimado}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: colors.border }}
          />
        </div>

        {liq && (
          <div className="mt-3 grid grid-cols-1 gap-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">📊 Listings activos</span>
              <span className="font-semibold">{liq.n}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">🕐 Tiempo prom. publicado</span>
              <span className="font-semibold">{liq.dias}d</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">🔄 Listings frescos (&lt;30d)</span>
              <span className="font-semibold">{liq.frescos}%</span>
            </div>
          </div>
        )}
      </motion.div>

      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/80">
        Basado en volumen de mercado activo. Liquidez real disponible próximamente con datos de transacciones oficiales.
      </p>

      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInfo(false)}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6"
            >
              <button
                onClick={() => setShowInfo(false)}
                className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="font-display text-lg font-semibold">¿Cómo calculamos esto?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Este índice mide la actividad del mercado inmobiliario basado en:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>• Tiempo de publicación de listings activos</li>
                <li>• Volumen de propiedades en venta</li>
                <li>• Interés de la zona (demanda Airbnb)</li>
              </ul>
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                📌 <span className="text-foreground">Próximamente:</span> integraremos datos reales de transacciones de la
                Superintendencia de Notariado y Registro para mostrar tiempo real de venta por barrio.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const OPP_EMOJIS: Record<string, string> = {
  "PRECIO BAJO MERCADO": "🎯",
  "ALTO RENDIMIENTO": "📈",
  "INVERSIÓN SEGURA": "🛡️",
};

function OpportunityBanner({ n }: { n: Neighborhood }) {
  // Prefer real API oportunidad; fall back to hardcoded mock
  const apiOpp = n.oportunidad;
  if (apiOpp !== undefined) {
    if (!apiOpp?.detectada) return null;
    const tipo = (apiOpp.tipo ?? "ALTO RENDIMIENTO").toUpperCase();
    const color = OPP_COLORS[tipo as keyof typeof OPP_COLORS] ?? "#0077B6";
    const emoji = OPP_EMOJIS[tipo] ?? "📊";
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border p-3"
        style={{ borderColor: color, background: `${color}15` }}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
          <Target className="h-3 w-3" /> {emoji} Oportunidad detectada
        </div>
        <div className="mt-1 text-sm font-semibold" style={{ color }}>
          {tipo}
        </div>
        {apiOpp.descripcion && (
          <p className="mt-1 text-xs leading-relaxed text-foreground/90">"{apiOpp.descripcion}"</p>
        )}
      </motion.div>
    );
  }
  // Fallback: hardcoded mock for NEIGHBORHOODS without API data
  const opp = opportunityForBarrio(n);
  if (!opp) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border p-3"
      style={{ borderColor: opp.color, background: `${opp.color}15` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: opp.color }}>
        <Target className="h-3 w-3" /> {opp.emoji} Oportunidad detectada
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: opp.color }}>
        {opp.tipo}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/90">"{opp.descripcion}"</p>
    </motion.div>
  );
}

