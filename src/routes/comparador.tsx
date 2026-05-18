import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { getScoreColor } from "@/config/mapColors";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatCOP, formatPct, yieldColor } from "@/lib/format";
import { useBarrios, useCompararRaw } from "@/hooks/useBarrios";
import { auth } from "@/lib/auth";
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

function scoreToCategory(score: number): string {
  if (score >= 80) return "EXCELENTE";
  if (score >= 60) return "BUENO";
  if (score >= 40) return "MODERADO";
  if (score >= 20) return "BAJO";
  return "MUY BAJO";
}

function getProfileScore(b: ApiBarrio, goal?: string): { score: number | null; cat: string | null } {
  if (goal === "airbnb") return { score: b.scores.corto, cat: b.scores.cat_corto };
  if (goal === "renta-larga") return { score: b.scores.largo, cat: b.scores.cat_largo };
  return { score: b.scores.mediano, cat: b.scores.cat_mediano };
}

function goalToScoreLabel(goal?: string): string {
  if (goal === "airbnb") return "Score Airbnb";
  if (goal === "renta-larga") return "Score Arriendo largo";
  return "Score Nómadas";
}

const BAR_METRICS: {
  key: string;
  label: string;
  dir: "↑" | "↓";
  getValue: (b: ApiBarrio) => number | null;
  fmt: (v: number) => string;
}[] = [
  { key: "yield", label: "Yield bruto", dir: "↑", getValue: (b) => b.mercado.yield_bruto_pct, fmt: (v) => `${v.toFixed(1)}%` },
  { key: "seguridad", label: "Seguridad", dir: "↑", getValue: (b) => b.seguridad.score, fmt: (v) => `${v}/100` },
  { key: "nomada", label: "Índice nómada", dir: "↑", getValue: (b) => b.conectividad.indice_nomada, fmt: (v) => v.toFixed(1) },
  { key: "liquidez", label: "Liquidez", dir: "↑", getValue: (b) => b.liquidez.score, fmt: (v) => `${v}/100` },
  { key: "precio_m2", label: "Precio m²", dir: "↓", getValue: (b) => b.mercado.precio_m2_cop, fmt: (v) => formatCOP(v) },
];

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

  const { data: rawItems = [], isLoading, isError } = useCompararRaw(ids);
  const items = useMemo(
    () => ids.map((id) => rawItems.find((b) => b.barrio_id === id)).filter(Boolean) as ApiBarrio[],
    [ids, rawItems]
  );

  const userGoal = useMemo(() => auth.get()?.goal, []);

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
                    <SectionLabel label={goalToScoreLabel(userGoal)} colSpan={items.length + 1} />
                    <tr className="bg-primary/5">
                      <td className="py-2.5 text-xs font-semibold text-primary">Tu perfil</td>
                      {items.map((b) => {
                        const { score, cat } = getProfileScore(b, userGoal);
                        return (
                          <td key={b.barrio_id} className="py-2.5 pl-3">
                            {fmtScore(score, cat)}
                          </td>
                        );
                      })}
                    </tr>
                    <SectionLabel label="TODOS LOS SCORES" colSpan={items.length + 1} />
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
                      render={(b) => fmtScore(b.seguridad.score, b.seguridad.categoria)}
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
                      render={(b) => fmtScore(b.liquidez.score, b.liquidez.categoria)}
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

            <BarComparison items={items} />
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

function fmtScore(score: number | null, _cat?: string | null): React.ReactNode {
  if (score == null) return "—";
  const color = getScoreColor(score);
  const label = scoreToCategory(score);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold"
        style={{ color, border: `1px solid ${color}50`, background: `${color}18` }}
        title="Mayor score = mejor oportunidad para este perfil de inversión"
      >
        {score}
      </span>
      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </span>
  );
}

function BarComparison({ items }: { items: ApiBarrio[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 lg:col-span-2">
      <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Comparativa por dimensión
      </div>
      <div className="space-y-5">
        {BAR_METRICS.map((m) => {
          const vals = items.map((b) => m.getValue(b));
          const defined = vals.filter((v): v is number => v != null);
          if (defined.length === 0) return null;
          const min = Math.min(...defined);
          const max = Math.max(...defined);
          return (
            <div key={m.key}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {m.label}
                <span className="text-[9px] opacity-50">{m.dir} mayor es mejor</span>
              </div>
              <div className="space-y-1.5">
                {items.map((b, i) => {
                  const val = m.getValue(b);
                  if (val == null) return (
                    <div key={b.barrio_id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="w-20 truncate">{titleCase(b.nombre ?? "")}</span>
                      <span>—</span>
                    </div>
                  );
                  const rawPct = max === min ? 60 : ((val - min) / (max - min)) * 100;
                  const barPct = m.dir === "↓" ? 100 - rawPct : rawPct;
                  const finalPct = Math.max(8, barPct);
                  return (
                    <div key={b.barrio_id} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">
                        {titleCase(b.nombre ?? "")}
                      </span>
                      <div className="flex flex-1 items-center gap-2">
                        <div
                          className="h-3.5 rounded-sm transition-all"
                          style={{ width: `${finalPct}%`, background: COLORS[i], opacity: 0.8 }}
                        />
                        <span className="shrink-0 text-[11px] font-medium" style={{ color: COLORS[i] }}>
                          {m.fmt(val)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-[9px] text-muted-foreground">
        ↑ Mayor barra = mejor rendimiento · Precio m²: barra más larga = precio más bajo
      </div>
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
