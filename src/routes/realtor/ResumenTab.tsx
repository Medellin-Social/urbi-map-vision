import { useState } from "react";
import {
  useDesempeno, useEmbudo, type Embudo,
} from "@/hooks/useRealtorDashboard";
import { C, fmt, fmtCOP, Card, Gauge, Stat } from "./_kit";
import { Info, ChevronDown } from "@/lib/icons";

const pctN = (v: number | null | undefined) => (v == null ? null : v * 100);

// Drivers del puntaje Standing (espejo de _puntaje_standing en el backend). Pesos
// como % del total; la cédula catastral en los cierres da el nudge de completitud.
const SCORE_DRIVERS: { label: string; peso: number; desc: string }[] = [
  { label: "Cierres reportados", peso: 35, desc: "Ventas cerradas y reportadas (últimos 12 meses). Reportar con cédula catastral las hace verificables y sube más tu puntaje." },
  { label: "Velocidad de respuesta", peso: 35, desc: "Qué tan rápido contestas las solicitudes de visita. Menos de 4 h = puntaje máximo." },
  { label: "Aceptación de leads", peso: 30, desc: "De los clientes que te asignamos, cuántos tomas antes de que vuelvan al pool." },
];
// Nota mostrada abajo: la asistencia es informativa, NO penaliza (un plantón es del comprador).

function ScoreInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-black/[0.03]"
        style={{ borderColor: C.line, color: C.sub }}
      >
        <Info className="h-3.5 w-3.5" style={{ color: C.brand }} />
        ¿Cómo se calcula?
        <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border p-4" style={{ borderColor: C.line, background: C.card, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
          <p className="mb-3 text-[12.5px] leading-snug" style={{ color: C.sub }}>
            Tu puntaje (0–100) premia lo que controlas. Se arma con cuatro partes:
          </p>
          <ul className="flex flex-col gap-3">
            {SCORE_DRIVERS.map((d) => (
              <li key={d.label}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: C.ink }}>{d.label}</span>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: C.brand }}>{d.peso}%</span>
                </div>
                <div className="my-1 h-1.5 overflow-hidden rounded-full" style={{ background: C.soft }}>
                  <div className="h-full rounded-full" style={{ width: `${d.peso}%`, background: C.brand }} />
                </div>
                <p className="text-[11.5px] leading-snug" style={{ color: C.muted }}>{d.desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-3 text-[11.5px] leading-snug" style={{ borderColor: C.line, color: C.muted }}>
            La asistencia a visitas se muestra como referencia pero <strong>no baja tu puntaje</strong> — un plantón es del comprador, no tuyo. Necesitas un mínimo de actividad reciente para tener puntaje. Cierres: últimos 12 meses · velocidad y aceptación: últimos 90 días.
          </p>
        </div>
      )}
    </div>
  );
}
const fmtMes = (n: number | null | undefined) => (n == null ? "—" : `$${(n / 1e6).toFixed(n >= 1e6 ? 1 : 0)}M/mes`);

// Embudo horizontal (ancho ∝ conteo, rampa ordinal + % de conversión).
function Funnel({ stages, title, nota, compact }: { stages: { label: string; value: number }[]; title?: string; nota?: string; compact?: boolean }) {
  const top = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <div>
      {title && <div className="mb-3 text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>{title}</div>}
      <div className="flex flex-col gap-2">
        {stages.map((s, i) => {
          const w = Math.max(6, (s.value / top) * 100);
          const conv = i > 0 && stages[i - 1].value > 0 ? s.value / stages[i - 1].value : null;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className={`${compact ? "w-24" : "w-28"} shrink-0 text-right text-[11.5px]`} style={{ color: C.sub }}>{s.label}</div>
              <div className="relative h-8 flex-1 overflow-hidden rounded-md" style={{ background: C.soft }}>
                <div className="flex h-full items-center rounded-md pl-2.5" style={{ width: `${w}%`, background: C.ramp[Math.min(i, C.ramp.length - 1)] }}>
                  <span className="text-[12px] font-bold tabular-nums text-white">{fmt(s.value)}</span>
                </div>
              </div>
              <div className="w-11 shrink-0 text-[11px] tabular-nums" style={{ color: conv == null ? "transparent" : conv >= 0.5 ? C.good : conv >= 0.15 ? C.warn : C.bad }}>
                {conv == null ? "" : `${Math.round(conv * 100)}%`}
              </div>
            </div>
          );
        })}
      </div>
      {nota && <div className="mt-3 text-[10.5px] leading-relaxed" style={{ color: C.muted }}>{nota}</div>}
    </div>
  );
}

// La grid "Información del mercado" de la zona vive ahora en Mercado › Zonas de
// interés (ResultadosTab §3) — se quitó de Inicio para no duplicarla.

// Skeleton de carga: espeja el layout real (fila de gauges + card de zona) para
// que no haya salto cuando llegan los datos.
function ResumenSkeleton() {
  const cell = { background: C.card, border: `1px solid ${C.line}` };
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando desempeño">
      <div>
        <div className="mb-2 h-4 w-40 animate-pulse rounded" style={{ background: C.soft }} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl" style={cell} />)}
        </div>
      </div>
      <div>
        <div className="mb-2 h-4 w-52 animate-pulse rounded" style={{ background: C.soft }} />
        <div className="h-40 animate-pulse rounded-2xl" style={cell} />
      </div>
    </div>
  );
}

export function ResumenTab() {
  const { data: d, isLoading } = useDesempeno();
  const { data: emb } = useEmbudo() as { data: Embudo | undefined };

  if (isLoading) return <ResumenSkeleton />;
  if (!d) return <div className="py-16 text-center text-[13px]" style={{ color: C.muted }}>Sin datos de desempeño aún.</div>;

  const cs = d.calificacion_servicio;
  const st = d.standing;

  const z = d.zonas ?? [];
  // Vistas/oportunidades perdidas (derivado, sin backend): leads que llegaron a tu
  // zona pero no tomaste + plantones (visitas que no asistieron).
  const perdidas = z.reduce((s, zo) => s + Math.max(0, zo.intakes_mes - zo.tomados_mes), 0) + (d.visitas_no_show_90d ?? 0);

  const demanda = [
    { label: "Vistas en mapa", value: emb?.vistas_mapa ?? 0 },
    { label: "Abrieron detalle", value: emb?.aperturas_detalle ?? 0 },
    { label: "Favoritos", value: emb?.favoritos ?? 0 },
    { label: "Visitas pedidas", value: emb?.visitas ?? 0 },
  ];
  const hayDemanda = demanda.some((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* ① Cómo te está yendo */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>Cómo te está yendo</span>
          <ScoreInfo />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Gauge value={st?.puntaje ?? null} label="Standing" sub={st?.ranking ? `#${st.ranking.posicion} de ${st.ranking.total}` : "Puntaje 0–100"} />
          <Gauge value={pctN(d.tasa_aceptacion)} label="Aceptación" suffix="%" sub={`llegaron ${d.asignados_90d}, aceptaste ${d.aceptados_90d}`} />
          <Stat label="Respuesta" value={d.mediana_horas_aceptar != null ? `${d.mediana_horas_aceptar.toFixed(1)}h` : "—"}
            sub={cs?.grado && cs.grado !== "—" ? `grado ${cs.grado}` : "hasta aceptar el cliente"} accent={C.brand} />
          <Gauge value={pctN(d.show_rate)} label="Asistencia" suffix="%" sub={`${d.visitas_realizadas_90d} sí, ${d.visitas_no_show_90d} no`} />
          <Stat label="Oferta / interés" value={fmt(d.ofertas_90d + d.interesados_90d)} sub={`${d.ofertas_90d} ofertas · ${d.interesados_90d} interesados`} />
          <Stat label="Vistas" value={fmt(d.vistas_30d)} sub="este mes" />
          <Stat label="Perdidas" value={fmt(perdidas)} sub="no tomados + plantones" accent={perdidas > 0 ? C.bad : undefined} />
        </div>
      </div>

      {/* ② Resultados en tu zona pagada */}
      {z.length > 0 && (
        <div>
          <div className="mb-2 text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>Resultados en tu zona pagada</div>
          <div className="flex flex-col gap-4">
            {z.map((zona) => (
              <Card key={zona.zona_codigo}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold" style={{ color: C.ink }}>{zona.zona_nombre} <span className="font-normal" style={{ color: C.muted }}>· {zona.nivel}</span></div>
                  <div className="text-[12px]" style={{ color: C.muted }}>{zona.tier ? `${zona.tier} · ` : ""}{fmtMes(zona.precio_mensual)}</div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-[20px] font-bold tabular-nums" style={{ color: C.brand }}>{fmtCOP(zona.costo_por_intake)}</div><div className="text-[10.5px]" style={{ color: C.muted }}>costo por cliente conseguido</div></div>
                  <div><div className="text-[20px] font-bold tabular-nums" style={{ color: C.ink }}>{fmt(zona.vistas_30d)}</div><div className="text-[10.5px]" style={{ color: C.muted }}>visitas a tus inmuebles</div></div>
                  <div><div className="text-[20px] font-bold tabular-nums" style={{ color: C.ink }}>{fmt(zona.intakes_mes)}</div><div className="text-[10.5px]" style={{ color: C.muted }}>inmuebles nuevos este mes</div></div>
                </div>
                <div className="mt-4">
                  <Funnel compact stages={[
                    { label: "Llegaron", value: zona.intakes_mes ?? 0 },
                    { label: "Tomados", value: zona.tomados_mes ?? 0 },
                    { label: "Publicados", value: zona.publicados_total ?? 0 },
                    { label: "Cerrados", value: zona.cerrados_total ?? 0 },
                  ]} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Embudo de demanda (era "idea", ya es real): interés real por tus inmuebles */}
      {hayDemanda ? (
        <Card title="📈 Interés real en tus zonas (30 días)">
          <Funnel stages={demanda}
            nota="Quién ve el pin, abre el detalle, lo guarda como favorito y pide visita. El % es la conversión de una etapa a la siguiente." />
        </Card>
      ) : (
        <div className="rounded-2xl p-5 text-[12px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          📈 <strong style={{ color: C.ink }}>Interés real</strong> — aún sin actividad en tus zonas (30 días). Se llena con el tráfico del mapa.
        </div>
      )}
    </div>
  );
}
