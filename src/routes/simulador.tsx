import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Lock,
  Loader2,
  RotateCcw,
  Share2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { z } from "zod";
import { MapNavbar } from "@/components/MapNavbar";
import { formatCOP, formatPct } from "@/lib/format";
import { auth } from "@/lib/auth";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useBarriosComunas, useBarriosPorComuna } from "@/hooks/useBarrios";
import {
  useSimular,
  useListingSimuladorData,
  useSimuladorAlternativas,
  type SimulacionResponse,
  type FlujoCajaDesglose,
  type ComparativoModalidad,
  type AlternativaListing,
} from "@/hooks/useCalculadora";
import { useIsPro, useIsAgente } from "@/components/LockedField";

const searchSchema = z.object({
  listing_id: z.coerce.number().optional(),
  barrio:     z.coerce.number().optional(),
  precio:     z.coerce.number().optional(),
  area:       z.coerce.number().optional(),
  uid:        z.string().optional(),
  fuente:     z.string().optional(),
  url_listing: z.string().optional(),
});

export const Route = createFileRoute("/simulador")({
  head: () => ({
    meta: [
      { title: "Simulador de Inversión · Medellin Social" },
      { name: "description", content: "Simula el retorno de tu inversión inmobiliaria en Medellín. Calcula yield real, flujo de caja y ROI a 20 años." },
    ],
  }),
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("medellin-social.user");
    if (!raw) {
      localStorage.setItem("registro_origen", "mls");
      throw redirect({ to: "/login" });
    }
    const u = JSON.parse(raw);
    if (u.plan !== "agente" && u.esAgente !== true) {
      throw redirect({ to: "/planes", search: { audiencia: "agente" } });
    }
  },
  component: SimuladorPage,
});

type Tipo = "airbnb" | "larga" | "media";
type Horizonte = 3 | 5 | 10 | 20;
type TipoCompra = "contado" | "credito";

const USD_RATE = 4100;
const PRESETS = [200, 350, 500, 800, 1000];

const TIPO_OPTIONS = [
  { id: "airbnb" as Tipo, emoji: "🏖️", label: "Airbnb", sub: "Renta corta · Turistas" },
  { id: "media" as Tipo, emoji: "💻", label: "Nómadas", sub: "Renta media · Profesionales" },
  { id: "larga" as Tipo, emoji: "🏠", label: "Renta larga", sub: "Tradicional · Familias" },
];

const VAC_DEFAULTS: Record<Tipo, number> = { airbnb: 25, media: 15, larga: 5 };
const MANT_DEFAULTS: Record<Tipo, number> = { airbnb: 1.5, media: 1, larga: 1 };

function tipoToApi(t: Tipo): "airbnb" | "renta_larga" | "renta_media" {
  if (t === "larga") return "renta_larga";
  if (t === "media") return "renta_media";
  return "airbnb";
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function calcCuota(presupuestoMill: number, cuotaIni: number, tasaAnual: number, plazo: number): number {
  const credito = presupuestoMill * 1_000_000 * (1 - cuotaIni / 100);
  const tm = tasaAnual / 100 / 12;
  const meses = plazo * 12;
  if (tm === 0) return credito / meses;
  return credito * tm / (1 - Math.pow(1 + tm, -meses));
}

function scoreToRating(score: number): { label: string; stars: number; bg: string; border: string; color: string } {
  if (score >= 80) return { label: "EXCELENTE", stars: 5, bg: "rgba(8,80,65,0.10)", border: "#085041", color: "#085041" };
  if (score >= 60) return { label: "BUENA INVERSIÓN", stars: 4, bg: "rgba(29,158,117,0.10)", border: "#1D9E75", color: "#1D9E75" };
  if (score >= 40) return { label: "MODERADA", stars: 3, bg: "rgba(186,117,23,0.10)", border: "#BA7517", color: "#BA7517" };
  if (score >= 20) return { label: "BAJA", stars: 2, bg: "rgba(216,90,48,0.10)", border: "#D85A30", color: "#D85A30" };
  return { label: "NO RECOMENDADA", stars: 1, bg: "rgba(216,90,48,0.14)", border: "#D85A30", color: "#D85A30" };
}

// ── Main page ────────────────────────────────────────────────────────────────

function SimuladorPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/simulador" });
  const isPro = useIsPro();
  const isAgente = useIsAgente();
  // Distinguishes "haven't checked yet" (matches SSR/first paint) from a
  // confirmed non-agent — without it, the redirect effect below and
  // useIsAgente's own internal effect race on the same mount commit and can
  // fire a false-positive redirect before isAgente resolves to its real value.
  const [agentChecked, setAgentChecked] = useState(false);

  // Zone/barrio
  const [comunaKey, setComunaKey] = useState<string | null>(null);
  const [barrioId, setBarrioId] = useState<number>(search.barrio ?? 0);
  const { data: comunasData } = useBarriosComunas();
  const { data: barriosDeComunaData, isLoading: isComunaLoading } = useBarriosPorComuna(comunaKey);

  // Budget
  const initPresupuesto = search.precio ? Math.max(1, Math.round(search.precio / 1_000_000)) : 350;
  const [presupuesto, setPresupuesto] = useState<number>(initPresupuesto);
  const [presupuestoStr, setPresupuestoStr] = useState<string>(String(initPresupuesto));

  // Tipo
  const [tipo, setTipo] = useState<Tipo>("airbnb");
  const [horizonte, setHorizonte] = useState<Horizonte>(5);

  // Tipo de compra
  const [tipoCompra, setTipoCompra] = useState<TipoCompra>("contado");
  const [cuotaInicial, setCuotaInicial] = useState(30);
  const [tasaAnual, setTasaAnual] = useState(13);
  const [plazoAnos, setPlazoAnos] = useState<10 | 15 | 20>(15);

  // Gastos
  const [showGastos, setShowGastos] = useState(false);
  const [adminMes, setAdminMes] = useState<string>("");
  const [vacanciaPct, setVacanciaPct] = useState<number>(VAC_DEFAULTS.airbnb);
  const [mantPct, setMantPct] = useState<number>(MANT_DEFAULTS.airbnb);
  const [seguroPct, setSeguroPct] = useState<number>(0.3);
  const [feePct, setFeePct] = useState<number>(15);
  const [predialStr, setPredialStr] = useState<string>("");
  const [retencion, setRetencion] = useState(false);

  // Sim result
  const { mutate, isPending, isError, error, data: simResult, reset } = useSimular();
  const [calcDone, setCalcDone] = useState(false);
  const qc = useQueryClient();

  // Auto-save simulation to historial
  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(API_ENDPOINTS.simuladorHistorial, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["simulador-historial"] }),
  });

  // Listing data (Flujo B)
  const listingId = search.listing_id ?? null;
  const { data: listingData, isLoading: listingLoading, error: listingError } = useListingSimuladorData(isPro ? listingId : null);

  // Alternativas
  const { data: alternativas, isLoading: altLoading } = useSimuladorAlternativas({
    presupuesto_max: presupuesto * 1_000_000,
    tipo_inversion: tipoToApi(tipo),
    listing_id: listingId,
    enabled: calcDone && isPro,
  });

  // Default commune on first load
  useEffect(() => {
    if (!comunasData?.length || comunaKey !== null) return;
    if (search.barrio || listingId) return;
    const first = comunasData.find((c) => c.municipio === "MEDELLIN");
    setComunaKey(first?.key ?? comunasData[0].key);
  }, [comunasData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default barrio in selected commune
  useEffect(() => {
    if (!barriosDeComunaData?.length) return;
    setBarrioId((prev) => {
      if (prev !== 0 && barriosDeComunaData.some((b) => b.id === prev)) return prev;
      return barriosDeComunaData[0].id;
    });
  }, [barriosDeComunaData]);

  // Pre-fill from ?barrio= param
  useEffect(() => {
    if (!search.barrio || !comunasData?.length) return;
    setBarrioId(search.barrio);
    apiFetch<{ id: number; nombre: string; municipio: string; comuna: string | null }>(
      API_ENDPOINTS.barrioInfo(search.barrio),
    )
      .then((b) => setComunaKey(b.comuna ?? b.municipio))
      .catch(() => {
        const first = comunasData.find((c) => c.municipio === "MEDELLIN");
        setComunaKey(first?.key ?? comunasData[0].key);
      });
  }, [search.barrio, comunasData?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from listing data (Flujo B)
  useEffect(() => {
    if (!listingData || !comunasData?.length) return;
    const p = Math.max(1, Math.round(listingData.precio / 1_000_000));
    setPresupuesto(p);
    setPresupuestoStr(String(p));
    setBarrioId(listingData.barrio_id);
    if (listingData.administracion) setAdminMes(String(listingData.administracion));
    apiFetch<{ id: number; nombre: string; municipio: string; comuna: string | null }>(
      API_ENDPOINTS.barrioInfo(listingData.barrio_id),
    )
      .then((b) => setComunaKey(b.comuna ?? b.municipio))
      .catch(() => {
        const first = comunasData.find((c) => c.municipio === "MEDELLIN");
        setComunaKey(first?.key ?? comunasData[0].key);
      });
    reset();
    setCalcDone(false);
  }, [listingData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update gastos defaults when tipo changes
  useEffect(() => {
    setVacanciaPct(VAC_DEFAULTS[tipo]);
    setMantPct(MANT_DEFAULTS[tipo]);
    if (tipo !== "airbnb") setFeePct(0);
    else setFeePct(15);
    reset();
    setCalcDone(false);
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleComunaChange(key: string | null) {
    setComunaKey(key);
    setBarrioId(0);
    reset();
    setCalcDone(false);
  }

  function restoreDefaults() {
    setAdminMes("");
    setVacanciaPct(VAC_DEFAULTS[tipo]);
    setMantPct(MANT_DEFAULTS[tipo]);
    setSeguroPct(0.3);
    setFeePct(tipo === "airbnb" ? 15 : 0);
    setPredialStr("");
    setRetencion(false);
  }

  function handleLoadHistorial(item: { barrio_id: number | null; presupuesto: number | null; tipo_inversion: string | null; horizonte_anos: number | null; con_credito: boolean | null; params: Record<string, unknown> | null }) {
    if (item.barrio_id) setBarrioId(item.barrio_id);
    if (item.presupuesto) {
      const mill = Math.round(item.presupuesto / 1_000_000);
      setPresupuesto(mill);
      setPresupuestoStr(String(mill));
    }
    if (item.tipo_inversion === "renta_larga") setTipo("larga");
    else if (item.tipo_inversion === "renta_media") setTipo("media");
    else setTipo("airbnb");
    if (item.horizonte_anos) setHorizonte(item.horizonte_anos as Horizonte);
    if (item.con_credito != null) setTipoCompra(item.con_credito ? "credito" : "contado");
    reset();
    setCalcDone(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCalcular() {
    const adminVal = adminMes ? parseFloat(adminMes) : null;
    const predialVal = predialStr ? parseFloat(predialStr) * 1_000_000 : null;

    mutate({
      barrio_id: barrioId,
      presupuesto_cop: presupuesto * 1_000_000,
      tipo_inversion: tipoToApi(tipo),
      horizonte_anos: horizonte,
      perfil_riesgo: "moderado",
      // Fine-grained expenses
      administracion_mes: adminVal,
      vacancia_pct: vacanciaPct,
      mantenimiento_pct: mantPct,
      seguro_pct: seguroPct,
      fee_plataforma_pct: tipo === "airbnb" ? feePct : 0,
      predial_anual: predialVal,
      retencion_fuente: retencion,
      // Credit
      con_credito: tipoCompra === "credito",
      cuota_inicial_pct: cuotaInicial,
      tasa_anual_pct: tasaAnual,
      plazo_anos: plazoAnos,
    }, {
      onSuccess: (result) => {
        setCalcDone(true);
        if (isPro) {
          saveMut.mutate({
            barrio_id: barrioId || null,
            presupuesto: presupuesto * 1_000_000,
            tipo_inversion: tipoToApi(tipo),
            horizonte_anos: horizonte,
            con_credito: tipoCompra === "credito",
            resultados: {
              yield_bruto: result?.yields?.bruto_pct,
              roi_total_pct: result?.valorizacion?.retorno_total_5anos_cop
                ? Math.round((result.valorizacion.retorno_total_5anos_cop / (result.presupuesto_cop || 1)) * 100)
                : null,
              score_oportunidad: result?.score_oportunidad,
            },
          });
        }
      },
    });
  }

  const cuotaPreview = tipoCompra === "credito"
    ? calcCuota(presupuesto, cuotaInicial, tasaAnual, plazoAnos)
    : null;

  const canCalcular = barrioId !== 0 && presupuesto > 0;

  // beforeLoad only runs server-side/on SPA nav — on a hard refresh the guard
  // doesn't fire, so this is the real backstop against a non-agent seeing content.
  useEffect(() => { setAgentChecked(true); }, []);
  useEffect(() => {
    if (agentChecked && !isAgente) navigate({ to: "/planes", search: { audiencia: "agente" } });
  }, [agentChecked, isAgente, navigate]);
  if (agentChecked && !isAgente) return null;

  // ── Locked preview for free users ─────────────────────────────────────────
  if (!isPro) {
    return (
      <div className="paper-theme relative min-h-screen w-full bg-background">
        <MapNavbar activeTab="simulator" onTabChange={() => {}} />
        <main className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-24 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/70 p-8">
            {/* Blurred form preview */}
            <div className="pointer-events-none select-none blur-sm opacity-40 space-y-4">
              <div className="h-8 w-48 rounded-lg bg-foreground/10" />
              <div className="grid grid-cols-2 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-foreground/10" />)}
              </div>
              <div className="h-12 rounded-xl bg-primary/30" />
            </div>
            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background/60 backdrop-blur-sm rounded-2xl p-8 text-center">
              <div className="rounded-full border border-primary/30 bg-primary/10 p-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">El Simulador de Inversión es exclusivo de MLS Pro</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  Calcula el yield real, flujo de caja y ROI de cualquier propiedad en el Valle de Aburrá con datos reales del mercado.
                </p>
              </div>
              <Link
                to="/planes"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Suscribirse a MLS Pro → Desde $79,000 COP/mes
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="paper-theme relative min-h-screen w-full overflow-x-hidden bg-background">
      <MapNavbar activeTab="simulator" onTabChange={() => {}} />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6">
        <button
          onClick={() => navigate({ to: "/realtor/dashboard" })}
          className="mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al dashboard
        </button>

        {/* Listing banner — Flujo B */}
        {listingId && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/8 px-4 py-3">
            {listingLoading ? (
              <span className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando propiedad...
              </span>
            ) : listingData ? (
              <span className="text-xs text-primary font-medium">
                Simulando:{" "}
                <span className="font-semibold">
                  {titleCase(listingData.tipo_inmueble ?? "Inmueble")} en{" "}
                  {titleCase(listingData.barrio_nombre ?? "")}
                </span>
                {" · "}
                {formatCOP(listingData.precio)} COP
              </span>
            ) : (
              <span className="text-xs text-warning">
                {listingError instanceof Error ? listingError.message : "Propiedad no encontrada"}
              </span>
            )}
            <button
              onClick={() => {
                navigate({ to: "/simulador" });
                reset();
                setCalcDone(false);
              }}
              className="ml-4 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
            >
              <X className="h-3 w-3" /> Cambiar propiedad
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
          {/* ── LEFT: Form ──────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-border bg-surface/70 p-6">
            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-primary">
                <Calculator className="h-3 w-3" /> Simulador Pro
              </div>
              <h1 className="mt-1 font-display text-2xl font-semibold text-[#1A1208]">Simula tu inversión</h1>
              <p className="mt-1 text-xs text-[#6B5B45]">Resultados con datos reales del mercado</p>
            </div>

            {/* PASO 1 — ZONA Y PRESUPUESTO */}
            <Field label="Zona / Comuna">
              <select
                value={comunaKey ?? ""}
                onChange={(e) => handleComunaChange(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-[#1A1208] focus:border-primary focus:outline-none"
              >
                <option value="">Seleccionar zona...</option>
                {(() => {
                  const medellin = (comunasData ?? []).filter((c) => c.municipio === "MEDELLIN");
                  const valle = (comunasData ?? []).filter((c) => c.municipio !== "MEDELLIN");
                  return (
                    <>
                      {medellin.length > 0 && (
                        <optgroup label="Medellín — Comunas">
                          {medellin.map((c) => (
                            <option key={c.key} value={c.key}>
                              {titleCase(c.label)} · {c.n_barrios} barrios
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {valle.length > 0 && (
                        <optgroup label="Valle de Aburrá">
                          {valle.map((c) => (
                            <option key={c.key} value={c.key}>
                              {titleCase(c.label)} · {c.n_barrios} barrios
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </Field>
            {comunaKey && (
              <Field label="Barrio">
                <select
                  value={barrioId || ""}
                  onChange={(e) => { setBarrioId(Number(e.target.value)); reset(); setCalcDone(false); }}
                  disabled={isComunaLoading}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-[#1A1208] focus:border-primary focus:outline-none disabled:opacity-50"
                >
                  <option value="">
                    {isComunaLoading ? "Cargando barrios..." : "Seleccionar barrio..."}
                  </option>
                  {(barriosDeComunaData ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {titleCase(b.nombre)}
                      {b.yield_bruto_pct ? ` · ${b.yield_bruto_pct.toFixed(1)}% yield` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

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
                    if (raw !== "" && n > 0) { setPresupuesto(clamp(n, 1, 2000)); reset(); setCalcDone(false); }
                  }}
                  onBlur={() => {
                    const n = Number(presupuestoStr);
                    if (!presupuestoStr || n <= 0) { setPresupuestoStr(String(presupuesto)); }
                    else { const c = clamp(n, 50, 2000); setPresupuesto(c); setPresupuestoStr(String(c)); }
                  }}
                  className="w-28 rounded-md border border-border bg-background/60 px-2 py-2 text-sm text-[#1A1208] focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-[#6B5B45]">M COP</span>
                <span className="ml-auto text-xs text-[#6B5B45]">
                  ≈ ${((presupuesto * 1_000_000) / USD_RATE).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
                </span>
              </div>
              <input
                type="range" min={50} max={2000} step={50} value={presupuesto}
                onChange={(e) => { const n = Number(e.target.value); setPresupuesto(n); setPresupuestoStr(String(n)); reset(); setCalcDone(false); }}
                className="mt-3 w-full accent-[#1D9E75]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPresupuesto(p); setPresupuestoStr(String(p)); reset(); setCalcDone(false); }}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                      presupuesto === p ? "border-primary bg-primary/15 text-primary" : "border-border text-[#6B5B45] hover:text-[#1A1208]"
                    }`}
                  >
                    ${p >= 1000 ? `${p/1000}B` : `${p}M`}
                  </button>
                ))}
              </div>
            </Field>

            {/* PASO 2 — TIPO DE COMPRA */}
            <Field label="Tipo de compra">
              <div className="inline-flex w-full rounded-lg border border-border p-0.5">
                {(["contado", "credito"] as const).map((tc) => (
                  <button
                    key={tc}
                    onClick={() => { setTipoCompra(tc); reset(); setCalcDone(false); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      tipoCompra === tc ? "bg-primary text-primary-foreground" : "text-[#6B5B45] hover:text-[#1A1208]"
                    }`}
                  >
                    {tc === "contado" ? "Contado" : "Con crédito"}
                  </button>
                ))}
              </div>
              {tipoCompra === "credito" && (
                <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-[#6B5B45]">
                      <span>Cuota inicial</span>
                      <span className="font-semibold text-[#1A1208]">{cuotaInicial}% · {formatCOP(presupuesto * 1_000_000 * cuotaInicial / 100)}</span>
                    </div>
                    <input
                      type="range" min={10} max={50} step={5} value={cuotaInicial}
                      onChange={(e) => setCuotaInicial(Number(e.target.value))}
                      className="w-full accent-[#1D9E75]"
                    />
                    <div className="mt-1 text-[10px] text-[#6B5B45]">
                      Crédito: {formatCOP(presupuesto * 1_000_000 * (1 - cuotaInicial / 100))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-[#6B5B45]">Tasa de interés anual E.A.</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" step="0.1" min={5} max={25} value={tasaAnual}
                        onChange={(e) => setTasaAnual(Number(e.target.value))}
                        className="w-20 rounded-md border border-border bg-background/60 px-2 py-1.5 text-sm text-[#1A1208] focus:border-primary focus:outline-none"
                      />
                      <span className="text-xs text-[#6B5B45]">%</span>
                      <span className="ml-1 text-[10px] text-[#6B5B45]">Promedio bancos: ~12–14%</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-[#6B5B45]">Plazo</div>
                    <div className="inline-flex gap-1">
                      {([10, 15, 20] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPlazoAnos(p)}
                          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                            plazoAnos === p ? "border-primary bg-primary/15 text-primary" : "border-border text-[#6B5B45]"
                          }`}
                        >
                          {p} años
                        </button>
                      ))}
                    </div>
                  </div>
                  {cuotaPreview != null && (
                    <div className="rounded-lg bg-primary/8 px-3 py-2 text-xs">
                      Cuota estimada:{" "}
                      <span className="font-display font-bold text-primary">
                        {formatCOP(Math.round(cuotaPreview))}/mes
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* PASO 3 — TIPO DE INVERSIÓN */}
            <Field label="Tipo de inversión">
              <div className="grid grid-cols-3 gap-2">
                {TIPO_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTipo(t.id); reset(); setCalcDone(false); }}
                    className={`rounded-xl border p-3 text-left transition ${
                      tipo === t.id ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                    }`}
                  >
                    <div className="text-xl">{t.emoji}</div>
                    <div className="mt-1 text-xs font-semibold leading-tight text-[#1A1208]">{t.label}</div>
                    <div className="text-[10px] text-[#6B5B45] leading-tight">{t.sub}</div>
                  </button>
                ))}
              </div>
            </Field>

            {/* PASO 4 — HORIZONTE */}
            <Field label="Horizonte de inversión">
              <div className="inline-flex w-full rounded-md border border-border p-0.5">
                {([3, 5, 10, 20] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizonte(h)}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition ${
                      horizonte === h ? "bg-primary text-primary-foreground" : "text-[#1A1208]"
                    }`}
                  >
                    {h}a
                  </button>
                ))}
              </div>
            </Field>

            {/* PASO 5 — GASTOS (colapsable) */}
            <div className="mb-4">
              <button
                onClick={() => setShowGastos(!showGastos)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-medium text-[#6B5B45] transition hover:text-[#1A1208]"
              >
                <span>Ajustar gastos</span>
                {showGastos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <AnimatePresence>
                {showGastos && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                      {/* Administración */}
                      <GastoField label="Administración / mes (COP)">
                        <input
                          type="text" inputMode="numeric" placeholder="0 si no tiene administración"
                          value={adminMes}
                          onChange={(e) => setAdminMes(e.target.value.replace(/[^0-9]/g, ""))}
                          className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-[#1A1208] placeholder:text-[#9B8B75] focus:border-primary focus:outline-none"
                        />
                      </GastoField>

                      {/* Vacancia */}
                      <GastoField label={`Vacancia · ${vacanciaPct}% = ~${(vacanciaPct / 100 * 12).toFixed(1)} meses/año sin arrendar`}>
                        <input
                          type="range" min={0} max={50} step={1} value={vacanciaPct}
                          onChange={(e) => setVacanciaPct(Number(e.target.value))}
                          className="w-full accent-[#1D9E75]"
                        />
                      </GastoField>

                      {/* Mantenimiento */}
                      <GastoField label={`Mantenimiento anual · ${mantPct}% = ${formatCOP(presupuesto * 1_000_000 * mantPct / 100)}/año`}>
                        <input
                          type="range" min={0} max={3} step={0.1} value={mantPct}
                          onChange={(e) => setMantPct(Number(e.target.value))}
                          className="w-full accent-[#1D9E75]"
                        />
                      </GastoField>

                      {/* Seguro */}
                      <GastoField label={`Seguro de propiedad · ${seguroPct}% = ${formatCOP(presupuesto * 1_000_000 * seguroPct / 100)}/año`}>
                        <input
                          type="range" min={0} max={1} step={0.05} value={seguroPct}
                          onChange={(e) => setSeguroPct(Number(e.target.value))}
                          className="w-full accent-[#1D9E75]"
                        />
                      </GastoField>

                      {/* Fee plataforma (solo Airbnb) */}
                      {tipo === "airbnb" && (
                        <GastoField label={`Fee Airbnb/Booking · ${feePct}%`}>
                          <input
                            type="range" min={0} max={25} step={1} value={feePct}
                            onChange={(e) => setFeePct(Number(e.target.value))}
                            className="w-full accent-[#1D9E75]"
                          />
                        </GastoField>
                      )}

                      {/* Predial */}
                      <GastoField label="Impuesto predial (M COP/año — vacío = 0.5% estimado)">
                        <input
                          type="text" inputMode="numeric" placeholder={`${(presupuesto * 0.005).toFixed(1)}M estimado`}
                          value={predialStr}
                          onChange={(e) => setPredialStr(e.target.value.replace(/[^0-9.]/g, ""))}
                          className="w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-[#1A1208] placeholder:text-[#9B8B75] focus:border-primary focus:outline-none"
                        />
                      </GastoField>

                      {/* Retención */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#6B5B45]">Retención en la fuente (3.5% si canon &gt;$1.3M)</span>
                        <button
                          onClick={() => setRetencion(!retencion)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition ${retencion ? "border-primary bg-primary" : "border-border bg-background"}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${retencion ? "left-4" : "left-0.5"}`} />
                        </button>
                      </div>

                      <button
                        onClick={restoreDefaults}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[11px] text-[#6B5B45] transition hover:text-[#1A1208]"
                      >
                        <RotateCcw className="h-3 w-3" /> Restaurar defaults
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* CALCULAR */}
            <button
              onClick={handleCalcular}
              disabled={isPending || !canCalcular}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</>
              ) : (
                <>Calcular inversión <ArrowRight className="h-4 w-4" /></>
              )}
            </button>

            {isError && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                {error instanceof Error ? error.message : "Error al calcular. Intenta de nuevo."}
              </div>
            )}
          </section>

          {/* ── RIGHT: Results ──────────────────────────────────────────────── */}
          <section className="min-h-[400px]">
            <AnimatePresence mode="wait">
              {simResult ? (
                <ResultsPanel
                  key={`${barrioId}-${tipo}-${horizonte}-${presupuesto}`}
                  r={simResult}
                  horizonte={horizonte}
                  presupuestoMill={presupuesto}
                  tipo={tipo}
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
                      <span className="text-primary">Calcular inversión</span> para ver los resultados.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* ── ALTERNATIVAS ─────────────────────────────────────────────────── */}
        {calcDone && (
          <AlternativasSection
            alternativas={alternativas}
            isLoading={altLoading}
            tipo={tipo}
            presupuestoMill={presupuesto}
            barrioNombre={simResult?.barrio}
            horizonte={horizonte}
          />
        )}

        {/* ── HISTORIAL ────────────────────────────────────────────────────── */}
        <SimuladorHistorialSection onLoad={handleLoadHistorial as any} />
      </main>
    </div>
  );
}

// ── Results panel ─────────────────────────────────────────────────────────────

function ResultsPanel({
  r, horizonte, presupuestoMill, tipo,
}: {
  r: SimulacionResponse;
  horizonte: Horizonte;
  presupuestoMill: number;
  tipo: Tipo;
}) {
  const navigate = useNavigate();
  const { stars, bg, border, color } = scoreToRating(r.score_oportunidad);
  const tipoLabel = { airbnb: "Airbnb", renta_larga: "Arriendo largo", renta_media: "Renta media" }[r.tipo_inversion] ?? r.tipo_inversion;

  const ingresosNetosAcum5 = r.valorizacion.retorno_total_5anos_cop - r.valorizacion.ganancia_5anos_cop;
  const roiTotal = (r.valorizacion.retorno_total_5anos_cop / r.presupuesto_cop) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* BLOQUE A — Rating */}
      <div className="rounded-2xl border p-5" style={{ background: bg, borderColor: border, color }}>
        <div className="text-[11px] font-medium uppercase tracking-widest opacity-60">
          {titleCase(r.barrio)} · {tipoLabel} · {formatCOP(r.presupuesto_cop)}
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl tracking-widest">
            {"★".repeat(stars)}
            <span className="opacity-20">{"★".repeat(5 - stars)}</span>
          </span>
          <span className="font-display text-xl font-bold">{r.rating_oportunidad}</span>
        </div>
        <div className="mt-1 text-[11px] opacity-80">
          {r.yields.neto_pct != null
            ? `Yield neto ${r.yields.neto_pct.toFixed(1)}% — ${r.zona_categoria ?? "zona analizada"}`
            : "Datos insuficientes para este barrio y modalidad"}
        </div>
        {r.zona_score != null && (
          <div className="mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px]" style={{ border: `1px solid ${border}60`, background: "rgba(255,255,255,0.3)" }}>
            <span className="font-medium uppercase tracking-wider opacity-60">Zona</span>
            <span className="font-semibold">{r.zona_categoria ?? "—"}</span>
            <span className="opacity-50">·</span>
            <span className="opacity-70">score {r.zona_score}</span>
          </div>
        )}
      </div>

      {/* BLOQUE B — Métricas 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <BigMetric label="Ingreso/mes" value={formatCOP(r.ingresos.mensual_cop)} sub={`~$${r.ingresos.mensual_usd.toLocaleString("en-US")} USD`} delay={0.1} />
        <BigMetric
          label="Yield neto / año"
          value={r.yields.neto_pct != null ? formatPct(r.yields.neto_pct) : "—"}
          sub={r.yields.neto_pct == null ? <span className="text-warning">Datos insuficientes</span> : "después de gastos"}
          delay={0.15}
        />
        <BigMetric label="Área estimada" value={`~${r.area_comprable_m2.toFixed(0)} m²`} sub={`con ${formatCOP(r.presupuesto_cop)}`} delay={0.2} />
        <BigMetric
          label="Recupero"
          value={r.recupero.neto_anos == null ? "—" : r.recupero.neto_anos < 50 ? `${r.recupero.neto_anos.toFixed(1)} años` : "> 50 años"}
          sub={r.recupero.neto_anos == null ? "datos insuf." : "punto de equilibrio"}
          delay={0.25}
        />
      </div>

      {/* BLOQUE C — Flujo de caja desglose */}
      {r.flujo_caja_desglose && (
        <FlujoCajaCard d={r.flujo_caja_desglose} />
      )}

      {/* BLOQUE D — Proyección gráfica dual-line */}
      <ProyeccionChart r={r} horizonte={horizonte} presupuestoMill={presupuestoMill} />

      {/* BLOQUE E — Comparativo 3 modalidades */}
      {r.comparativo_modalidades && r.comparativo_modalidades.length > 0 && (
        <ComparativoTable
          items={r.comparativo_modalidades}
          tipoActual={r.tipo_inversion}
          recomendacion={r.recomendacion_modalidad}
          barrio={r.barrio}
        />
      )}

      {/* BLOQUE F — Retorno total */}
      <Card>
        <CardTitle>Retorno total · {horizonte} años</CardTitle>
        <div className="mt-2 font-display text-3xl font-bold text-primary">
          +{roiTotal.toFixed(1)}%
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <RowItem
            label={`Valorización estimada (${r.valorizacion.tasa_anual_pct.toFixed(1)}%/año)`}
            value={`+${formatCOP(r.valorizacion.ganancia_5anos_cop)}`}
          />
          <RowItem label="Ingresos netos acumulados" value={`+${formatCOP(ingresosNetosAcum5)}`} />
          <RowItem label="Inversión inicial" value={formatCOP(r.presupuesto_cop)} muted />
          <div className="mt-2 border-t border-border/60 pt-2">
            <RowItem label="Retorno total (5 años)" value={formatCOP(r.valorizacion.retorno_total_5anos_cop)} bold />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#6B5B45]">
          En 5 años tu propiedad valdría ~{formatCOP(r.valorizacion.valor_5anos_cop)} y habrás generado{" "}
          {formatCOP(Math.round(ingresosNetosAcum5))} en ingresos netos.
        </p>
      </Card>

      {/* Alertas */}
      {r.alertas.length > 0 && (
        <div className="space-y-2">
          {r.alertas.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span className="text-[#1A1208]">{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Resumen */}
      {r.resumen && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-primary">Análisis</div>
          <p className="mt-1 text-xs leading-relaxed text-[#1A1208]">{r.resumen}</p>
        </div>
      )}

      {/* CTAs */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => navigate({ to: "/comparador" })}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          Comparar barrios <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator.share({ title: "Simulación Medellin Social", url: window.location.href }).catch(() => {});
            } else if (typeof navigator !== "undefined") {
              navigator.clipboard?.writeText(window.location.href);
            }
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background/40 py-2.5 text-xs font-semibold text-[#1A1208] transition hover:border-primary/40"
        >
          <Share2 className="h-3 w-3" /> Compartir
        </button>
      </div>
    </motion.div>
  );
}

// ── Bloque C: Flujo de caja ───────────────────────────────────────────────────

function FlujoCajaCard({ d }: { d: FlujoCajaDesglose }) {
  const flujoFinal = d.flujo_real ?? d.ingreso_neto;
  const flujoNegativo = flujoFinal < 0;

  return (
    <Card>
      <CardTitle>Flujo de caja mensual</CardTitle>
      <div className="mt-2 space-y-1 text-xs">
        <FlujRow label="Ingreso bruto estimado" value={d.ingreso_bruto} positive />
        <FlujRow label={`Vacancia`} value={d.vacancia} />
        {d.fee_plataforma != null && <FlujRow label="Fee plataforma" value={d.fee_plataforma} />}
        {d.retencion != null && <FlujRow label="Retención en la fuente" value={d.retencion} />}
        {d.administracion != null && <FlujRow label="Administración" value={d.administracion} />}
        {d.mantenimiento != null && <FlujRow label="Mantenimiento" value={d.mantenimiento} />}
        {d.seguro != null && <FlujRow label="Seguro propiedad" value={d.seguro} />}
        {d.predial != null && <FlujRow label="Predial" value={d.predial} />}
        <div className="mt-1 border-t border-border/60 pt-1">
          <div className="flex justify-between font-semibold text-[#1A1208]">
            <span>Ingreso neto mensual</span>
            <span className="text-primary">{formatCOP(d.ingreso_neto)}</span>
          </div>
        </div>
        {d.cuota_credito != null && (
          <>
            <FlujRow label="Cuota mensual crédito" value={d.cuota_credito} />
            <div className="mt-1 border-t border-border/60 pt-1">
              <div className={`flex justify-between font-bold ${flujoNegativo ? "text-accent" : "text-success"}`}>
                <span>Flujo de caja real</span>
                <span>{flujoFinal >= 0 ? "+" : ""}{formatCOP(flujoFinal)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      {flujoNegativo && (
        <div className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent">
          ⚠️ Con crédito, este inmueble tiene flujo de caja negativo de {formatCOP(Math.abs(flujoFinal))}/mes.
          Necesitarás aportar esa diferencia mensualmente.
        </div>
      )}
    </Card>
  );
}

function FlujRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  const isPos = positive || value > 0;
  return (
    <div className="flex justify-between">
      <span className="text-[#6B5B45]">{label}</span>
      <span className={isPos ? "text-success" : "text-[#6B5B45]"}>
        {value > 0 ? "+" : ""}{formatCOP(value)}
      </span>
    </div>
  );
}

// ── Bloque D: Proyección dual-line ────────────────────────────────────────────

function ProyeccionChart({ r, horizonte, presupuestoMill }: { r: SimulacionResponse; horizonte: Horizonte; presupuestoMill: number }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const presupuesto = r.presupuesto_cop;
  const tasa = r.valorizacion.tasa_anual_pct / 100;

  const ingresosNetosAnuales = r.yields.neto_pct != null
    ? presupuesto * r.yields.neto_pct / 100
    : (r.valorizacion.retorno_total_5anos_cop - r.valorizacion.ganancia_5anos_cop) / 5;

  const puntos = (r.proyeccion_anual && r.proyeccion_anual.length > 0)
    ? r.proyeccion_anual.map((p) => ({
        año: `Año ${p.año}`,
        valor: Math.round(p.valor_inmueble / 1_000_000),
        ingresos: Math.round(p.ingresos_acumulados / 1_000_000),
        roi: p.roi_pct,
      }))
    : Array.from({ length: horizonte }, (_, i) => {
        const a = i + 1;
        return {
          año: `Año ${a}`,
          valor: Math.round(presupuesto * Math.pow(1 + tasa, a) / 1_000_000),
          ingresos: Math.round(ingresosNetosAnuales * a / 1_000_000),
          roi: Math.round(((presupuesto * Math.pow(1 + tasa, a) - presupuesto + ingresosNetosAnuales * a) / presupuesto) * 100 * 10) / 10,
        };
      });

  const recuperoAnos = r.recupero.neto_anos;

  return (
    <Card>
      <CardTitle>Proyección · {horizonte} años</CardTitle>
      <div className="mt-3 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={puntos}
            margin={{ top: 8, right: 12, bottom: 0, left: 16 }}
            onMouseMove={(e: any) => { if (e?.activeTooltipIndex !== undefined) setActiveIdx(e.activeTooltipIndex); }}
            onMouseLeave={() => setActiveIdx(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,91,69,0.12)" vertical={false} />
            <XAxis dataKey="año" tick={{ fontSize: 10, fill: "#6B5B45" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              content={({ payload, label }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-surface/95 p-3 shadow-lg text-xs min-w-[160px]">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-[#1D9E75]">Valor inmueble</span>
                        <span className="font-semibold">{d.valor}M</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#D85A30]">Ingresos netos acum.</span>
                        <span className="font-semibold">{d.ingresos}M</span>
                      </div>
                      <div className="mt-1 border-t border-border/60 pt-1 flex justify-between">
                        <span className="text-muted-foreground">ROI total</span>
                        <span className="font-bold text-primary">+{d.roi}%</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, color: "#6B5B45" }}
              formatter={(value) => value === "valor" ? "Valor inmueble" : "Ingresos netos acum."}
            />
            <Line
              type="monotone" dataKey="valor" name="valor"
              stroke="#1D9E75" strokeWidth={2}
              dot={{ r: 4, fill: "#1D9E75", strokeWidth: 0 }}
              activeDot={{ r: 7, fill: "#1D9E75", stroke: "rgba(29,158,117,0.4)", strokeWidth: 2 }}
            />
            <Line
              type="monotone" dataKey="ingresos" name="ingresos"
              stroke="#D85A30" strokeWidth={2} strokeDasharray="4 2"
              dot={{ r: 4, fill: "#D85A30", strokeWidth: 0 }}
              activeDot={{ r: 7, fill: "#D85A30", stroke: "rgba(216,90,48,0.4)", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {recuperoAnos != null && recuperoAnos < horizonte && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-primary shrink-0" />
          <span>Recupero estimado en año {recuperoAnos.toFixed(1)}</span>
        </div>
      )}
    </Card>
  );
}

// ── Bloque E: Comparativo ─────────────────────────────────────────────────────

function ComparativoTable({
  items, tipoActual, recomendacion, barrio,
}: {
  items: ComparativoModalidad[];
  tipoActual: string;
  recomendacion?: string | null;
  barrio: string;
}) {
  return (
    <Card>
      <CardTitle>Comparativo 3 modalidades · {titleCase(barrio)}</CardTitle>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#6B5B45]">
              <th className="pb-2 text-left">Modalidad</th>
              <th className="pb-2 text-right">Ingreso/mes</th>
              <th className="pb-2 text-right">Yield neto</th>
              <th className="pb-2 text-right">Recupero</th>
              <th className="pb-2 text-right">Riesgo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {items.map((item) => {
              const isActive = item.tipo === tipoActual;
              return (
                <tr key={item.tipo} className={`transition ${isActive ? "bg-primary/8" : ""}`}>
                  <td className={`py-2 font-medium ${isActive ? "text-primary" : "text-[#1A1208]"}`}>
                    {item.label}
                    {item.es_recomendada && <span className="ml-1.5 text-[9px] font-bold text-primary uppercase tracking-wider">★ Mejor</span>}
                  </td>
                  <td className="py-2 text-right text-[#1A1208]">
                    {item.ingreso_mes ? formatCOP(item.ingreso_mes) : "—"}
                  </td>
                  <td className={`py-2 text-right font-semibold ${isActive ? "text-primary" : "text-[#6B5B45]"}`}>
                    {item.yield_neto_pct != null ? `${item.yield_neto_pct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 text-right text-[#6B5B45]">
                    {item.recupero_anos != null ? `${item.recupero_anos.toFixed(1)}a` : "—"}
                  </td>
                  <td className="py-2 text-right text-[#6B5B45]">{item.riesgo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {recomendacion && (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
          ★ Mejor opción para {titleCase(barrio)}: <span className="font-semibold">{recomendacion}</span>
        </div>
      )}
    </Card>
  );
}

// ── Alternativas ──────────────────────────────────────────────────────────────

function AlternativasSection({
  alternativas, isLoading, tipo, presupuestoMill, barrioNombre, horizonte,
}: {
  alternativas?: AlternativaListing[];
  isLoading: boolean;
  tipo: Tipo;
  presupuestoMill: number;
  barrioNombre?: string;
  horizonte: Horizonte;
}) {
  const navigate = useNavigate();
  if (isLoading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#6B5B45]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando alternativas...
      </div>
    );
  }
  if (!alternativas?.length) return null;
  const tipoLabel = { airbnb: "Airbnb", media: "Nómadas", larga: "Renta larga" }[tipo];

  return (
    <section className="mt-10">
      <div className="mb-1">
        <h2 className="font-display text-xl font-semibold text-[#1A1208]">
          Encontramos {alternativas.length} propiedades con buen rendimiento
        </h2>
        <p className="mt-0.5 text-xs text-[#6B5B45]">
          Basado en: presupuesto ${presupuestoMill}M · {tipoLabel}{barrioNombre ? ` · ${titleCase(barrioNombre)}` : ""} · {horizonte} años
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {alternativas.map((alt) => (
          <div
            key={alt.id}
            className="flex items-center gap-4 rounded-2xl border border-border bg-surface/70 p-4"
          >
            {alt.foto && (
              <img
                src={alt.foto}
                alt={alt.tipo_inmueble ?? "Propiedad"}
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#1A1208]">
                {titleCase(alt.tipo_inmueble ?? "Inmueble")} · {titleCase(alt.barrio_nombre)}
              </div>
              <div className="mt-0.5 text-xs text-[#6B5B45]">
                {formatCOP(alt.precio)} COP
                {alt.area_m2 != null && ` · ${alt.area_m2}m²`}
                {alt.habitaciones != null && ` · ${alt.habitaciones} hab`}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {alt.yield_neto_pct != null && (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Yield {alt.yield_neto_pct.toFixed(1)}%
                  </span>
                )}
                {alt.recupero_anos != null && (
                  <span className="rounded-md bg-surface/80 border border-border px-2 py-0.5 text-[11px] text-[#6B5B45]">
                    Recupero {alt.recupero_anos.toFixed(1)} años
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                onClick={() => navigate({ to: "/simulador", search: { listing_id: alt.id } })}
                className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20"
              >
                Simular →
              </button>
              <button
                onClick={() => navigate({ to: "/map", search: { listing: alt.id } as any })}
                className="rounded-lg border border-border bg-background/40 px-3 py-1.5 text-[11px] text-[#6B5B45] transition hover:text-[#1A1208]"
              >
                Ver listing
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Historial de simulaciones ──────────────────────────────────────────────────

type SimHistorialItem = {
  id: number;
  barrio_id: number | null;
  barrio_nombre: string | null;
  presupuesto: number | null;
  tipo_inversion: string | null;
  horizonte_anos: number | null;
  con_credito: boolean | null;
  params: Record<string, unknown> | null;
  resultados: Record<string, unknown> | null;
  fecha_creacion: string;
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  return `hace ${Math.floor(diff / 604800)} semanas`;
}

function SimuladorHistorialSection({
  onLoad,
}: {
  onLoad: (item: SimHistorialItem) => void;
}) {
  const isPro = useIsPro();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<SimHistorialItem[]>({
    queryKey: ["simulador-historial"],
    queryFn: () => apiFetch(API_ENDPOINTS.simuladorHistorial),
    enabled: isPro && open,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      fetch(API_ENDPOINTS.simuladorHistorialItem(id), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("medellin-social.token") ?? ""}` },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["simulador-historial"] }),
  });

  if (!isPro) return null;

  const tipoLabel: Record<string, string> = {
    airbnb: "Airbnb",
    renta_larga: "Renta larga",
    renta_media: "Nómadas",
  };

  return (
    <div
      className="mt-8 rounded-2xl border"
      style={{ background: "#FAF7F2", borderColor: "#E8E0D0" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-sm font-semibold text-[#1A1208]">
          Mis simulaciones guardadas
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-[#6B5B45]" />
          : <ChevronDown className="h-4 w-4 text-[#6B5B45]" />
        }
      </button>

      {open && (
        <div className="border-t px-5 pb-4" style={{ borderColor: "#E8E0D0" }}>
          {isLoading && (
            <p className="py-4 text-center text-xs text-[#9B8B75]">Cargando historial…</p>
          )}
          {!isLoading && items.length === 0 && (
            <p className="py-4 text-center text-xs text-[#9B8B75]">
              Aún no tienes simulaciones guardadas.
            </p>
          )}
          <div className="mt-3 divide-y" style={{ borderColor: "#E8E0D0" }}>
            {items.map((item) => {
              const yield_ = (item.resultados as any)?.yield_bruto ?? null;
              const roi = (item.resultados as any)?.roi_total_pct ?? null;
              return (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#1A1208]">
                      {item.tipo_inversion ? (tipoLabel[item.tipo_inversion] ?? item.tipo_inversion) : "—"}
                      {" · "}
                      {item.barrio_nombre ?? "Barrio no disponible"}
                      {item.presupuesto && (
                        <span className="ml-1 text-[11px] text-[#6B5B45]">
                          · {formatCOP(item.presupuesto)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#9B8B75]">
                      {yield_ != null && (
                        <span>Yield {Number(yield_).toFixed(1)}%</span>
                      )}
                      {roi != null && (
                        <span>ROI {Number(roi).toFixed(0)}%</span>
                      )}
                      {item.horizonte_anos && (
                        <span>{item.horizonte_anos} años</span>
                      )}
                      <span>· {timeAgo(item.fecha_creacion)}</span>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      onClick={() => { onLoad(item); setOpen(false); }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1D9E75] transition hover:bg-[#E1F5EE]"
                      style={{ border: "0.5px solid #1D9E75" }}
                    >
                      Cargar →
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(item.id)}
                      className="rounded-lg p-1.5 text-[#9B8B75] transition hover:text-[#D85A30]"
                      title="Eliminar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers / UI ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-[#6B5B45]">{label}</div>
      {children}
    </div>
  );
}

function GastoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] text-[#6B5B45]">{label}</div>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface/70 p-5">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-widest text-[#6B5B45]">{children}</div>;
}

function BigMetric({ label, value, sub, delay = 0 }: { label: string; value: string; sub?: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-xl border border-border bg-surface/70 p-4"
    >
      <div className="text-[10px] font-medium uppercase tracking-widest text-[#6B5B45]">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold text-[#1A1208]">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#6B5B45]">{sub}</div>}
    </motion.div>
  );
}

function RowItem({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-[#9B8B75]" : "text-[#6B5B45]"}`}>
      <span>{label}</span>
      <span className={bold ? "font-display text-base font-bold text-primary" : "font-medium text-[#1A1208]"}>{value}</span>
    </div>
  );
}
