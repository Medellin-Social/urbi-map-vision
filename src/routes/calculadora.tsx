import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { z } from "zod";
import { Navbar } from "@/components/Navbar";
import { NEIGHBORHOODS, type Neighborhood } from "@/data/neighborhoods";
import { opportunityForBarrio } from "@/data/marketActivity";
import { formatCOP, formatPct } from "@/lib/format";

const searchSchema = z.object({
  barrio: z.coerce.number().optional(),
});

export const Route = createFileRoute("/calculadora")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: CalculadoraPage,
});

type Tipo = "airbnb" | "larga" | "media";
type Horizonte = 3 | 5 | 10;

const USD_RATE = 4100;
const VALORIZACION = 0.107;
const CDT_YIELD = 10.5;

const TIPO_OPTIONS: { id: Tipo; emoji: string; label: string; sub: string }[] = [
  { id: "airbnb", emoji: "🏖️", label: "Airbnb", sub: "Renta corta" },
  { id: "larga", emoji: "🏠", label: "Renta larga", sub: "Tradicional" },
  { id: "media", emoji: "🧳", label: "Renta media", sub: "Nómadas" },
];

const PRESETS = [200, 350, 500, 1000];

function CalculadoraPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/calculadora" });

  const initialBarrio =
    NEIGHBORHOODS.find((n) => n.id === search.barrio) ?? NEIGHBORHOODS[0];

  const [barrioId, setBarrioId] = useState<number>(initialBarrio.id);
  const [presupuesto, setPresupuesto] = useState<number>(350); // millones COP
  const [tipo, setTipo] = useState<Tipo>("airbnb");
  const [horizonte, setHorizonte] = useState<Horizonte>(5);
  const [results, setResults] = useState<ReturnType<typeof computeResults> | null>(null);

  const barrio = NEIGHBORHOODS.find((n) => n.id === barrioId) ?? NEIGHBORHOODS[0];

  const handleCalcular = () => {
    setResults(computeResults({ barrio, presupuestoM: presupuesto, tipo, horizonte }));
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background">
      <Navbar />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-72 bg-gradient-to-b from-primary/10 via-accent/5 to-transparent" />

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
        <button
          onClick={() => navigate({ to: "/map" })}
          className="mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al mapa
        </button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          {/* LEFT */}
          <section className="rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-xl">
            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-primary">
                <Calculator className="h-3 w-3" /> Calculadora
              </div>
              <h1 className="mt-1 font-display text-2xl font-semibold">Simula tu inversión</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Resultados basados en datos reales del mercado
              </p>
            </div>

            {/* Barrio */}
            <Field label="Zona / Barrio">
              <select
                value={barrioId}
                onChange={(e) => setBarrioId(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {NEIGHBORHOODS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {titleCase(n.nombre)} · {n.comuna}
                  </option>
                ))}
              </select>
            </Field>

            {/* Presupuesto */}
            <Field label="Presupuesto">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={2000}
                  step={50}
                  value={presupuesto}
                  onChange={(e) => setPresupuesto(clamp(Number(e.target.value), 50, 2000))}
                  className="w-28 rounded-md border border-border bg-background/60 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">M COP</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  ≈ ${((presupuesto * 1_000_000) / USD_RATE).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={presupuesto}
                onChange={(e) => setPresupuesto(Number(e.target.value))}
                className="mt-3 w-full accent-[#00d4ff]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPresupuesto(p)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                      presupuesto === p
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ${p}M
                  </button>
                ))}
              </div>
            </Field>

            {/* Tipo */}
            <Field label="Tipo de inversión">
              <div className="grid grid-cols-3 gap-2">
                {TIPO_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      tipo === t.id
                        ? "border-primary bg-primary/10 glow-cyan"
                        : "border-border bg-background/40 hover:border-primary/40"
                    }`}
                  >
                    <div className="text-lg">{t.emoji}</div>
                    <div className="mt-1 text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] text-muted-foreground">{t.sub}</div>
                  </button>
                ))}
              </div>
            </Field>

            {/* Horizonte */}
            <Field label="Horizonte">
              <div className="inline-flex w-full rounded-md border border-border p-0.5">
                {([3, 5, 10] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonte(h)}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition ${
                      horizonte === h
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {h} años
                  </button>
                ))}
              </div>
            </Field>

            <button
              onClick={handleCalcular}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 glow-cyan"
            >
              Calcular <ArrowRight className="h-4 w-4" />
            </button>
          </section>

          {/* RIGHT */}
          <section className="min-h-[400px]">
            <AnimatePresence mode="wait">
              {results ? (
                <ResultsPanel key={`${barrio.id}-${tipo}-${horizonte}-${presupuesto}-${results.stamp}`} r={results} />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid h-full min-h-[400px] place-items-center rounded-2xl border border-dashed border-border bg-surface/30 p-10 text-center"
                >
                  <div>
                    <Sparkles className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Ajusta los parámetros y presiona <span className="text-primary">Calcular</span> para ver los resultados.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ---------- Results ---------- */

function ResultsPanel({ r }: { r: ReturnType<typeof computeResults> }) {
  const ratingTone =
    r.rating === "EXCELENTE"
      ? "from-success/30 to-success/5 border-success/50 text-success"
      : r.rating === "BUENA OPORTUNIDAD"
        ? "from-primary/30 to-primary/5 border-primary/50 text-primary"
        : r.rating === "MODERADA"
          ? "from-warning/30 to-warning/5 border-warning/50 text-warning"
          : "from-danger/30 to-danger/5 border-danger/50 text-danger";

  const ratingEmoji =
    r.rating === "EXCELENTE" ? "🟢" : r.rating === "BUENA OPORTUNIDAD" ? "🔵" : r.rating === "MODERADA" ? "🟡" : "🔴";

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className={`rounded-2xl border bg-gradient-to-br ${ratingTone} p-5`}>
        <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">
          {ratingEmoji} {r.rating}
        </div>
        <div className="mt-1 font-display text-xl font-semibold text-foreground">
          {titleCase(r.barrio.nombre)} · {r.tipoLabel} · {formatCOP(r.presupuesto)}
        </div>
      </div>

      {/* Row 1 - 4 metrics */}
      <div className="grid grid-cols-2 gap-3">
        <BigMetric
          label="Ingreso/mes"
          value={formatCOP(r.ingresoMensual)}
          sub={`~$${Math.round(r.ingresoMensual / USD_RATE).toLocaleString("en-US")} USD`}
          delay={0.1}
        />
        <BigMetric
          label="Yield neto"
          value={formatPct(r.yieldNeto)}
          sub={`vs CDT ${CDT_YIELD}%`}
          delay={0.15}
          accent={r.yieldNeto >= CDT_YIELD ? "success" : "warning"}
        />
        <BigMetric
          label="Área estim."
          value={`~${r.areaM2.toFixed(0)} m²`}
          sub={`@ ${formatCOP(r.barrio.precio_m2)}/m²`}
          delay={0.2}
        />
        <BigMetric
          label="Recupero"
          value={`${r.anosRecupero.toFixed(1)} años`}
          sub="neto"
          delay={0.25}
        />
      </div>

      {/* Row 2 - Valorización */}
      <Card>
        <CardTitle>Valorización proyectada</CardTitle>
        <div className="mt-3 h-40">
          <ResponsiveContainer>
            <BarChart data={r.valorizacionData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,212,255,0.06)" }}
                contentStyle={{
                  background: "rgba(17,24,39,0.95)",
                  border: "1px solid rgba(0,212,255,0.3)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [formatCOP(Number(v)), "Valor"]}
              />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {r.valorizacionData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#374151" : i === r.valorizacionData.length - 1 ? "#00d4ff" : "#7c3aed"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
          <TrendingUp className="h-3 w-3" /> +{formatCOP(r.gananciaValorizacion)} en valorización
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Tasa histórica Medellín: {(VALORIZACION * 100).toFixed(1)}%/año
        </div>
      </Card>

      {/* Row 3 - Retorno total */}
      <Card>
        <CardTitle>Retorno total · {r.horizonte} años</CardTitle>
        <div className="mt-2 font-display text-4xl font-bold text-primary text-glow-cyan">
          {formatCOP(r.retornoTotal)}
        </div>
        <div className="mt-3 space-y-1 text-xs">
          <Row label="Valorización" value={formatCOP(r.gananciaValorizacion)} />
          <Row label="Ingresos netos" value={formatCOP(r.ingresosNetosAcum)} />
          <Row label="Inversión inicial" value={formatCOP(r.presupuesto)} muted />
          <div className="mt-2 border-t border-border/60 pt-2">
            <Row label="ROI total" value={`+${r.roiTotal.toFixed(1)}%`} bold />
          </div>
        </div>
      </Card>

      {/* Row 4 - vs CDT */}
      <Card>
        <CardTitle>Comparación vs CDT</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Tu inversión</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Yield {formatPct(r.yieldNeto)} + valor. {(VALORIZACION * 100).toFixed(1)}%
            </div>
            <div className="mt-2 font-display text-xl font-bold">{(r.yieldNeto + VALORIZACION * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">retorno anual total</div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CDT bancario</div>
            <div className="mt-1 text-xs text-muted-foreground">Sin valorización</div>
            <div className="mt-2 font-display text-xl font-bold">{CDT_YIELD}%</div>
            <div className="text-[10px] text-muted-foreground">retorno anual</div>
          </div>
        </div>
        {r.yieldNeto + VALORIZACION * 100 > CDT_YIELD && (
          <div className="mt-3 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
            ✓ Tu propiedad supera al CDT en retorno total
          </div>
        )}
      </Card>

      {/* Row 5 - Alertas */}
      {r.alertas.length > 0 && (
        <div className="space-y-2">
          {r.alertas.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Row 6 - CTAs */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/20">
          Ver barrios similares <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator.share({ title: "Simulación Urbidata", url: window.location.href }).catch(() => {});
            } else if (typeof navigator !== "undefined") {
              navigator.clipboard?.writeText(window.location.href);
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background/40 py-2.5 text-xs font-semibold text-foreground transition hover:border-primary/40"
        >
          <Share2 className="h-3 w-3" /> Compartir simulación
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- Helpers / UI ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur-xl">{children}</div>
  );
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function BigMetric({
  label,
  value,
  sub,
  delay = 0,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  delay?: number;
  accent?: "success" | "warning";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-xl border border-border bg-surface/70 p-4 backdrop-blur-xl"
    >
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${
          accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className={bold ? "font-display text-base font-bold text-success" : "font-medium"}>{value}</span>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/* ---------- Calculation ---------- */

function computeResults({
  barrio,
  presupuestoM,
  tipo,
  horizonte,
}: {
  barrio: Neighborhood;
  presupuestoM: number;
  tipo: Tipo;
  horizonte: Horizonte;
}) {
  const presupuesto = presupuestoM * 1_000_000;
  const areaM2 = presupuesto / barrio.precio_m2;

  // Income depending on type
  let ingresoMensual: number;
  if (tipo === "airbnb") {
    // ADR proxy from m² × occupancy 65%
    const adr = Math.max(120_000, barrio.precio_m2 * 0.000045);
    ingresoMensual = adr * 0.65 * 30 * (areaM2 / 60);
  } else if (tipo === "media") {
    // Mid-term: 1.3x long rent, scaled by area
    ingresoMensual = (barrio.arriendo * 1.3 * areaM2) / 80;
  } else {
    ingresoMensual = (barrio.arriendo * areaM2) / 80;
  }

  const ingresoAnual = ingresoMensual * 12;
  const yieldBruto = (ingresoAnual / presupuesto) * 100;
  const yieldNeto = yieldBruto * 0.85;
  const anosRecupero = presupuesto / (ingresoAnual * 0.85);

  // Valorización
  const valorizacionData = [
    { label: "Hoy", valor: presupuesto },
    { label: `${Math.min(3, horizonte)} años`, valor: presupuesto * Math.pow(1 + VALORIZACION, Math.min(3, horizonte)) },
    { label: `${horizonte} años`, valor: presupuesto * Math.pow(1 + VALORIZACION, horizonte) },
  ];
  const valorFuturo = presupuesto * Math.pow(1 + VALORIZACION, horizonte);
  const gananciaValorizacion = valorFuturo - presupuesto;
  const ingresosNetosAcum = ingresoAnual * 0.85 * horizonte;
  const retornoTotal = gananciaValorizacion + ingresosNetosAcum;
  const roiTotal = (retornoTotal / presupuesto) * 100;

  // Rating
  const totalAnual = yieldNeto + VALORIZACION * 100;
  let rating: "EXCELENTE" | "BUENA OPORTUNIDAD" | "MODERADA" | "NO RECOMENDADA";
  if (totalAnual > 22) rating = "EXCELENTE";
  else if (totalAnual > 17) rating = "BUENA OPORTUNIDAD";
  else if (totalAnual > 13) rating = "MODERADA";
  else rating = "NO RECOMENDADA";

  // Alertas
  const alertas: string[] = [];
  if (areaM2 < 35) alertas.push(`Presupuesto bajo para ${titleCase(barrio.nombre)}: solo alcanza para ~${areaM2.toFixed(0)} m².`);
  if (yieldNeto < CDT_YIELD - 2) alertas.push(`Yield neto (${yieldNeto.toFixed(1)}%) está por debajo del CDT bancario.`);
  if (tipo === "airbnb" && barrio.dist_metro > 2) alertas.push("Distancia al metro >2km puede afectar ocupación Airbnb.");

  const tipoLabel = tipo === "airbnb" ? "Airbnb" : tipo === "media" ? "Renta media" : "Renta larga";

  return {
    barrio,
    presupuesto,
    tipoLabel,
    horizonte,
    areaM2,
    ingresoMensual,
    yieldBruto,
    yieldNeto,
    anosRecupero,
    valorizacionData,
    gananciaValorizacion,
    ingresosNetosAcum,
    retornoTotal,
    roiTotal,
    rating,
    alertas,
    stamp: Date.now(),
  };
}
