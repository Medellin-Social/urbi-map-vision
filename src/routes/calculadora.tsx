import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  Loader2,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { z } from "zod";
import { Navbar } from "@/components/Navbar";
import { formatCOP, formatPct } from "@/lib/format";
import { auth } from "@/lib/auth";
import { useBarrios } from "@/hooks/useBarrios";
import { useSimular, type SimulacionResponse } from "@/hooks/useCalculadora";

const searchSchema = z.object({
  barrio: z.coerce.number().optional(),
});

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora de Rentabilidad · Urbidata" },
      { name: "description", content: "Simula el retorno de tu inversión inmobiliaria en Medellín. Calcula yield bruto, flujo de caja y proyección a 10 años por barrio." },
    ],
  }),
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: CalculadoraPage,
});

type Tipo = "airbnb" | "larga" | "media";
type Horizonte = 3 | 5 | 10 | 20;

type PerfilExtra = {
  n_unidades?: string;
  tipo_gestion?: string;
  target_inquilino?: string;
  amoblado?: string;
  tipo_pago?: string;
  horizonte_inversion?: string;
};

const PRESUPUESTO_FROM_BUDGET: Record<string, number> = {
  "<200": 150,
  "200-500": 350,
  "500-1000": 750,
  ">1000": 1200,
};

const GOAL_TO_TIPO: Record<string, Tipo> = {
  airbnb: "airbnb",
  mediano_plazo: "media",
  "renta-larga": "larga",
};

const USD_RATE = 4100;

const TIPO_OPTIONS: { id: Tipo; emoji: string; label: string; sub: string }[] = [
  { id: "airbnb", emoji: "🏖️", label: "Airbnb", sub: "Short-term rental" },
  { id: "media", emoji: "🧳", label: "Mid-term rental", sub: "Nomads" },
  { id: "larga", emoji: "🏠", label: "Long-term rental", sub: "Traditional" },
];

const PRESETS = [200, 350, 500, 1000];

function tipoToApi(t: Tipo): "airbnb" | "renta_larga" | "renta_media" {
  if (t === "larga") return "renta_larga";
  if (t === "media") return "renta_media";
  return "airbnb";
}

function scoreToRating(score: number): { label: string; stars: number; toneClass: string } {
  if (score >= 80) return { label: "EXCELENTE", stars: 5, toneClass: "from-success/30 to-success/5 border-success/50 text-success" };
  if (score >= 60) return { label: "BUENO", stars: 4, toneClass: "from-primary/30 to-primary/5 border-primary/50 text-primary" };
  if (score >= 40) return { label: "MODERADO", stars: 3, toneClass: "from-warning/30 to-warning/5 border-warning/50 text-warning" };
  if (score >= 20) return { label: "BAJO", stars: 2, toneClass: "from-orange-500/30 to-orange-500/5 border-orange-500/50 text-orange-400" };
  return { label: "MUY BAJO", stars: 1, toneClass: "from-danger/30 to-danger/5 border-danger/50 text-danger" };
}


function ValorizacionTimeline({ r, horizonte }: { r: SimulacionResponse; horizonte: Horizonte }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tasa = r.valorizacion.tasa_anual_pct / 100;
  const inicial = r.presupuesto_cop;
  const ingresosNetos = r.valorizacion.retorno_total_5anos_cop - r.valorizacion.ganancia_5anos_cop;
  const rentaAnualNeta = ingresosNetos / 5;
  const puntos: { label: string; valor: number; rentaAcum: number }[] = [
    { label: "Hoy",   valor: inicial, rentaAcum: 0 },
    { label: "Año 1", valor: Math.round(inicial * (1 + tasa)), rentaAcum: Math.round(rentaAnualNeta) },
    { label: "Año 3", valor: r.valorizacion.valor_3anos_cop, rentaAcum: Math.round(rentaAnualNeta * 3) },
    { label: "Año 5", valor: r.valorizacion.valor_5anos_cop, rentaAcum: Math.round(rentaAnualNeta * 5) },
  ];
  if (horizonte >= 10) {
    puntos.push({ label: "Año 10", valor: Math.round(inicial * Math.pow(1 + tasa, 10)), rentaAcum: Math.round(rentaAnualNeta * 10) });
  }
  if (horizonte === 20) {
    puntos.push({ label: "Año 20", valor: r.valor_20anos_cop ?? Math.round(inicial * Math.pow(1 + tasa, 20)), rentaAcum: Math.round(rentaAnualNeta * 20) });
  }
  const vals = puntos.map((p) => p.valor);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const pad = (maxVal - minVal) * 0.15 || inicial * 0.05;
  const displayIndex = activeIndex ?? puntos.length - 1;

  return (
    <Card>
      <CardTitle>Valorización proyectada · {r.valorizacion.tasa_anual_pct.toFixed(1)}%/año</CardTitle>
      <div className="mt-3 h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={puntos}
            margin={{ top: 8, right: 12, bottom: 0, left: 12 }}
            onMouseMove={(e: any) => {
              if (e?.activeTooltipIndex !== undefined) setActiveIndex(e.activeTooltipIndex);
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#ffffff" }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[minVal - pad, maxVal + pad]} />
            <Tooltip
              active={true}
              defaultIndex={displayIndex}
              cursor={{ stroke: "rgba(0,212,255,0.3)", strokeWidth: 1 }}
              content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload as { label: string; valor: number; rentaAcum: number };
                if (d.label === "Hoy") return null;
                const apreciacion = d.valor - inicial;
                const retornoTotal = apreciacion + d.rentaAcum;
                const roiPct = ((retornoTotal / inicial) * 100).toFixed(1);
                return (
                  <div className="rounded-lg border border-border bg-surface/95 p-3 shadow-lg backdrop-blur-md text-xs min-w-[150px]">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{d.label}</div>
                    <div className="font-display text-sm font-bold text-foreground">{formatCOP(d.valor)}</div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between gap-3 text-[10px]">
                        <span className="text-muted-foreground">Valorización</span>
                        <span className="text-success">+{formatCOP(apreciacion)}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-[10px]">
                        <span className="text-muted-foreground">Ingresos</span>
                        <span className="text-success">+{formatCOP(d.rentaAcum)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 border-t border-border/60 pt-1.5 flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">ROI total</span>
                      <span className="text-[12px] font-bold text-primary">+{roiPct}%</span>
                    </div>
                    {r.down_payment_cop != null && apreciacion > 0 && (
                      <div className="mt-1 flex justify-between items-center border-t border-primary/20 pt-1">
                        <span className="text-[10px] text-primary/70">Apreciación / entrada</span>
                        <span className="text-[12px] font-bold text-accent">
                          +{Math.round((apreciacion / r.down_payment_cop) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              stroke="#00d4ff"
              strokeWidth={2}
              dot={{ r: 6, fill: "#00d4ff", stroke: "#00d4ff", strokeWidth: 0 }}
              activeDot={{ r: 9, fill: "#00d4ff", strokeWidth: 2, stroke: "rgba(0,212,255,0.4)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <TrendingUp className="h-3 w-3 shrink-0" />
        <span>
          +{formatCOP(ingresosNetos)} en ingresos netos (5 años) · Retorno total:{" "}
          <span className="font-semibold text-foreground">
            {formatCOP(r.valorizacion.retorno_total_5anos_cop)}
          </span>
        </span>
      </div>
      {r.down_payment_cop != null && r.down_payment_cop > 0 && (
        <div className="mt-1.5 flex items-start gap-1 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-[11px]">
          <TrendingUp className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="text-muted-foreground">
              Tu entrada de{" "}
              <span className="font-semibold text-foreground">{formatCOP(r.down_payment_cop)}</span>{" "}
              controla un inmueble que aprecia{" "}
              <span className="font-semibold text-foreground">
                {formatCOP(r.valorizacion.ganancia_5anos_cop)}
              </span>{" "}
              en 5 años —{" "}
            </span>
            <span className="font-bold text-primary">
              +{Math.round((r.valorizacion.ganancia_5anos_cop / r.down_payment_cop) * 100)}% sobre tu entrada
            </span>
          </span>
        </div>
      )}
    </Card>
  );
}

function CalculadoraPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/calculadora" });
  const { data: barrios = [], isPlaceholderData } = useBarrios();

  const [barrioId, setBarrioId] = useState<number>(search.barrio ?? 0);

  // Initialize to first real barrio once placeholder resolves
  useEffect(() => {
    if (isPlaceholderData || barrios.length === 0) return;
    setBarrioId((prev) => {
      if (prev !== 0 && barrios.some((b) => b.id === prev)) return prev;
      return search.barrio && barrios.some((b) => b.id === search.barrio)
        ? search.barrio
        : barrios[0].id;
    });
  }, [barrios, isPlaceholderData, search.barrio]);
  const [presupuesto, setPresupuesto] = useState<number>(350);
  const [presupuestoStr, setPresupuestoStr] = useState<string>("350");
  const [tipo, setTipo] = useState<Tipo>("airbnb");
  const [horizonte, setHorizonte] = useState<Horizonte>(5);
  const [perfilExtra, setPerfilExtra] = useState<PerfilExtra>({});

  // Load profile from localStorage once on mount
  useEffect(() => {
    const u = auth.get();
    if (!u) return;
    if (u.goal && GOAL_TO_TIPO[u.goal]) setTipo(GOAL_TO_TIPO[u.goal]);
    if (u.budget && PRESUPUESTO_FROM_BUDGET[u.budget]) {
      const p = PRESUPUESTO_FROM_BUDGET[u.budget];
      setPresupuesto(p);
      setPresupuestoStr(String(p));
    }
    const hz = u.horizonteInversion ?? "";
    if (hz.includes("20")) setHorizonte(20);
    else if (hz.includes("10")) setHorizonte(10);
    else if (hz.includes("5")) setHorizonte(5);
    setPerfilExtra({
      n_unidades: u.nUnidades,
      tipo_gestion: u.tipoGestion,
      target_inquilino: u.targetInquilino,
      amoblado: u.amoblado,
      tipo_pago: u.tipoPago,
      horizonte_inversion: u.horizonteInversion,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate, isPending, isError, error, data: simResult, reset } = useSimular();

  const handleCalcular = () => {
    mutate({
      barrio_id: barrioId,
      presupuesto_cop: presupuesto * 1_000_000,
      tipo_inversion: tipoToApi(tipo),
      perfil_riesgo: "moderado",
      ...perfilExtra,
    });
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

            {/* Profile badge */}
            {buildPerfilBadge(tipo, perfilExtra) && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Perfil activo</div>
                  <div className="mt-0.5 text-xs text-foreground">{buildPerfilBadge(tipo, perfilExtra)}</div>
                </div>
                <Link to="/perfil" className="text-[10px] text-primary hover:underline">Cambiar</Link>
              </div>
            )}

            {/* Barrio */}
            <Field label="Zona / Barrio">
              <select
                value={barrioId}
                onChange={(e) => {
                  setBarrioId(Number(e.target.value));
                  reset();
                }}
                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {barrios.map((n) => (
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
                  type="text"
                  inputMode="numeric"
                  value={presupuestoStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setPresupuestoStr(raw);
                    const n = Number(raw);
                    if (raw !== "" && n > 0) {
                      setPresupuesto(clamp(n, 1, 2000));
                      reset();
                    }
                  }}
                  onBlur={() => {
                    const n = Number(presupuestoStr);
                    if (!presupuestoStr || n <= 0) {
                      setPresupuestoStr(String(presupuesto));
                    } else {
                      const clamped = clamp(n, 50, 2000);
                      setPresupuesto(clamped);
                      setPresupuestoStr(String(clamped));
                    }
                  }}
                  className="w-28 rounded-md border border-border bg-background/60 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">M COP</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  ≈ ${((presupuesto * 1_000_000) / USD_RATE).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  USD
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={presupuesto}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPresupuesto(n);
                  setPresupuestoStr(String(n));
                  reset();
                }}
                className="mt-3 w-full accent-[#00d4ff]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPresupuesto(p);
                      setPresupuestoStr(String(p));
                      reset();
                    }}
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
                    onClick={() => {
                      setTipo(t.id);
                      reset();
                    }}
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
                {([3, 5, 10, 20] as const).map((h) => (
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
              disabled={isPending || !presupuesto || presupuesto <= 0}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 glow-cyan disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
                </>
              ) : (
                <>
                  Calcular <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {isError && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                {error instanceof Error ? error.message : "Error al calcular. Intenta de nuevo."}
              </div>
            )}
          </section>

          {/* RIGHT */}
          <section className="min-h-[400px]">
            <AnimatePresence mode="wait">
              {simResult ? (
                <ResultsPanel
                  key={`${barrioId}-${tipo}-${horizonte}-${presupuesto}`}
                  r={simResult}
                  horizonte={horizonte}
                  barrioId={barrioId}
                />
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
                      Ajusta los parámetros y presiona{" "}
                      <span className="text-primary">Calcular</span> para ver los resultados.
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

function ResultsPanel({ r, horizonte, barrioId }: { r: SimulacionResponse; horizonte: Horizonte; barrioId: number }) {
  const navigate = useNavigate();
  const { label: ratingLabel, stars, toneClass } = scoreToRating(r.score_oportunidad);

  const tipoLabel = {
    airbnb: "Airbnb",
    renta_larga: "Arriendo largo",
    renta_media: "Renta media",
  }[r.tipo_inversion] ?? r.tipo_inversion;

  const ingresosNetosAcum5 =
    r.valorizacion.retorno_total_5anos_cop - r.valorizacion.ganancia_5anos_cop;
  const roiTotal = (r.valorizacion.retorno_total_5anos_cop / r.presupuesto_cop) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Rating header */}
      <div className={`rounded-2xl border bg-gradient-to-br ${toneClass} p-5`}>
        <div className="text-[11px] font-medium uppercase tracking-widest opacity-60">
          {titleCase(r.barrio)} · {tipoLabel} · {formatCOP(r.presupuesto_cop)}
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl tracking-widest">
            {"★".repeat(stars)}
            <span className="opacity-20">{"★".repeat(5 - stars)}</span>
          </span>
          <span className="font-display text-xl font-bold">{ratingLabel}</span>
        </div>
        <div className="mt-1 text-[10px] opacity-60">
          Calidad de inversión · Mayor score = mejor oportunidad
        </div>
      </div>

      {/* Row 1 - 4 metrics */}
      <div className="grid grid-cols-2 gap-3">
        <BigMetric
          label="Ingreso/mes"
          value={formatCOP(r.ingresos.mensual_cop)}
          sub={`~$${r.ingresos.mensual_usd.toLocaleString("en-US")} USD`}
          delay={0.1}
        />
        <BigMetric
          label="Yield neto / año"
          value={formatPct(r.yields.neto_pct)}
          sub={
            <span className="block space-y-0.5">
              {{
                airbnb:      <span className="block">−38% opex (plataforma + limpieza + vacancia + suministros)</span>,
                renta_larga: <span className="block">−28% opex (admin edificio + predial + seguros + mant. + vacancia)</span>,
                renta_media: <span className="block">−22% opex (admin + predial + seguros + mant. + vacancia)</span>,
              }[r.tipo_inversion] ?? <span className="block">Después de descontar costos operativos</span>}
              <span className="mt-1 block font-medium text-foreground/70">
                Ingreso neto mensual:{" "}
                {formatCOP(Math.round((r.presupuesto_cop * r.yields.neto_pct) / 100 / 12))}
              </span>
            </span>
          }
          delay={0.15}
        />
        <BigMetric
          label="Área estim."
          value={`~${r.area_comprable_m2.toFixed(0)} m²`}
          sub={`Presupuesto: ${formatCOP(r.presupuesto_cop)}`}
          delay={0.2}
        />
        <BigMetric
          label="Recupero"
          value={r.recupero.neto_anos < 50 ? `${r.recupero.neto_anos.toFixed(1)} años` : "> 50 años"}
          sub={r.recupero.neto_anos < 50 ? "neto / año" : "yield bajo para recuperar"}
          delay={0.25}
        />
      </div>

      {/* Row 2 - Timeline valorización */}
      <ValorizacionTimeline r={r} horizonte={horizonte} />

      {/* Row 3 - Retorno total */}
      <Card>
        <CardTitle>Retorno total · 5 años</CardTitle>
        <div className="mt-2 font-display text-4xl font-bold text-primary text-glow-cyan">
          {formatCOP(r.valorizacion.retorno_total_5anos_cop)}
        </div>
        <div className="mt-3 space-y-1 text-xs">
          <RowItem label="Valorización" value={formatCOP(r.valorizacion.ganancia_5anos_cop)} />
          <RowItem label="Ingresos netos acum." value={formatCOP(ingresosNetosAcum5)} />
          <RowItem label="Inversión inicial" value={formatCOP(r.presupuesto_cop)} muted />
          <div className="mt-2 border-t border-border/60 pt-2">
            <RowItem label="ROI total" value={`+${roiTotal.toFixed(1)}%`} bold />
          </div>
        </div>
      </Card>

      {/* Row 4 - Resumen */}
      {r.resumen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
        >
          <div className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Resumen
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/90">{r.resumen}</p>
        </motion.div>
      )}

      {/* Profile desglose */}
      <PerfilDesgloseCard r={r} />

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
        <button
          onClick={() => navigate({ to: "/comparador" })}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          Comparar barrios <ArrowRight className="h-3 w-3" />
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

/* ---------- Profile desglose ---------- */

function PerfilDesgloseCard({ r }: { r: SimulacionResponse }) {
  if (r.ingreso_bruto_mensual != null && r.costo_gestion_mensual != null && r.ingreso_neto_gestion_mensual != null) {
    return (
      <Card>
        <CardTitle>Desglose gestión</CardTitle>
        <div className="mt-2 space-y-1.5 text-xs">
          {r.n_unidades_efectivo != null && r.n_unidades_efectivo > 1 && (
            <div className="mb-2 text-[11px] font-semibold text-primary">
              Simulación para {r.n_unidades_efectivo} unidades
            </div>
          )}
          <RowItem label="Ingreso bruto Airbnb" value={formatCOP(r.ingreso_bruto_mensual) + "/mes"} />
          <RowItem label="Costo gestión (−25%)" value={`−${formatCOP(r.costo_gestion_mensual)}/mes`} />
          <div className="border-t border-border/60 pt-1.5">
            <RowItem label="Ingreso neto" value={formatCOP(r.ingreso_neto_gestion_mensual) + "/mes"} bold />
          </div>
        </div>
      </Card>
    );
  }
  if (r.cuota_mensual != null && r.flujo_neto_mensual != null) {
    const positive = r.flujo_neto_mensual >= 0;
    return (
      <Card>
        <CardTitle>Análisis crédito hipotecario · 70% LTV</CardTitle>
        <div className="mt-2 space-y-1.5 text-xs">
          {/* Estructura de capital */}
          {r.down_payment_cop != null && r.monto_credito_cop != null && (
            <div className="mb-2.5 rounded-md border border-border/60 bg-background/40 px-3 py-2 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Estructura de capital</div>
              <RowItem label="Entrada (30%)" value={formatCOP(r.down_payment_cop)} />
              <RowItem label="Crédito banco (70%)" value={formatCOP(r.monto_credito_cop)} />
            </div>
          )}
          {/* Flujo mensual */}
          <RowItem label="Arriendo neto (−10%)" value={formatCOP(Math.round(r.ingresos.mensual_cop * 0.9)) + "/mes"} />
          <RowItem label="Cuota hipoteca (est.)" value={`−${formatCOP(r.cuota_mensual)}/mes`} />
          <div className="border-t border-border/60 pt-1.5">
            <RowItem
              label="Flujo neto mensual"
              value={`${positive ? "+" : ""}${formatCOP(r.flujo_neto_mensual)}/mes`}
              bold
            />
          </div>
          <div className={`rounded-md px-3 py-2 text-[11px] ${positive ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            {positive
              ? `✅ Flujo positivo: +${formatCOP(r.flujo_neto_mensual)}/mes sobre la cuota`
              : `⚠️ Flujo negativo: necesitas aportar ${formatCOP(Math.abs(r.flujo_neto_mensual))}/mes`}
          </div>
          {/* Retorno sobre capital propio */}
          {r.yield_coc_pct != null && r.recupero_credito_anos != null && (
            <div className="mt-1 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Sobre capital propio (entrada)</div>
              <RowItem
                label="Cash-on-cash yield"
                value={`${r.yield_coc_pct.toFixed(1)}%/año`}
                bold={r.yield_coc_pct > 0}
              />
              {r.yield_coc_pct > 0 && (
                <RowItem
                  label="Recupero entrada"
                  value={r.recupero_credito_anos < 100 ? `${r.recupero_credito_anos.toFixed(1)} años` : "N/A"}
                />
              )}
            </div>
          )}
          {r.nota_hipoteca && (
            <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <span className="shrink-0">ℹ️</span>
              <span>{r.nota_hipoteca}</span>
            </div>
          )}
        </div>
      </Card>
    );
  }
  if (r.costo_amoblado != null && r.presupuesto_efectivo != null) {
    return (
      <Card>
        <CardTitle>Desglose presupuesto</CardTitle>
        <div className="mt-2 space-y-1.5 text-xs">
          <RowItem label="Presupuesto total" value={formatCOP(r.presupuesto_cop)} />
          <RowItem label="Costo amoblado est." value={`−${formatCOP(r.costo_amoblado)}`} />
          <div className="border-t border-border/60 pt-1.5">
            <RowItem label="Presupuesto efectivo" value={formatCOP(r.presupuesto_efectivo)} bold />
          </div>
        </div>
      </Card>
    );
  }
  return null;
}

function buildPerfilBadge(tipo: Tipo, extra: PerfilExtra): string {
  const parts: string[] = [];
  if (tipo === "airbnb") {
    const u = extra.n_unidades ?? "";
    if (u.includes("2-5")) parts.push("3 unidades");
    else if (u.includes("5+")) parts.push("6 unidades");
    else if (u) parts.push("1 unidad");
    const g = (extra.tipo_gestion ?? "").toLowerCase();
    if (g.includes("manager")) parts.push("Con administrador");
    else if (g.includes("self")) parts.push("Self-managed");
  } else if (tipo === "media") {
    const t = (extra.target_inquilino ?? "").toLowerCase();
    if (t.includes("nomad")) parts.push("Nómadas");
    else if (t.includes("student")) parts.push("Estudiantes");
    else if (t.includes("exec") || t.includes("prof")) parts.push("Ejecutivos");
    else if (t) parts.push("Flexible");
    const a = (extra.amoblado ?? "").toLowerCase();
    if (a.includes("furnished") || a.includes("fully")) parts.push("Amoblado");
    else if (a.includes("unfurnished")) parts.push("Sin amueblar");
  } else if (tipo === "larga") {
    const p = (extra.tipo_pago ?? "").toLowerCase();
    if (p.includes("mortgage") || p.includes("financing")) parts.push("Crédito hipotecario");
    else if (p.includes("cash")) parts.push("Contado");
    const h = extra.horizonte_inversion ?? "";
    if (h.includes("20")) parts.push("20+ años");
    else if (h.includes("10")) parts.push("10 años");
    else if (h.includes("5")) parts.push("5 años");
  }
  return parts.join(" · ");
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
    <div className="rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur-xl">
      {children}
    </div>
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
  sub?: React.ReactNode;
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
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${
          accent === "success"
            ? "text-success"
            : accent === "warning"
            ? "text-warning"
            : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

function RowItem({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className={bold ? "font-display text-base font-bold text-success" : "font-medium"}>
        {value}
      </span>
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
