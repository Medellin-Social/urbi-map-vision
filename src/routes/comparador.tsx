import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { NEIGHBORHOODS, type Neighborhood } from "@/data/neighborhoods";
import { formatCOP, formatPct, yieldColor } from "@/lib/format";

export const Route = createFileRoute("/comparador")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: ComparadorPage,
});

const COLORS = ["#00d4ff", "#7c3aed", "#10b981"];

function ComparadorPage() {
  const [ids, setIds] = useState<number[]>([1, 2]);
  const items = ids.map((id) => NEIGHBORHOODS.find((n) => n.id === id)!).filter(Boolean);

  const radar = useMemo(() => buildRadar(items), [items]);

  return (
    <div className="relative min-h-screen bg-background pb-16">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
        <Link to="/map" className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground transition hover:text-primary">
          <ArrowLeft className="h-3 w-3" /> Volver al mapa
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Comparador de barrios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecciona hasta 3 barrios para comparar yields, precios y conectividad.
        </p>

        {/* Selectors */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ids.map((id, i) => (
            <div key={i} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
              <select
                value={id}
                onChange={(e) => setIds((prev) => prev.map((v, idx) => (idx === i ? Number(e.target.value) : v)))}
                className="bg-transparent text-sm outline-none"
              >
                {NEIGHBORHOODS.map((n) => (
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
                const next = NEIGHBORHOODS.find((n) => !ids.includes(n.id));
                if (next) setIds([...ids, next.id]);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/50 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> Añadir barrio
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          {/* Table */}
          <div className="rounded-2xl border border-border bg-surface/60 p-4 lg:col-span-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 font-medium">Métrica</th>
                    {items.map((n, i) => (
                      <th key={n.id} className="py-2 pl-3 font-medium" style={{ color: COLORS[i] }}>
                        {titleCase(n.nombre)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <Row label="Yield bruto" items={items} render={(n) => <span style={{ color: yieldColor(n.yield) }}>{formatPct(n.yield)}</span>} />
                  <Row label="Precio m²" items={items} render={(n) => formatCOP(n.precio_m2)} />
                  <Row label="Arriendo prom." items={items} render={(n) => `${formatCOP(n.arriendo)}/mes`} />
                  <Row label="Años recupero" items={items} render={(n) => `${n.anos_recupero.toFixed(1)} años`} />
                  <Row label="Estrato" items={items} render={(n) => String(n.estrato)} />
                  <Row label="Comuna" items={items} render={(n) => n.comuna} />
                  <Row label="Dist. metro" items={items} render={(n) => `${n.dist_metro} km`} />
                  <Row label="Dist. parque" items={items} render={(n) => `${n.dist_parque} km`} />
                  <Row label="Dist. mall" items={items} render={(n) => `${n.dist_mall} km`} />
                  <Row label="Listings venta" items={items} render={(n) => String(n.n_venta)} />
                  <Row label="Listings arriendo" items={items} render={(n) => String(n.n_arriendo)} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Radar */}
          <div className="rounded-2xl border border-border bg-surface/60 p-4 lg:col-span-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Comparativa visual (normalizada)
            </div>
            <div className="h-80">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="70%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17,24,39,0.95)",
                      border: "1px solid rgba(0,212,255,0.4)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  {items.map((n, i) => (
                    <Radar
                      key={n.id}
                      name={titleCase(n.nombre)}
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
              {items.map((n, i) => (
                <div key={n.id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                  <span className="text-muted-foreground">{titleCase(n.nombre)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, items, render }: { label: string; items: Neighborhood[]; render: (n: Neighborhood) => React.ReactNode }) {
  return (
    <tr>
      <td className="py-2.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</td>
      {items.map((n) => (
        <td key={n.id} className="py-2.5 pl-3 font-medium">
          {render(n)}
        </td>
      ))}
    </tr>
  );
}

function buildRadar(items: Neighborhood[]) {
  const metrics: { key: string; label: string; value: (n: Neighborhood) => number; invert?: boolean }[] = [
    { key: "yield", label: "Yield", value: (n) => n.yield },
    { key: "precio", label: "Precio m²", value: (n) => n.precio_m2, invert: true },
    { key: "arriendo", label: "Arriendo", value: (n) => n.arriendo },
    { key: "metro", label: "Cerca metro", value: (n) => n.dist_metro, invert: true },
    { key: "parque", label: "Cerca parque", value: (n) => n.dist_parque, invert: true },
    { key: "recupero", label: "Recupero", value: (n) => n.anos_recupero, invert: true },
  ];
  return metrics.map((m) => {
    const vals = NEIGHBORHOODS.map(m.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const norm = (v: number) => {
      const n = (v - min) / (max - min || 1);
      return Math.round((m.invert ? 1 - n : n) * 100);
    };
    const row: Record<string, number | string> = { metric: m.label };
    items.forEach((n, i) => (row[`v${i}`] = norm(m.value(n))));
    return row;
  });
}

function titleCase(s: string) {
  return s.toLowerCase().split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}
