import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { getScoreColor } from "@/config/mapColors";
import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatCOP, formatPct, yieldColor } from "@/lib/format";
import { useBarrios, useCompararRaw } from "@/hooks/useBarrios";
import type { ApiBarrio } from "@/lib/adapters";

export const Route = createFileRoute("/comparador")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: ComparadorPage,
});

const COLORS = ["#00d4ff", "#f59e0b", "#a855f7"];

function ComparadorPage() {
  const { data: barrios = [], isPlaceholderData } = useBarrios();
  const [ids, setIds] = useState<number[]>([]);

  // Once real barrios arrive (not placeholder mock), initialize or repair selection
  useEffect(() => {
    if (isPlaceholderData || barrios.length < 2) return;
    const realIds = new Set(barrios.map((b) => b.id));
    setIds((prev) => {
      const valid = prev.filter((id) => realIds.has(id));
      if (valid.length === 0) return [barrios[0].id, barrios[1].id];
      if (valid.length === 1) return [valid[0], barrios.find((b) => !valid.includes(b.id))!.id];
      return valid;
    });
  }, [barrios, isPlaceholderData]);

  const { data: items = [], isLoading, isError } = useCompararRaw(ids);

  const radar = useMemo(() => buildRadar(items), [items]);

  return (
    <div className="relative min-h-screen bg-background pb-16">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
        <Link
          to="/map"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al mapa
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Comparador de barrios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecciona hasta 3 barrios para comparar scores, mercado, seguridad y conectividad.
        </p>

        {/* Selectors */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ids.map((id, i) => (
            <div
              key={i}
              className="flex items-center gap-1 rounded-md border bg-surface px-2 py-1"
              style={{ borderColor: COLORS[i] }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
              <select
                value={id}
                onChange={(e) =>
                  setIds((prev) => prev.map((v, idx) => (idx === i ? Number(e.target.value) : v)))
                }
                className="bg-transparent text-sm outline-none"
              >
                {barrios.map((n) => (
                  <option key={n.id} value={n.id} className="bg-surface">
                    {titleCase(n.nombre)}
                  </option>
                ))}
              </select>
              {ids.length > 1 && (
                <button
                  onClick={() => setIds((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {ids.length < 3 && (
            <button
              onClick={() => {
                const next = barrios.find((n) => !ids.includes(n.id));
                if (next) setIds([...ids, next.id]);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/50 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> Añadir barrio
            </button>
          )}
        </div>

        {isLoading && (
          <div className="mt-12 text-center text-sm text-muted-foreground">Cargando datos...</div>
        )}

        {isError && (
          <div className="mt-12 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            Error al cargar datos del backend. Verifica que la API esté activa.
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            {/* Table */}
            <div className="rounded-2xl border border-border bg-surface/60 p-4 lg:col-span-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                      <th className="py-2 font-medium">Métrica</th>
                      {items.map((b, i) => (
                        <th key={b.barrio_id} className="py-2 pl-3 font-medium" style={{ color: COLORS[i] }}>
                          {titleCase(b.nombre ?? "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <SectionLabel label="SCORES" colSpan={items.length + 1} />
                    <Row
                      label="Corto plazo"
                      items={items}
                      render={(b) => fmtScore(b.scores.corto, b.scores.cat_corto)}
                    />
                    <Row
                      label="Mediano plazo"
                      items={items}
                      render={(b) => fmtScore(b.scores.mediano, b.scores.cat_mediano)}
                    />
                    <Row
                      label="Largo plazo"
                      items={items}
                      render={(b) => fmtScore(b.scores.largo, b.scores.cat_largo)}
                    />
                    <SectionLabel label="MERCADO" colSpan={items.length + 1} />
                    <Row
                      label="Yield bruto"
                      items={items}
                      render={(b) => (
                        <span style={{ color: yieldColor(b.mercado.yield_bruto_pct ?? 0) }}>
                          {b.mercado.yield_bruto_pct != null ? formatPct(b.mercado.yield_bruto_pct) : "—"}
                        </span>
                      )}
                    />
                    <Row
                      label="Precio m²"
                      items={items}
                      render={(b) =>
                        b.mercado.precio_m2_cop != null ? formatCOP(b.mercado.precio_m2_cop) : "—"
                      }
                    />
                    <Row
                      label="Arriendo prom."
                      items={items}
                      render={(b) =>
                        b.mercado.arriendo_p50_cop != null
                          ? `${formatCOP(b.mercado.arriendo_p50_cop)}/mes`
                          : "—"
                      }
                    />
                    <Row
                      label="Años recupero"
                      items={items}
                      render={(b) =>
                        b.mercado.anos_recupero != null
                          ? `${b.mercado.anos_recupero.toFixed(1)} años`
                          : "—"
                      }
                    />
                    <SectionLabel label="SEGURIDAD" colSpan={items.length + 1} />
                    <Row
                      label="Score seguridad"
                      items={items}
                      render={(b) =>
                        b.seguridad.score != null
                          ? `${b.seguridad.score} · ${b.seguridad.categoria ?? ""}`
                          : "—"
                      }
                    />
                    <Row
                      label="Zona turística"
                      items={items}
                      render={(b) =>
                        b.seguridad.zona_turistica == null
                          ? "—"
                          : b.seguridad.zona_turistica
                          ? "Sí"
                          : "No"
                      }
                    />
                    <SectionLabel label="CONECTIVIDAD" colSpan={items.length + 1} />
                    <Row
                      label="Dist. metro"
                      items={items}
                      render={(b) =>
                        b.conectividad.dist_metro_km != null
                          ? `${b.conectividad.dist_metro_km.toFixed(1)} km`
                          : "—"
                      }
                    />
                    <Row
                      label="Índice nómada"
                      items={items}
                      render={(b) =>
                        b.conectividad.indice_nomada != null
                          ? b.conectividad.indice_nomada.toFixed(1)
                          : "—"
                      }
                    />
                    <Row
                      label="Cafés (500m)"
                      items={items}
                      render={(b) =>
                        b.conectividad.n_cafes_500m != null
                          ? String(b.conectividad.n_cafes_500m)
                          : "—"
                      }
                    />
                    <SectionLabel label="LIQUIDEZ" colSpan={items.length + 1} />
                    <Row
                      label="Score liquidez"
                      items={items}
                      render={(b) =>
                        b.liquidez.score != null
                          ? `${b.liquidez.score} · ${b.liquidez.categoria ?? ""}`
                          : "—"
                      }
                    />
                    <Row
                      label="Tiempo venta est."
                      items={items}
                      render={(b) => b.liquidez.tiempo_estimado_venta ?? "—"}
                    />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Radar */}
            <div className="rounded-2xl border border-border bg-surface/60 p-4 lg:col-span-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Comparativa visual
              </div>
              <div className="h-80">
                <ResponsiveContainer>
                  <RadarChart data={radar} outerRadius="70%">
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(17,24,39,0.95)",
                        border: "1px solid rgba(0,212,255,0.4)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                    {items.map((b, i) => (
                      <Radar
                        key={b.barrio_id}
                        name={titleCase(b.nombre ?? "")}
                        dataKey={`v${i}`}
                        stroke={COLORS[i]}
                        fill={COLORS[i]}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {items.map((b, i) => (
                  <div key={b.barrio_id} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-muted-foreground">{titleCase(b.nombre ?? "")}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
                <div>Ejes: Yield · Seguridad · Conectividad · Precio justo · Liquidez</div>
                <div>Normalizado 0–100 entre barrios seleccionados</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionLabel({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="pb-1 pt-3 text-[9px] font-bold uppercase tracking-widest text-primary/60"
      >
        {label}
      </td>
    </tr>
  );
}

function Row({
  label,
  items,
  render,
}: {
  label: string;
  items: ApiBarrio[];
  render: (b: ApiBarrio) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="py-2.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</td>
      {items.map((b) => (
        <td key={b.barrio_id} className="py-2.5 pl-3 font-medium">
          {render(b)}
        </td>
      ))}
    </tr>
  );
}

function fmtScore(score: number | null, cat?: string | null): React.ReactNode {
  if (score == null) return "—";
  const color = getScoreColor(score);
  return (
    <span style={{ color }} className="font-semibold">
      {score}
      {cat ? <span className="ml-1 text-[10px] font-normal opacity-70">· {cat}</span> : null}
    </span>
  );
}

function buildRadar(items: ApiBarrio[]) {
  const metrics: { key: string; label: string; value: (b: ApiBarrio) => number }[] = [
    { key: "yield", label: "Yield", value: (b) => b.mercado.yield_bruto_pct ?? 0 },
    { key: "seguridad", label: "Seguridad", value: (b) => b.seguridad.score ?? 0 },
    { key: "conectividad", label: "Conectividad", value: (b) => b.conectividad.indice_nomada ?? 0 },
    { key: "precio_justo", label: "Precio justo", value: (b) => b.mercado.pbn_precio_justo ?? 50 },
    { key: "liquidez", label: "Liquidez", value: (b) => b.liquidez.score ?? 0 },
  ];
  return metrics.map((m) => {
    const vals = items.map(m.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const norm = (v: number) =>
      max === min ? 50 : Math.round(((v - min) / (max - min)) * 100);
    const row: Record<string, number | string> = { metric: m.label };
    items.forEach((b, i) => (row[`v${i}`] = norm(m.value(b))));
    return row;
  });
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
