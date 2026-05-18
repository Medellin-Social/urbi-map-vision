import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  Leaf,
  Minus,
  Shield,
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
import type { Neighborhood } from "@/lib/adapters";
import { LIQUIDITY_COLORS } from "@/data/marketActivity";
import { OPP_COLORS } from "@/config/mapColors";
import { auth, GOAL_LABEL, recommendation, type Goal } from "@/lib/auth";
import { formatCOP, formatPct, yieldColor, yieldLabel } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useListings, useCiudadStats, useBarrios, useBarriosRaw } from "@/hooks/useBarrios";
import type { ApiListing } from "@/lib/adapters";

type View = "city" | "barrio" | "listings";

// ── Panel persistence helpers ───────────────────────────────────────────────

const PANEL_LS = { pos: "urbi_panel_pos", size: "urbi_panel_size" };

const PANEL_MIN_W = 300;
const PANEL_MIN_H = 200;
const panelMaxW = () => Math.floor(window.innerWidth * 0.85);
const panelMaxH = () => Math.floor(window.innerHeight * 0.85);

function readPanelSize(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(PANEL_LS.size);
    if (raw) {
      const p = JSON.parse(raw) as { width: number; height: number };
      return {
        width: Math.max(PANEL_MIN_W, Math.min(panelMaxW(), p.width)),
        height: Math.max(PANEL_MIN_H, Math.min(panelMaxH(), p.height)),
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

  useEffect(() => {
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
      const maxH = Math.min(panelMaxH(), window.innerHeight - posRef.current.top - 20);
      setSize({
        width: Math.max(PANEL_MIN_W, Math.min(panelMaxW(), startW + (ev.clientX - startX))),
        height: Math.max(PANEL_MIN_H, Math.min(maxH, startH + (ev.clientY - startY))),
      });
    };

    const onUp = (ev: MouseEvent) => {
      const maxH = Math.min(panelMaxH(), window.innerHeight - posRef.current.top - 20);
      const newSize = {
        width: Math.max(PANEL_MIN_W, Math.min(panelMaxW(), startW + (ev.clientX - startX))),
        height: Math.max(PANEL_MIN_H, Math.min(maxH, startH + (ev.clientY - startY))),
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

function goalToPerfil(goal?: Goal | null): string | undefined {
  if (goal === "airbnb") return "airbnb";
  if (goal === "mixto") return "nomadas";
  if (goal === "renta-larga" || goal === "valorizacion") return "largo_plazo";
  return undefined;
}

function CityOverview({ goal }: { goal?: Goal }) {
  const perfil = goalToPerfil(goal);
  const { data: apiStats } = useCiudadStats(perfil);
  const { data: barriosRaw } = useBarriosRaw(perfil);

  // Fallback: compute stats from all-Valle barrios when API returns nothing
  const computedStats = useMemo(() => {
    if (!barriosRaw?.length) return null;
    const withYield = barriosRaw.filter((b) => b.mercado.yield_bruto_pct != null);
    const yields = withYield.map((b) => b.mercado.yield_bruto_pct!);
    const prices = barriosRaw
      .filter((b) => b.mercado.precio_m2_cop != null)
      .map((b) => b.mercado.precio_m2_cop!)
      .sort((a, b) => a - b);
    const yieldPromedio =
      yields.length > 0
        ? Math.round((yields.reduce((s, v) => s + v, 0) / yields.length) * 10) / 10
        : null;
    const precioMediana = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null;
    const top5 = [...withYield]
      .sort((a, b) => (b.mercado.yield_bruto_pct ?? 0) - (a.mercado.yield_bruto_pct ?? 0))
      .slice(0, 5)
      .map((b) => ({
        barrio_id: b.barrio_id,
        nombre: b.nombre,
        municipio: b.municipio,
        score: b.scores.score_activo,
        yield_bruto_pct: b.mercado.yield_bruto_pct,
        precio_m2_cop: b.mercado.precio_m2_cop,
      }));
    return {
      barrios_analizados: withYield.length,
      yield_promedio: yieldPromedio,
      precio_m2_mediana: precioMediana,
      oportunidades_activas: 0,
      top5,
    };
  }, [barriosRaw]);

  const stats = apiStats ?? computedStats;

  const chartData = stats?.top5.map((b) => ({
    name: shortName(b.nombre ?? ""),
    yield: b.yield_bruto_pct ?? 0,
  })) ?? [];

  const bestName = stats?.top5[0]?.nombre
    ? stats.top5[0].nombre.split(" ").map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ")
    : "—";

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
        <Metric label="Yield promedio" value={stats ? `${stats.yield_promedio ?? "—"}%` : "…"} accent="cyan" />
        <Metric label="Barrios analizados" value={stats ? String(stats.barrios_analizados) : "…"} />
        <Metric label="Precio m² mediana" value={stats?.precio_m2_mediana ? formatCOP(stats.precio_m2_mediana) : "…"} />
        <Metric label="Mejor zona perfil" value={bestName} accent="green" />
      </div>

      <Section title="Top 5 barrios por yield">
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
        {!stats && (
          <div className="mt-1 h-1 w-full animate-pulse rounded-full bg-primary/20" />
        )}
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

// ── Valorización DANE 2015-2025 ────────────────────────────────────────────────
const DANE_VARS = [11.9, 7.6, 7.8, 10.6, 8.7, 7.0, 7.1, 9.5, 15.9, 10.1, 8.3];
const VALORIZ_MULT: Record<number, number> = { 5: 1.15, 4: 1.05, 3: 1.0 };

function calcValorizStats(estrato: number) {
  const mult = VALORIZ_MULT[estrato] ?? 0.9;
  // Compound growth 2015→2025
  const acumulado = DANE_VARS.reduce(
    (acc, v) => (1 + acc / 100) * (1 + (v * mult) / 100) * 100 - 100,
    0,
  );
  const ultimoAnio = DANE_VARS[DANE_VARS.length - 1] * mult;
  // Compound 5yr projection from last 5yr DANE avg
  const avg5 = DANE_VARS.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const proj5 = (Math.pow(1 + (avg5 * mult) / 100, 5) - 1) * 100;
  return {
    acumulado: Math.round(acumulado),
    ultimoAnio: parseFloat(ultimoAnio.toFixed(1)),
    proj5: Math.round(proj5),
  };
}

const SEGURIDAD_COLORS: Record<string, string> = {
  "ALTA":     "#10b981",
  "MEDIA":    "#00d4ff",
  "BAJA":     "#f59e0b",
  "MUY BAJA": "#ef4444",
  "SIN DATOS": "#6b7280",
};

const VERDE_COLORS: Record<string, string> = {
  "ALTA":    "#10b981",
  "MEDIA":   "#22c55e",
  "BAJA":    "#f59e0b",
  "MÍNIMA":  "#ef4444",
  "SIN DATOS": "#6b7280",
};

// Interpolate gray (#9ca3af) → plant green (#22c55e) based on 0–1 ratio
function verdeColor(ratio: number): string {
  const r = Math.round(156 + (34 - 156) * ratio);
  const g = Math.round(163 + (197 - 163) * ratio);
  const b = Math.round(175 + (94 - 175) * ratio);
  return `rgb(${r},${g},${b})`;
}

const SALUD_COLORS: Record<string, string> = {
  "MUY SALUDABLE": "#10b981",
  "SALUDABLE":     "#00d4ff",
  "PRECAUCIÓN":    "#f59e0b",
  "ALERTA":        "#ef4444",
};

function BarrioDetail({ n, onBack, onListings, goal }: { n: Neighborhood; onBack: () => void; onListings: () => void; goal?: Goal }) {
  const ylabel = yieldLabel(n.yield);
  const valoriz = calcValorizStats(n.estrato);
  const fmtConn = (v: number | null | undefined, suffix: string) =>
    v != null ? `${v} ${suffix}` : "Sin datos";

  const { data: listingsData, isLoading: listingsLoading } = useListings(n.id, 6);
  const apiListings = listingsData?.listings ?? [];
  const listings: ApiListing[] = apiListings.slice(0, 3);

  const { data: allBarrios } = useBarrios();
  const maxVerdePct = useMemo(() => {
    const vals = allBarrios?.map((b) => b.verde_pct ?? 0).filter((v) => v > 0) ?? [];
    return vals.length ? Math.max(...vals) : 40;
  }, [allBarrios]);
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

      <Section title="Corrección inmobiliaria">
        <div className="rounded-xl border border-border bg-background/30 p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio publicado:</span>
            <span>{formatCOP(n.precio_m2)}/m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio negociación:</span>
            <span className="text-success">~{formatCOP(Math.round(n.precio_m2 * 0.97))}/m² <span className="text-muted-foreground/60">(-3%)</span></span>
          </div>
          <hr className="border-border/40" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Arriendo publicado:</span>
            <span>{formatCOP(n.arriendo)}/mes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Arriendo neto:</span>
            <span className="text-success">~{formatCOP(Math.round(n.arriendo * 0.90))}/mes <span className="text-muted-foreground/60">(-10%)</span></span>
          </div>
          <hr className="border-border/40" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Yield publicado:</span>
            <span>{formatPct(n.yield)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Yield real est.:</span>
            <span className="text-success">{formatPct(Math.round(n.yield * (0.90 / 0.97) * 10) / 10)}</span>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/70">
          ℹ️ Precio de negociación estimado descontando comisión inmobiliaria (3% venta, 10% arriendo).
          Dato real disponible próximamente con escrituras SNR.
        </p>
      </Section>

      <Section title="Conectividad">
        <div className="space-y-2">
          {goal === "airbnb" ? (
            <>
              <ConnRow icon={<ShoppingBag className="h-3.5 w-3.5" />} label="Mall más cercano" value={`${n.dist_mall.toFixed(1)} km`} />
              <ConnRow icon={<Trees className="h-3.5 w-3.5" />} label="Parque más cercano" value={`${n.dist_parque.toFixed(1)} km`} />
              <ConnRow icon={<Coffee className="h-3.5 w-3.5" />} label="Cafés en 500m" value={fmtConn(n.n_cafes_500m, "locales")} />
            </>
          ) : goal === "mixto" ? (
            <>
              <ConnRow icon={<Coffee className="h-3.5 w-3.5" />} label="Cafés en 500m" value={fmtConn(n.n_cafes_500m, "locales")} />
              <ConnRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Coworking en 1km" value={fmtConn(n.n_coworking_1km, "espacios")} />
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

      <SeguridadSection n={n} />
      <VerdeSection n={n} maxVerdePct={maxVerdePct} />
      <LiquiditySection n={n} />

      <Section title="📈 Valorización histórica">
        <div className="rounded-xl border border-border bg-background/30 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center">
              <div className="font-display text-xl font-bold text-primary">+{valoriz.acumulado}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">desde 2015</div>
            </div>
            <div className="text-center">
              <div className="font-display text-xl font-bold text-success">+{valoriz.ultimoAnio}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">último año</div>
            </div>
          </div>
          <div className="border-t border-border/40 pt-2 text-center text-xs text-muted-foreground">
            Proyección 5 años:{" "}
            <span className="font-semibold text-foreground">+{valoriz.proj5}%</span>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          Fuente: DANE IPVN · Ajustado por estrato {n.estrato}
        </p>
      </Section>

      <SaludFinancieraSection n={n} />

      <OpportunityBanner n={n} />

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

/* ------------- Seguridad ------------- */

function SeguridadSection({ n }: { n: Neighborhood }) {
  const cat = n.seguridad_categoria ?? "SIN DATOS";
  const score = n.seguridad_score;
  const nota = n.seguridad_nota;
  const color = SEGURIDAD_COLORS[cat] ?? SEGURIDAD_COLORS["SIN DATOS"];
  if (score === null || score === undefined) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <Shield className="h-3 w-3 text-primary" /> Seguridad
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border p-3"
        style={{ borderColor: `${color}66`, background: `${color}10` }}
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${color}22`, color }}>
            {cat}
          </span>
          <span className="text-[11px] font-semibold" style={{ color }}>{score}/100</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
          <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="h-full rounded-full" style={{ background: color }} />
        </div>
        {nota && <p className="mt-2 text-[11px] text-muted-foreground">{nota}</p>}
      </motion.div>
    </div>
  );
}

/* ------------- Índice verde ------------- */

function VerdeSection({ n, maxVerdePct }: { n: Neighborhood; maxVerdePct: number }) {
  const pct = n.verde_pct;
  const cat = n.verde_categoria ?? "SIN DATOS";
  if (pct === null || pct === undefined) return null;
  const ratio = Math.min(1, pct / maxVerdePct);
  const color = verdeColor(ratio);
  const barWidth = `${(ratio * 100).toFixed(1)}%`;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <Leaf className="h-3 w-3 text-success" /> Índice verde
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border p-3"
        style={{ borderColor: `${color}66`, background: `${color}10` }}
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${color}22`, color }}>
            {cat}
          </span>
          <span className="text-[11px] font-semibold" style={{ color }}>{pct.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: barWidth }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground/60">
          Comparado con la zona más verde del Valle de Aburrá
        </div>
      </motion.div>
    </div>
  );
}

/* ------------- Salud financiera ------------- */

function SaludFinancieraSection({ n }: { n: Neighborhood }) {
  const remates = n.n_remates_municipio ?? 0;
  const cat = remates === 0 ? "MUY SALUDABLE" : remates <= 3 ? "SALUDABLE" : remates <= 8 ? "PRECAUCIÓN" : "ALERTA";
  const color = SALUD_COLORS[cat] ?? "#6b7280";
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        🏦 Salud financiera
      </div>
      <div className="rounded-xl border p-3" style={{ borderColor: `${color}66`, background: `${color}10` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${color}22`, color }}>
            {cat}
          </span>
          <span className="text-xs text-muted-foreground">
            {remates === 0
              ? "Sin remates activos ✅"
              : `${remates} remate${remates !== 1 ? "s" : ""} activo${remates !== 1 ? "s" : ""} en ${n.municipio}`}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground/70">Fuente: avisos judiciales públicos</p>
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
  const [op, setOp] = useState<"venta" | "arriendo">("venta");
  const [precioMax, setPrecioMax] = useState<number | null>(null);
  const [areaMin, setAreaMin] = useState(0);

  // Server-side op filter — avoids client-side case-mismatch, separate cached query per tab
  const { data: listingsData, isLoading, isFetching } = useListings(n.id, 100, 0, op);
  const listings = listingsData?.listings ?? [];

  const maxPrecioData = listings.reduce((m, l) => Math.max(m, l.precio_cop ?? 0), 0);
  const maxAreaData = Math.ceil(listings.reduce((m, l) => Math.max(m, l.area_m2 ?? 0), 50) / 10) * 10;
  const sliderPrecio = precioMax ?? maxPrecioData;

  // Reset filters on tab change
  useEffect(() => {
    setPrecioMax(null);
    setAreaMin(0);
  }, [op]);

  const filtered = listings.filter(
    (l) =>
      (precioMax === null || (l.precio_cop ?? 0) <= precioMax) &&
      (l.area_m2 ?? 0) >= areaMin
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
          {isLoading
            ? "Cargando…"
            : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${listingsData ? ` de ${listingsData.total} en ${op}` : ""}`}
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
        <FilterRow
          label={
            isLoading
              ? "Precio máx · cargando…"
              : maxPrecioData > 0
              ? `Precio máx · ${formatCOP(sliderPrecio)}`
              : "Precio máx · sin datos"
          }
          onReset={precioMax !== null ? () => setPrecioMax(null) : undefined}
        >
          <input
            type="range"
            min={0}
            max={maxPrecioData || 1}
            step={Math.max(5_000_000, Math.round(maxPrecioData / 50))}
            value={sliderPrecio}
            disabled={isLoading || maxPrecioData === 0}
            onChange={(e) => setPrecioMax(Number(e.target.value))}
            className="w-full accent-[#00d4ff] disabled:opacity-40"
          />
        </FilterRow>
        <FilterRow
          label={`Área mín · ${areaMin} m²`}
          onReset={areaMin > 0 ? () => setAreaMin(0) : undefined}
        >
          <input
            type="range"
            min={0}
            max={maxAreaData || 200}
            step={5}
            value={areaMin}
            disabled={isLoading}
            onChange={(e) => setAreaMin(Number(e.target.value))}
            className="w-full accent-[#00d4ff] disabled:opacity-40"
          />
        </FilterRow>
      </div>

      {(isLoading || isFetching) && (
        <div className="h-1 w-full animate-pulse rounded-full bg-primary/20" />
      )}

      <div className="space-y-2">
        {filtered.map((l) => <ListingCard key={l.id} l={l} />)}
        {!isLoading && filtered.length === 0 && listings.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No hay listings con estos filtros.
          </div>
        )}
        {!isLoading && listings.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No hay listings de {op} disponibles.
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

function FilterRow({ label, children, onReset }: { label: string; children: React.ReactNode; onReset?: () => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {onReset && (
          <button onClick={onReset} className="text-[10px] text-primary hover:underline">
            resetear
          </button>
        )}
      </div>
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
  const apiLiq = n.liquidez_api;
  const cat = (apiLiq?.categoria ?? "MEDIA") as import("@/data/marketActivity").LiquidityCat;
  const colors = LIQUIDITY_COLORS[cat] ?? LIQUIDITY_COLORS["MEDIA"];
  const score = apiLiq?.score ?? 50;
  const tiempoEstimado = apiLiq?.tiempo_estimado_venta ?? "—";
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
            {cat}
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
  const apiOpp = n.oportunidad;
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

