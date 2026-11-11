import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { useDesempeno, useEmbudo, type Embudo } from "@/hooks/useRealtorDashboard";

// Paleta validada (dataviz): embudo = rampa azul ORDINAL (etapa→etapa); zonas =
// categórica fija (no cicla); acento/gauge = brand teal; status reservado.
const C = {
  ink: "#111418", sub: "#5B5F5C", muted: "#6E726E", line: "#E7E2D6",
  card: "#FFFFFF", soft: "#F6F3EC", brand: "#0F8A4F",
  good: "#0ca30c", warn: "#fab219", bad: "#d03b3b",
  funnel: ["#86b6ef", "#3987e5", "#256abf", "#0f3f7e"],
  zonas: ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#eb6834", "#e87ba4"],
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? n.toLocaleString("es-CO") : String(n);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

// ── Gauge circular (0..100) — arco brand sobre pista, valor al centro ──────────
function Gauge({ value, label, sub, suffix = "" }: { value: number | null; label: string; sub?: string; suffix?: string }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const R = 30, CIRC = 2 * Math.PI * R;
  const dash = v == null ? 0 : CIRC * (v / 100);
  const col = v == null ? C.muted : v >= 66 ? C.brand : v >= 33 ? C.warn : C.bad;
  return (
    <div className="flex flex-col items-center rounded-2xl px-3 py-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="relative" style={{ width: 84, height: 84 }}>
        <svg width={84} height={84} viewBox="0 0 84 84">
          <circle cx={42} cy={42} r={R} fill="none" stroke={C.soft} strokeWidth={7} />
          {v != null && (
            <circle cx={42} cy={42} r={R} fill="none" stroke={col} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`} transform="rotate(-90 42 42)" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[20px] font-bold leading-none tabular-nums" style={{ color: C.ink }}>
            {v == null ? "—" : `${Math.round(v)}${suffix}`}
          </span>
        </div>
      </div>
      <div className="mt-2 text-center text-[12px] font-semibold" style={{ color: C.ink }}>{label}</div>
      {sub && <div className="text-center text-[10.5px]" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

// ── Stat tile (número grande + contexto) ──────────────────────────────────────
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-2xl px-4 py-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{label}</div>
      <div className="mt-1 text-[28px] font-bold leading-none tabular-nums" style={{ color: accent ?? C.ink }}>{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}

// ── Embudo (horizontal, ancho ∝ conteo, rampa ordinal + % de conversión) ───────
function Funnel({ stages, title, nota }: { stages: { label: string; value: number }[]; title: string; nota?: string }) {
  const top = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <div className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="mb-3 text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>{title}</div>
      <div className="flex flex-col gap-2">
        {stages.map((s, i) => {
          const w = Math.max(6, (s.value / top) * 100);
          const conv = i > 0 && stages[i - 1].value > 0 ? s.value / stages[i - 1].value : null;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-[11.5px] text-right" style={{ color: C.sub }}>{s.label}</div>
              <div className="relative h-8 flex-1 overflow-hidden rounded-md" style={{ background: C.soft }}>
                <div className="flex h-full items-center rounded-md pl-2.5 transition-all"
                  style={{ width: `${w}%`, background: C.funnel[Math.min(i, C.funnel.length - 1)] }}>
                  <span className="text-[12px] font-bold tabular-nums text-white">{fmt(s.value)}</span>
                </div>
              </div>
              <div className="w-12 shrink-0 text-[11px] tabular-nums" style={{ color: conv == null ? "transparent" : conv >= 0.5 ? C.good : conv >= 0.15 ? C.warn : C.bad }}>
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

// ── Barras por zona (categórica fija, label directo, hover) ────────────────────
function ZonaBars({ data, title, dataKey, fmtVal }: {
  data: { zona: string; [k: string]: number | string }[]; title: string; dataKey: string; fmtVal?: (n: number) => string;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="mb-2 text-[13px] font-semibold tracking-tight" style={{ color: C.ink }}>{title}</div>
      <div style={{ height: Math.max(120, data.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 0 }} barSize={20}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="zona" width={96} tick={{ fontSize: 11, fill: C.sub }} tickLine={false} axisLine={false} />
            <RTooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(v: unknown) => [fmtVal ? fmtVal(Number(v)) : fmt(Number(v)), ""]}
              contentStyle={{ background: C.ink, border: "none", borderRadius: 8, color: "#fff", fontSize: 11, padding: "6px 10px" }} />
            <Bar dataKey={dataKey} radius={[4, 4, 4, 4]}>
              {data.map((_, i) => <Cell key={i} fill={C.zonas[i % C.zonas.length]} />)}
              <LabelList dataKey={dataKey} position="right" formatter={(v) => (fmtVal ? fmtVal(Number(v)) : fmt(Number(v)))}
                style={{ fontSize: 11, fill: C.ink, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ResumenTab() {
  const { data: d, isLoading } = useDesempeno();
  const { data: emb } = useEmbudo() as { data: Embudo | undefined };

  if (isLoading) return <div className="py-16 text-center text-[13px]" style={{ color: C.muted }}>Cargando…</div>;
  if (!d) return <div className="py-16 text-center text-[13px]" style={{ color: C.muted }}>Sin datos de desempeño aún.</div>;

  const cs = d.calificacion_servicio;
  const st = d.standing;
  const gradoCol = cs?.grado === "A" ? C.good : cs?.grado === "B" ? C.brand : cs?.grado === "C" ? C.warn : cs?.grado === "D" ? C.bad : C.muted;

  // Embudo de demanda (30d) — la gráfica estrella.
  const demanda = [
    { label: "Vistas en mapa", value: emb?.vistas_mapa ?? 0 },
    { label: "Abrieron detalle", value: emb?.aperturas_detalle ?? 0 },
    { label: "Favoritos", value: emb?.favoritos ?? 0 },
    { label: "Visitas pedidas", value: emb?.visitas ?? 0 },
  ];
  const hayDemanda = demanda.some((s) => s.value > 0);

  // Embudo operacional (de tus zonas patrocinadas) — oferta.
  const z = d.zonas ?? [];
  const operacion = [
    { label: "Llegaron a la zona", value: z.reduce((a, x) => a + (x.intakes_mes ?? 0), 0) },
    { label: "Tomados por ti", value: z.reduce((a, x) => a + (x.tomados_mes ?? 0), 0) },
    { label: "Publicados", value: z.reduce((a, x) => a + (x.publicados_total ?? 0), 0) },
    { label: "Cerrados", value: z.reduce((a, x) => a + (x.cerrados_total ?? 0), 0) },
  ];

  const zonaVistas = z.map((x) => ({ zona: x.zona_nombre, vistas: x.vistas_30d ?? 0 }));

  return (
    <div className="flex flex-col gap-5">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Gauge value={st?.puntaje ?? null} label="Standing" sub={st?.ranking ? `#${st.ranking.posicion} de ${st.ranking.total}` : "Puntaje 0–100"} />
        <Gauge value={d.tasa_aceptacion != null ? d.tasa_aceptacion * 100 : null} label="Aceptación" suffix="%" sub={`${d.aceptados_90d}/${d.asignados_90d} en 90d`} />
        <Gauge value={d.show_rate != null ? d.show_rate * 100 : null} label="Asistencia" suffix="%" sub="visitas que sí ocurren" />
        <Stat label="Respuesta" value={cs?.grado ?? "—"} accent={gradoCol}
          sub={cs?.mediana_horas_respuesta != null ? `${Math.round(cs.mediana_horas_respuesta)}h mediana` : "sin visitas aún"} />
        <Stat label="Cierres 12m" value={fmt(st?.cierres_reportados_12m)} sub="reportados" />
        <Stat label="Vistas 30d" value={fmt(d.vistas_30d)} sub={`${fmt(d.vistas_total)} histórico`} />
      </div>

      {/* Embudo de demanda — flagship */}
      {hayDemanda ? (
        <Funnel title="📈 Embudo de demanda — tus zonas (30 días)" stages={demanda}
          nota="Cómo se mueve el interés en las zonas que patrocinas: cuántos ven el pin, abren el detalle, guardan y piden visita. El % es la conversión de una etapa a la siguiente." />
      ) : (
        <div className="rounded-2xl p-5 text-[12px]" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.muted }}>
          📈 <strong style={{ color: C.ink }}>Embudo de demanda</strong> — aún sin actividad en tus zonas en los últimos 30 días. Se llena con el tráfico real del mapa.
        </div>
      )}

      {/* Operación + zonas */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Funnel title="🏷️ Embudo de operación — tus listings" stages={operacion}
          nota="De los inmuebles que llegan a tu zona: cuántos tomas, publicas y cierras." />
        {zonaVistas.length > 0 && <ZonaBars data={zonaVistas} title="👁️ Vistas por zona (30 días)" dataKey="vistas" />}
      </div>
    </div>
  );
}
