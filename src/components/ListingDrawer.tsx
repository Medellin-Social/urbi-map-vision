import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  X, Heart, Phone, ExternalLink, ChevronDown, ChevronUp,
  MapPin, Eye, Clock, Building2, Bed, Bath, Maximize2, Share2,
  Shield, Bell, BellRing, User, BarChart2, Plus, Check,
} from "lucide-react";
import { useTarget } from "@/contexts/TargetContext";
import { useIsPro } from "@/components/LockedField";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { formatCOP } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFavoritosListings } from "@/hooks/useFavoritosListings";
import { auth } from "@/lib/auth";
import { toast } from "sonner";
import type { ApiListingDetail, SimilarListing } from "@/lib/adapters";
import { PhotoGallery } from "@/components/PhotoGallery";
import { useComparadorStore } from "@/hooks/useComparadorStore";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TIPO_INMUEBLE_COLOR: Record<string, string> = {
  apartamento:   "#1D9E75",
  casa:          "#D85A30",
  casa_lote:     "#D85A30",
  finca:         "#D85A30",
  apartaestudio: "#5DCAA5",
  lote:          "#BA7517",
  local:         "#7F77DD",
  oficina:       "#378ADD",
  bodega:        "#9B8B75",
  consultorio:   "#9B8B75",
};

function diasLabel(dias: number | null | undefined): string | null {
  if (dias == null || dias < 0) return null;
  if (dias === 0) return "Publicado hoy";
  if (dias === 1) return "Hace 1 día";
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} sem.`;
  if (dias < 365) return `Hace ${Math.floor(dias / 30)} mes${Math.floor(dias / 30) > 1 ? "es" : ""}`;
  return `Hace +${Math.floor(dias / 365)} año${Math.floor(dias / 365) > 1 ? "s" : ""}`;
}

const SOURCE_LABEL: Record<string, string> = {
  fincaraiz:      "Ver en Fincaraíz →",
  metrocuadrado:  "Ver en Metrocuadrado →",
  medellinliving: "Ver en MedellinLiving →",
};

function normalizeTipoOp(val: string | null | undefined): "arriendo" | "venta" {
  if (!val) return "venta";
  const v = val.toLowerCase();
  if (v.includes("arriend") || v === "rent" || v === "rental" || v === "long-term rental") return "arriendo";
  return "venta";
}

function cleanAntiguedad(val: string | null | undefined): string | null | undefined {
  if (!val) return val;
  return val
    .replace(/(\d+)\s*Byears?/gi, "$1 años")
    .replace(/\bByears?\b/gi, "Antigüedad no especificada")
    .replace(/\bStratum\s*(\d+)/gi, "Estrato $1")
    .replace(/\bStratum\b/gi, "Estrato")
    .replace(/\bSale\b/g, "Venta")
    .replace(/[Ll]ong.?term\s+rental/gi, "Renta larga");
}

// ─── sub-components ────────────────────────────────────────────────────────────

function MetricChip({ icon, label }: { icon: React.ReactNode; label: string | number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-center"
      style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}
    >
      <span style={{ color: "#6B5B45" }}>{icon}</span>
      <span className="text-xs font-semibold" style={{ color: "#1A1208" }}>{label}</span>
    </div>
  );
}

function CollapsibleDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 280;
  const needsTruncate = text.length > LIMIT;
  return (
    <div className="space-y-1.5">
      <p className="whitespace-pre-line text-sm leading-relaxed text-[#1A1208]">
        {!expanded && needsTruncate ? text.slice(0, LIMIT) + "…" : text}
      </p>
      {needsTruncate && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-[#1D9E75] transition hover:text-[#085041]"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

function Amenidades({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const clean = items.filter((a) => a && a.trim());
  if (clean.length === 0) return null;
  const CAP = 12;
  const shown = expanded ? clean : clean.slice(0, CAP);
  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold text-[#1A1208]">Qué tiene</h3>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((a, i) => (
          <span
            key={`${a}-${i}`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
            style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0", color: "#1A1208" }}
          >
            <Check className="h-3 w-3 shrink-0 text-[#1D9E75]" /> {a}
          </span>
        ))}
        {clean.length > CAP && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-[#1D9E75] transition hover:text-[#085041]"
            style={{ border: "0.5px solid #1D9E75" }}
          >
            {expanded ? "Ver menos" : `+${clean.length - CAP} más`}
          </button>
        )}
      </div>
    </div>
  );
}

function PriceBadge({ listing }: { listing: ApiListingDetail }) {
  const pct = listing.pct_bajo_mediana;
  const barrio = listing.barrio_nombre ?? "el barrio";
  if (pct == null) return null;
  if (pct > 10)
    return (
      <div className="rounded-xl p-3 text-sm" style={{ background: "#E1F5EE", border: "1px solid #1D9E75" }}>
        <div className="font-bold text-[#085041]">✓ BUENA OFERTA</div>
        <div className="mt-0.5 text-[#085041]">{pct.toFixed(0)}% bajo el precio típico de {barrio}</div>
      </div>
    );
  if (pct >= -10)
    return (
      <div className="rounded-xl p-3 text-sm" style={{ background: "#F5F0E8", border: "1px solid #E8E0D0" }}>
        <div className="font-bold text-[#6B5B45]">◎ PRECIO JUSTO</div>
        <div className="mt-0.5 text-[#6B5B45]">Dentro del rango típico de {barrio}</div>
      </div>
    );
  return (
    <div className="rounded-xl p-3 text-sm" style={{ background: "#FAECE7", border: "1px solid #D85A30" }}>
      <div className="font-bold text-[#D85A30]">↑ SOBRE PRECIO</div>
      <div className="mt-0.5 text-[#D85A30]">{Math.abs(pct).toFixed(0)}% sobre el precio típico de {barrio}</div>
    </div>
  );
}

function PriceRange({ listing }: { listing: ApiListingDetail }) {
  const isVenta = normalizeTipoOp(listing.tipo_operacion) === "venta";
  const p25 = isVenta ? listing.precio_m2_p25 : listing.arr_p25;
  const p50 = isVenta ? listing.precio_m2_mediana_barrio : listing.arriendo_p50_barrio;
  const p75 = isVenta ? listing.precio_m2_p75 : listing.arr_p75;
  const actual = isVenta ? listing.precio_m2 : listing.precio_cop;
  if (!p25 || !p50 || !p75 || !actual) return null;
  const pct = Math.min(100, Math.max(0, ((actual - p25) / (p75 - p25)) * 100));
  const unit = isVenta ? "/m²" : "/mes";
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[#1A1208]">Precios en {listing.barrio_nombre ?? "el barrio"}</h3>
      <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
        <div className="grid grid-cols-3 divide-x text-center">
          {[
            { label: "Mínimo mercado", val: p25, sub: "p25" },
            { label: "Típico del barrio", val: p50, sub: "p50" },
            { label: "Premium del barrio", val: p75, sub: "p75" },
          ].map(({ label, val, sub }) => (
            <div key={sub} className="px-2 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[#6B5B45]">{label}</div>
              <div className="mt-0.5 text-xs font-bold text-[#1A1208]">{formatCOP(val)}{unit}</div>
              <div className="text-[9px] text-[#9B8B75]">({sub})</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3" style={{ borderTop: "0.5px solid #E8E0D0" }}>
          <div className="relative h-2 rounded-full" style={{ background: "#E8E0D0" }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#5DCAA5,#1D9E75)" }} />
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${pct}%`, background: "#1D9E75" }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-[#9B8B75]">
            <span>Mínimo</span>
            <span className="font-medium text-[#1D9E75]">Este listing</span>
            <span>Premium</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ValorEstimado ─────────────────────────────────────────────────────────────

function ValorEstimado({ listing }: { listing: ApiListingDetail }) {
  const [tipOpen, setTipOpen] = useState(false);

  const isVenta = normalizeTipoOp(listing.tipo_operacion) === "venta";
  const p25 = listing.precio_m2_p25;
  const p75 = listing.precio_m2_p75;
  const area = listing.area_m2;
  if (!isVenta || !p25 || !p75 || !area) return null;

  const min = Math.round(p25 * area);
  const max = Math.round(p75 * area);
  const barrio = listing.barrio_nombre ?? "el barrio";

  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [tipOpen]);

  return (
    <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "#6B5B45" }}>Valor estimado de mercado</span>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTipOpen(v => !v); }}
            className="text-sm leading-none"
            style={{ color: tipOpen ? "#1D9E75" : "#9B8B75", cursor: "pointer" }}
          >
            ⓘ
          </button>
          {tipOpen && (
            <div
              className="absolute z-50 rounded-xl shadow-2xl"
              style={{ bottom: "calc(100% + 8px)", right: -4, width: "min(260px, 80vw)", background: "#1A1208", color: "#fff", padding: "12px 14px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute" style={{ bottom: -6, right: 10, width: 12, height: 6, background: "#1A1208", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
              <p className="mb-2 text-xs font-bold">¿Cómo se calcula este estimado?</p>
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                Estimado calculado con el rango de precios reales de propiedades similares en {barrio}.
                A medida que más ventas se cierren en la plataforma, este estimado será más preciso.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Range */}
      <div className="text-base font-bold" style={{ color: "#1A1208" }}>
        {formatCOP(min)} – {formatCOP(max)}
      </div>
      {/* Explanation */}
      <div className="text-[11px] leading-snug" style={{ color: "#9B8B75" }}>
        Basado en el precio/m² de {barrio} × {area}m² de esta propiedad
      </div>
    </div>
  );
}

function YieldMultiModal({ listing }: { listing: ApiListingDetail }) {
  const precio = listing.precio_cop;
  const arrLargo = listing.arriendo_p50_barrio;
  const yieldAirbnbPct = listing.yield_bruto_pct;
  const nomada = listing.indice_nomada ?? 0;
  if (!precio) return null;
  const arrNomadaMensual = arrLargo ? arrLargo * 1.35 : null;
  const rows = [
    { label: "Airbnb (corto)",  ingreso: yieldAirbnbPct ? precio * yieldAirbnbPct / 100 / 12 : null, yield: yieldAirbnbPct ?? null },
    { label: "Nómadas (medio)", ingreso: arrNomadaMensual, yield: arrNomadaMensual ? (arrNomadaMensual * 12) / precio * 100 : null },
    { label: "Renta larga",     ingreso: arrLargo ?? null, yield: arrLargo ? (arrLargo * 12) / precio * 100 : null },
  ];
  if (rows.every((r) => r.ingreso == null)) return null;
  const mejorOpcion = nomada > 6 ? "Airbnb — zona turística activa" : nomada > 3 ? "Nómadas — demanda internacional" : "Renta larga — zona residencial estable";

  let razon: string;
  if (nomada > 6 && (listing.score_corto ?? 0) > 60) {
    razon = `Alta demanda turística en la zona (${nomada.toFixed(1)}/10) con buen potencial de ocupación para renta corta.`;
  } else if (nomada >= 3) {
    razon = "Zona mixta con demanda de profesionales y nómadas digitales. Balance entre ocupación y estabilidad.";
  } else {
    razon = `Zona principalmente residencial (índice nómada ${nomada.toFixed(1)}/10). Mayor estabilidad de ocupación a largo plazo.`;
  }
  const segScore = listing.seguridad_score ?? null;
  if (segScore != null && segScore < 40) {
    razon += " — considera el índice de seguridad antes de decidir.";
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[#1A1208]">Si arriendas esta propiedad</h3>
      <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
        {rows.map(({ label, ingreso, yield: yPct }) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
            <span className="text-[#6B5B45]">{label}</span>
            <div className="flex items-center gap-2 text-right">
              {ingreso != null && <span className="text-xs text-[#6B5B45]">{formatCOP(ingreso)}/mes</span>}
              {yPct != null && <span className="font-semibold text-[#1D9E75]">{yPct.toFixed(1)}%</span>}
            </div>
          </div>
        ))}
        <div className="px-4 py-2.5 space-y-1" style={{ background: "#F5F0E8" }}>
          <div>
            <span className="text-xs text-[#6B5B45]">Mejor opción para {listing.barrio_nombre ?? "la zona"}: </span>
            <span className="text-xs font-semibold text-[#1A1208]">★ {mejorOpcion}</span>
          </div>
          <p className="text-[12px] italic leading-snug text-[#6B5B45]">{razon}</p>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ listing, onClose }: { listing: ApiListingDetail; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  async function crearAlerta() {
    setLoading(true);
    try {
      await apiFetch(API_ENDPOINTS.alertasCrear, {
        method: "POST",
        body: JSON.stringify({
          barrio_id: listing.barrio_id,
          tipo_operacion: listing.tipo_operacion ?? "venta",
          precio_max: listing.precio_cop,
          tipo_inmueble: listing.tipo_inmueble,
        }),
      });
      toast.success("Alerta creada ✅ Te avisamos si baja de precio.");
      onClose();
    } catch {
      toast.error("Error al crear la alerta");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={{ background: "#FAF7F2", border: "0.5px solid #E8E0D0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-[#1D9E75]" />
            <span className="font-semibold text-[#1A1208]">Alerta de precio</span>
          </div>
          <button onClick={onClose} className="text-[#6B5B45] hover:text-[#1A1208]"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-sm text-[#6B5B45]">
          Te avisamos si esta propiedad baja de precio o aparece algo similar en{" "}
          <strong>{listing.barrio_nombre ?? "el barrio"}</strong>.
        </p>
        <button
          onClick={crearAlerta}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "#1D9E75" }}
        >
          <Bell className="h-4 w-4" />
          {loading ? "Creando…" : "Crear alerta →"}
        </button>
      </div>
    </div>
  );
}

// ─── BarrioReport ─────────────────────────────────────────────────────────────

type BarrioFetch = {
  seguridad?: { score?: number | null } | null;
  conectividad?: { dist_metro_km?: number | null; indice_nomada?: number | null } | null;
  liquidez?: { score?: number | null } | null;
};

type TooltipDef = {
  title: string;
  desc: string;
  scale: { emoji: string; label: string; sub: string }[];
};

const BARRIO_TOOLTIPS: Record<string, TooltipDef> = {
  Seguridad: {
    title: "¿Cómo calculamos la seguridad?",
    desc: "Combinamos reportes de incidentes de la zona, datos de iluminación pública y densidad de comercio activo. Una zona segura tiene menor incidencia de reportes y mayor actividad comercial durante el día y la noche.",
    scale: [
      { emoji: "🟢", label: "Zona segura",          sub: "baja incidencia" },
      { emoji: "🟡", label: "Seguridad moderada",    sub: "incidencia media" },
      { emoji: "🔴", label: "Zona de precaución",    sub: "alta incidencia" },
    ],
  },
  Transporte: {
    title: "¿Cómo medimos el transporte?",
    desc: "Calculamos la distancia en línea recta desde la propiedad a la estación de metro más cercana del Valle de Aburrá (Medellín Metro). A menor distancia, mayor conectividad.",
    scale: [
      { emoji: "🟢", label: "< 500m",    sub: "Excelente conectividad" },
      { emoji: "🟡", label: "500m-1km",  sub: "Buena conectividad" },
      { emoji: "🟠", label: "1km-2km",   sub: "Conectividad moderada" },
      { emoji: "🔴", label: "> 2km",     sub: "Zona alejada del metro" },
    ],
  },
  "Perfil de zona": {
    title: "¿Qué es el perfil de zona?",
    desc: "Indica qué tipo de arrendatario predomina en esta zona, basado en la demanda de arriendos cortos, presencia de plataformas como Airbnb y el tipo de comercio cercano.",
    scale: [
      { emoji: "🟢", label: "Zona turística",    sub: "alta demanda Airbnb, ideal para renta corta" },
      { emoji: "🟡", label: "Zona mixta",         sub: "demanda variada, funciona para varios perfiles" },
      { emoji: "⚫", label: "Zona residencial",   sub: "familias y profesionales, ideal para renta larga" },
    ],
  },
  Mercado: {
    title: "¿Qué significa mercado activo?",
    desc: "Mide qué tan rápido se venden o arriendan propiedades en esta zona, basado en el volumen de transacciones y el tiempo promedio en mercado.",
    scale: [
      { emoji: "🟢", label: "Mercado activo",    sub: "propiedades se venden/arriendan en menos de 30 días" },
      { emoji: "🟡", label: "Mercado moderado",  sub: "30 a 90 días" },
      { emoji: "🔴", label: "Mercado lento",     sub: "más de 90 días" },
    ],
  },
};

function BarrioInfoTooltip({ tooltipKey, open, onToggle }: {
  tooltipKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  const tip = BARRIO_TOOLTIPS[tooltipKey];
  if (!tip) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="flex items-center justify-center rounded-full transition"
        style={{
          width: 18, height: 18,
          color: open ? "#1D9E75" : "#9B8B75",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
        }}
        aria-label={`Info: ${tip.title}`}
      >
        ⓘ
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-xl shadow-2xl"
          style={{
            bottom: "calc(100% + 8px)",
            right: -8,
            width: "min(260px, 80vw)",
            background: "#1A1208",
            color: "#FFFFFF",
            padding: "12px 14px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* arrow */}
          <div
            className="absolute"
            style={{
              bottom: -6, right: 14,
              width: 12, height: 6,
              background: "#1A1208",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            }}
          />
          <p className="mb-2 text-xs font-bold leading-snug">{tip.title}</p>
          <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            {tip.desc}
          </p>
          <div className="space-y-1">
            {tip.scale.map(({ emoji, label, sub }) => (
              <div key={label} className="flex items-baseline gap-1.5 text-[11px]">
                <span>{emoji}</span>
                <span className="font-semibold">{label}</span>
                <span style={{ color: "rgba(255,255,255,0.6)" }}>— {sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BarrioReport({ barrioId, listingSegScore }: { barrioId: number; listingSegScore?: number | null }) {
  const [openTip, setOpenTip] = useState<string | null>(null);

  const { data } = useQuery<BarrioFetch>({
    queryKey: ["barrio-full", barrioId],
    queryFn: () => apiFetch<BarrioFetch>(API_ENDPOINTS.barrio(barrioId)),
    staleTime: 300_000,
  });

  // Close tooltip on outside click
  useEffect(() => {
    if (!openTip) return;
    const handler = () => setOpenTip(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openTip]);

  if (!data) return null;

  // Use listing.seguridad_score as fallback if barrio endpoint doesn't return it
  const segScore  = listingSegScore ?? data.seguridad?.score ?? null;
  const distMetro = data.conectividad?.dist_metro_km ?? null;
  const nomada    = data.conectividad?.indice_nomada ?? null;
  const liqScore  = data.liquidez?.score ?? null;

  type Cell = { icon: string; titulo: string; tooltipKey: string; textLabel: string; textColor: string };

  const cells: Cell[] = [
    segScore != null ? {
      icon: "🛡️",
      titulo: "Seguridad",
      tooltipKey: "Seguridad",
      textLabel: segScore > 70 ? "Zona segura" : segScore > 40 ? "Seguridad moderada" : "Zona de precaución",
      textColor:  segScore > 70 ? "#1D9E75"    : segScore > 40 ? "#BA7517"             : "#D85A30",
    } : null,
    distMetro != null ? {
      icon: "🚇",
      titulo: "Transporte",
      tooltipKey: "Transporte",
      textLabel: `${distMetro.toFixed(1)} km al metro`,
      textColor: "#1A1208",
    } : null,
    nomada != null ? {
      icon: "🌍",
      titulo: "Perfil de zona",
      tooltipKey: "Perfil de zona",
      textLabel: nomada > 6 ? "Zona turística" : nomada > 3 ? "Zona mixta" : "Zona residencial",
      textColor:  nomada > 6 ? "#1D9E75"        : nomada > 3 ? "#BA7517"    : "#6B5B45",
    } : null,
    liqScore != null ? {
      icon: "📈",
      titulo: "Mercado",
      tooltipKey: "Mercado",
      textLabel: liqScore > 70 ? "Mercado activo" : liqScore > 40 ? "Mercado moderado" : "Mercado lento",
      textColor:  liqScore > 70 ? "#1D9E75"        : liqScore > 40 ? "#BA7517"           : "#D85A30",
    } : null,
  ].filter((c): c is Cell => c != null);

  if (cells.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold" style={{ color: "#1A1208" }}>El vecindario</h3>
      <div className="grid grid-cols-2 gap-2">
        {cells.map(({ icon, titulo, tooltipKey, textLabel, textColor }) => (
          <div
            key={titulo}
            className="relative flex flex-col gap-2 rounded-lg p-3"
            style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0", overflow: "visible" }}
          >
            {/* Header row: icon + title + ⓘ */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{ fontSize: 13 }}>{icon}</span>
                <span className="text-xs font-semibold truncate" style={{ color: "#6B5B45" }}>{titulo}</span>
              </div>
              <BarrioInfoTooltip
                tooltipKey={tooltipKey}
                open={openTip === tooltipKey}
                onToggle={() => setOpenTip(openTip === tooltipKey ? null : tooltipKey)}
              />
            </div>
            {/* Value */}
            <div className="text-sm font-bold leading-tight" style={{ color: textColor }}>
              {textLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ZonaCard ─────────────────────────────────────────────────────────────────

function ZonaCard({ listing }: { listing: ApiListingDetail }) {
  const isPro = useIsPro();
  const barrio = listing.barrio_nombre ?? "Zona";

  if (!isPro) {
    return (
      <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
        <div className="px-4 py-3" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
          <h3 className="text-sm font-semibold text-[#1A1208]">{listing.barrio_display ?? barrio}</h3>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm leading-snug" style={{ color: "#6B5B45" }}>
            Ver análisis completo del barrio con MLS Pro.
          </p>
          <a
            href="/planes"
            className="block w-full rounded-lg py-2 text-center text-xs font-semibold transition hover:opacity-90"
            style={{ background: "#1D9E75", color: "#FFFFFF" }}
          >
            Ver planes →
          </a>
        </div>
      </div>
    );
  }

  const score   = listing.score_largo ?? listing.score_corto;
  const nomada  = listing.indice_nomada;
  const arrP50  = listing.arriendo_p50_barrio;
  const varAnual = listing.var_anual_pct;
  if (score == null && nomada == null && arrP50 == null && varAnual == null) return null;

  const cells = [
    score    != null ? { label: "Score zona",      value: `${score}/100`,                          color: "#1A1208" as const } : null,
    nomada   != null ? { label: "Índice nómada",   value: nomada.toFixed(1),                       color: "#1A1208" as const } : null,
    { label: "Canon típico", value: arrP50 != null ? formatCOP(arrP50) : "Pocos datos en la zona", suffix: arrP50 != null ? "/mes" : undefined, color: (arrP50 != null ? "#1A1208" : "#9B8B75") as string },
    varAnual != null ? { label: "Valorización",    value: `${varAnual >= 0 ? "+" : ""}${varAnual.toFixed(1)}%`, color: (varAnual >= 0 ? "#1D9E75" : "#D85A30") as string } : null,
  ].filter(Boolean) as { label: string; value: string; suffix?: string; color: string }[];

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
      <div className="px-4 py-3" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
        <h3 className="text-sm font-semibold text-[#1A1208]">{listing.barrio_nombre ?? "Zona"}</h3>
      </div>
      <div className="grid grid-cols-2">
        {cells.map(({ label, value, suffix, color }, i) => (
          <div
            key={label}
            className="px-4 py-3 text-center"
            style={{
              borderRight:  i % 2 === 0 ? "0.5px solid #F5F0E8" : "none",
              borderBottom: i < cells.length - 2 ? "0.5px solid #F5F0E8" : "none",
            }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[#6B5B45]">{label}</div>
            <div className="mt-0.5 text-sm font-bold" style={{ color }}>
              {value}
              {suffix && <span className="text-[9px] font-normal text-[#9B8B75]">{suffix}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SobreBarrio — párrafo editorial PRO ─────────────────────────────────────

function SobreBarrio({ listing, target }: { listing: ApiListingDetail; target: string | null }) {
  const isPro = useIsPro();
  const barrioId = listing.barrio_id;

  const { data } = useQuery<BarrioFetch>({
    queryKey: ["barrio-full", barrioId ?? 0],
    queryFn: () => apiFetch<BarrioFetch>(API_ENDPOINTS.barrio(barrioId!)),
    enabled: isPro && !!barrioId,
    staleTime: 300_000,
  });

  if (!barrioId) return null;

  const barrio     = listing.barrio_nombre ?? "El barrio";
  const nomada     = listing.indice_nomada ?? data?.conectividad?.indice_nomada ?? null;
  const distMetro  = data?.conectividad?.dist_metro_km ?? null;
  const segScore   = listing.seguridad_score ?? data?.seguridad?.score ?? null;
  const varAnual   = listing.var_anual_pct;
  const liqScore   = data?.liquidez?.score ?? null;

  const perfilZona = nomada == null ? "residencial"
    : nomada > 6 ? "turística y vibrante"
    : nomada >= 3 ? "mixta con vida comercial"
    : "residencial consolidada";

  const distMetroText = distMetro == null ? ""
    : distMetro < 0.5 ? "a pasos del metro"
    : distMetro < 1   ? `a ${distMetro.toFixed(1)}km del metro`
    : distMetro < 2   ? "con acceso moderado al metro"
    : "alejada del sistema metro";

  const seguridadText = segScore == null ? ""
    : segScore > 70 ? "reconocida por su tranquilidad"
    : segScore > 40 ? "con niveles de seguridad moderados"
    : "con aspectos de seguridad a considerar";

  const valorizacionText = varAnual == null ? ""
    : varAnual > 8 ? `una valorización destacada del +${varAnual.toFixed(1)}% anual`
    : varAnual >= 4 ? `valorización estable del +${varAnual.toFixed(1)}% anual`
    : "valorización moderada";

  const mercadoText = liqScore == null ? "mercado local"
    : liqScore > 70 ? "mercado muy activo"
    : liqScore >= 40 ? "mercado moderado"
    : "mercado tranquilo";

  let recomendacion = "";
  if (target === "buyer" || target === "renter") {
    recomendacion = `Ideal para quienes buscan una zona ${perfilZona} con buena conectividad.`;
  } else if (target === "investor") {
    const yieldPct = listing.yield_bruto_pct;
    recomendacion = yieldPct != null
      ? `Con potencial de rentabilidad del ${yieldPct.toFixed(1)}% en renta larga.`
      : "Con potencial de inversión en valorización y renta.";
  } else if (target === "landlord") {
    const mejorModalidad = nomada != null && nomada > 6 ? "Airbnb" : nomada != null && nomada >= 3 ? "nómadas digitales" : "renta larga";
    recomendacion = `Recomendamos ${mejorModalidad} para maximizar el retorno.`;
  }

  const zonaParts = [perfilZona, distMetroText, seguridadText].filter(Boolean);
  const conParts = [valorizacionText, mercadoText].filter(Boolean);
  const parrafo = [
    `${barrio} es una zona ${zonaParts.join(", ")}`,
    conParts.length ? `con ${conParts.join(" y ")}` : null,
    recomendacion || null,
  ].filter(Boolean).join(", ").replace(", con ", ", con ").replace(/,\s*([A-ZÁÉÍÓÚ])/, ". $1") + ".";

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}>
        Sobre {barrio}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "#1A1208" }}>
        {parrafo}
      </p>
    </div>
  );
}

// ─── PriceJustice ──────────────────────────────────────────────────────────────

function PriceJustice({ listing }: { listing: ApiListingDetail }) {
  const p50   = listing.arriendo_p50_barrio;
  const precio = listing.precio_cop;
  const barrio = listing.barrio_nombre ?? "este barrio";

  if (!p50 || !precio) return null;

  const pct = ((precio - p50) / p50) * 100;
  const [texto, color] = pct < -10
    ? [`${Math.abs(pct).toFixed(0)}% por debajo del canon típico`, "#1D9E75"]
    : pct > 10
      ? [`${pct.toFixed(0)}% por encima del canon típico`, "#D85A30"]
      : ["Dentro del rango típico del barrio", "#BA7517"];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold" style={{ color: "#1A1208" }}>
        ¿Es este precio justo para {barrio}?
      </h3>
      <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
        <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
          <span style={{ color: "#6B5B45" }}>Canon típico del barrio</span>
          <span className="font-semibold">{formatCOP(p50)}/mes</span>
        </div>
        <div className="px-4 py-3">
          <span className="text-sm font-semibold" style={{ color }}>{texto}</span>
        </div>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

type Props = {
  listingId: number | null;
  onClose: () => void;
};

export function ListingDrawer({ listingId, onClose }: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isFav, toggle: toggleFav } = useFavoritosListings();
  const { target } = useTarget();
  const isBuyer    = target === "buyer";
  const isInvestor = target === "investor";
  const isLandlord = target === "landlord";
  const isRenter   = target === "renter";
  const isPro = useIsPro();
  const { addListing, removeListing, isSelected: isInComparador, canAdd: canAddToComparador } = useComparadorStore();
  const closedRef = useRef(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const { data: listing, isLoading } = useQuery<ApiListingDetail>({
    queryKey: ["listing-drawer", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.listing(listingId!)),
    enabled: listingId != null,
    staleTime: 60_000,
  });

  const { data: similares } = useQuery<SimilarListing[]>({
    queryKey: ["listing-similares", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.listingSimilares(listingId!)),
    enabled: listingId != null && !!listing,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (!listingId) return;
    closedRef.current = false;
    apiFetch(API_ENDPOINTS.listingVista(listingId), { method: "POST", body: JSON.stringify({}) }).catch(() => {});
    return () => { closedRef.current = true; };
  }, [listingId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (isMobile && listingId) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, listingId]);

  // Update meta tags while popup is open
  useEffect(() => {
    if (!listing) return;
    const prevTitle = document.title;
    const price = listing.precio_cop ? formatCOP(listing.precio_cop) : "—";
    const tipo  = (listing.tipo_inmueble ?? "Inmueble").replace(/_/g, " ");
    const barrio = listing.barrio_nombre ?? "Medellín";
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    document.title = `${cap(tipo)} en ${barrio} | ${price} — Medellín Social`;
    const metaEl = document.querySelector('meta[name="description"]');
    const prevDesc = metaEl?.getAttribute("content") ?? null;
    metaEl?.setAttribute("content", `${cap(tipo)} en ${barrio} por ${price}. Ver fotos, análisis y contactar agente.`);
    return () => {
      document.title = prevTitle;
      if (metaEl && prevDesc) metaEl.setAttribute("content", prevDesc);
    };
  }, [listing]);

  if (!listingId) return null;

  const tipoOp = normalizeTipoOp(listing?.tipo_operacion);
  const fuente = (listing?.fuente ?? "").toLowerCase();
  const lat    = listing?.lat;
  const lon    = listing?.lon;

  const heroMapUrl =
    lat != null && lon != null
      ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+1D9E75(${lon},${lat})/${lon},${lat},15,0/560x220@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  const waText = encodeURIComponent(
    `Hola, me interesa este inmueble en ${listing?.barrio_nombre ?? "Medellín"} por ${listing?.precio_cop ? formatCOP(listing.precio_cop) : "—"} COP. ID: ${listingId}`,
  );
  const waUrl = `https://wa.me/+573122502394?text=${waText}`;

  function handleShare() {
    const url = `${window.location.origin}/map?listing=${listingId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado ✅"));
  }

  // ─── Reusable fragments ────────────────────────────────────────────────────

  const badgesRow = listing ? (
    <div className="flex flex-wrap items-center gap-1.5">
      {listing.tier === "agencia_premium" && (
        <span className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: "#ffc928", color: "#1A1208" }}>
          ✦ Premium
        </span>
      )}
      <span
        className="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
        style={{ background: tipoOp === "arriendo" ? "#1D9E75" : "#D85A30", color: "#FFFFFF" }}
      >
        {tipoOp === "arriendo" ? "Arriendo" : "Venta"}
      </span>
      {listing.tipo_inmueble && (
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider capitalize"
          style={{ background: TIPO_INMUEBLE_COLOR[listing.tipo_inmueble] ?? "#9B8B75", color: "#FFFFFF" }}
        >
          {listing.tipo_inmueble.replace(/_/g, " ")}
        </span>
      )}
    </div>
  ) : null;

  const metricsChips = listing && (listing.area_m2 != null || listing.habitaciones != null || listing.banos != null || listing.estrato_real != null) ? (
    <div className="flex flex-wrap gap-2">
      {listing.area_m2        != null && <MetricChip icon={<Maximize2 className="h-3.5 w-3.5" />} label={`${listing.area_m2}m²`} />}
      {listing.habitaciones   != null && <MetricChip icon={<Bed       className="h-3.5 w-3.5" />} label={`${listing.habitaciones} hab`} />}
      {listing.banos          != null && <MetricChip icon={<Bath      className="h-3.5 w-3.5" />} label={`${listing.banos} baños`} />}
      {listing.estrato_real   != null && <MetricChip icon={<Shield    className="h-3.5 w-3.5" />} label={`Est. ${listing.estrato_real}`} />}
    </div>
  ) : null;

  const ctaButtons = listing ? (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "#1D9E75" }}
        >
          <Phone className="h-4 w-4" />
          Contactar agente
        </a>
        {isPro && (
          <button
            onClick={() => {
              const inComp = isInComparador(listing.id);
              if (inComp) {
                removeListing(listing.id);
                toast.success("Quitado del comparador");
              } else if (canAddToComparador) {
                addListing(listing as any);
                toast.success("Agregado al comparador");
              } else {
                toast.info("Máximo 5 inmuebles en el comparador");
              }
            }}
            title={isInComparador(listing.id) ? "Quitar del comparador" : "Agregar a comparación"}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-semibold transition"
            style={isInComparador(listing.id)
              ? { background: "#E1F5EE", color: "#085041", border: "1px solid #1D9E75" }
              : { border: "0.5px solid #1D9E75", color: "#1D9E75", background: "#FFFFFF" }
            }
          >
            {isInComparador(listing.id)
              ? <><Check className="h-3.5 w-3.5" /></>
              : <><Plus className="h-3.5 w-3.5" /> Comparar</>
            }
          </button>
        )}
      </div>
      <div className="flex gap-2">
        {listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium text-[#6B5B45] transition hover:text-[#1A1208]"
            style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {SOURCE_LABEL[fuente] ?? "Ver fuente original →"}
          </a>
        )}
        <button
          onClick={() => { if (!auth.get()) return; toggleFav(listing.url ?? "", listing.barrio_id); }}
          title={isFav(listing.url ?? "") ? "Quitar de favoritos" : "Guardar"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition"
          style={{ border: "0.5px solid #E8E0D0", background: isFav(listing.url ?? "") ? "#FAECE7" : "#F5F0E8" }}
        >
          <Heart className="h-4 w-4" style={{ color: isFav(listing.url ?? "") ? "#D85A30" : "#6B5B45" }} fill={isFav(listing.url ?? "") ? "#D85A30" : "none"} />
        </button>
        <button
          onClick={handleShare}
          title="Copiar link"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition"
          style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}
        >
          <Share2 className="h-4 w-4 text-[#6B5B45]" />
        </button>
      </div>
      {isPro && listing.barrio_id && (
        <button
          onClick={() => setShowAlertModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition hover:opacity-90"
          style={{ border: "0.5px solid #1D9E75", background: "#E1F5EE", color: "#085041" }}
        >
          <Bell className="h-3.5 w-3.5" />
          Alertarme cuando baje de precio
        </button>
      )}
      {isPro && listing.tipo_operacion === "venta" && (
        <button
          onClick={() => {
            onClose();
            navigate({ to: "/simulador", search: { listing_id: listing.id } });
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition hover:opacity-90"
          style={{ border: "0.5px solid #1D9E75", background: "transparent", color: "#085041" }}
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Simular esta propiedad →
        </button>
      )}
    </div>
  ) : null;

  // Analysis sections (left col + mobile)
  const analysisContent = listing ? (
    <>
      {/* Activity */}
      {(listing.dias_en_mercado != null || listing.vistas) && (
        <div
          className="flex flex-wrap items-center gap-4 rounded-xl px-4 py-3 text-xs"
          style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}
        >
          {listing.dias_en_mercado != null && (
            <div className="flex items-center gap-1.5 text-[#6B5B45]">
              <Clock className="h-3.5 w-3.5" />
              <span>{diasLabel(listing.dias_en_mercado) ?? `${listing.dias_en_mercado}d en mercado`}</span>
            </div>
          )}
          {!!listing.vistas && (
            <div className="flex items-center gap-1.5 text-[#6B5B45]">
              <Eye className="h-3.5 w-3.5" />
              <span>{listing.vistas} {listing.vistas === 1 ? "persona vio esto" : "personas vieron esto"}</span>
            </div>
          )}
        </div>
      )}

      {/* Qué tiene — amenidades */}
      {listing.amenidades && listing.amenidades.length > 0 && (
        <Amenidades items={listing.amenidades} />
      )}

      {/* Description — solo si existe */}
      {listing.descripcion && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[#1A1208]">Descripción</h3>
          <CollapsibleDescription text={listing.descripcion} />
        </div>
      )}

      {/* Facts & Features — cada fila condicional; sección oculta si nada */}
      {(listing.tipo_inmueble || listing.estado_inmueble || listing.antiguedad
        || (listing.parqueaderos != null && listing.parqueaderos > 0) || listing.piso != null) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[#1A1208]">Detalles</h3>
          <div className="divide-y overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
            {listing.tipo_inmueble && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-[#6B5B45]"><Building2 className="h-3.5 w-3.5" /> Tipo</span>
                <span className="font-medium capitalize" style={{ color: "#1A1208" }}>{listing.tipo_inmueble.replace(/_/g, " ")}</span>
              </div>
            )}
            {listing.estado_inmueble && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-[#6B5B45]">🏗 Estado</span>
                <span className="font-medium capitalize" style={{ color: "#1A1208" }}>{listing.estado_inmueble.toLowerCase()}</span>
              </div>
            )}
            {listing.antiguedad && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-[#6B5B45]">🗓 Antigüedad</span>
                <span className="font-medium" style={{ color: "#1A1208" }}>{cleanAntiguedad(listing.antiguedad)}</span>
              </div>
            )}
            {listing.parqueaderos != null && listing.parqueaderos > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-[#6B5B45]">🚗 Parqueaderos</span>
                <span className="font-medium" style={{ color: "#1A1208" }}>{listing.parqueaderos}</span>
              </div>
            )}
            {listing.piso != null && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-[#6B5B45]">🏢 Piso</span>
                <span className="font-medium" style={{ color: "#1A1208" }}>{listing.piso}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* El vecindario */}
      {listing.barrio_id && <BarrioReport barrioId={listing.barrio_id} listingSegScore={listing.seguridad_score} />}

      {/* ── BUYER: análisis para quien quiere vivir ────────────────────────────── */}
      {isBuyer && (
        <>
          {listing.pct_bajo_mediana != null && <PriceBadge listing={listing} />}
          <PriceRange listing={listing} />
          {isPro && listing.var_anual_pct != null && (
            <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span style={{ color: "#6B5B45" }}>📈 Valorización anual</span>
                <span className="font-semibold" style={{ color: listing.var_anual_pct >= 0 ? "#1D9E75" : "#E24B4A" }}>
                  {listing.var_anual_pct >= 0 ? "+" : ""}{listing.var_anual_pct.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── INVESTOR: análisis completo de rentabilidad ─────────────────────────── */}
      {isInvestor && (
        <>
          {listing.pct_bajo_mediana != null && <PriceBadge listing={listing} />}
          <PriceRange listing={listing} />
          <div className="flex items-center justify-between rounded-xl px-4 py-3 text-sm" style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}>
            <span style={{ color: "#6B5B45" }}>Canon mediana barrio</span>
            {listing.arriendo_p50_barrio
              ? <span className="font-semibold">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
              : <span className="text-xs italic" style={{ color: "#9B8B75" }}>Pocos inmuebles para calcular una media</span>
            }
          </div>
          <YieldMultiModal listing={listing} />
          {isPro && (listing.var_anual_pct != null || listing.score_corto != null) && (
            <div className="divide-y overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
              {listing.var_anual_pct != null && (
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span style={{ color: "#6B5B45" }}>📈 Valorización anual</span>
                  <span className="font-semibold" style={{ color: listing.var_anual_pct >= 0 ? "#1D9E75" : "#E24B4A" }}>
                    {listing.var_anual_pct >= 0 ? "+" : ""}{listing.var_anual_pct.toFixed(1)}%
                  </span>
                </div>
              )}
              {listing.score_corto != null && (
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span style={{ color: "#6B5B45" }}>🏆 Score inversión</span>
                  <span className="font-medium">{listing.score_corto}/100</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── LANDLORD: yield sin badge de compra ─────────────────────────────────── */}
      {isLandlord && (
        <>
          <div className="flex items-center justify-between rounded-xl px-4 py-3 text-sm" style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}>
            <span style={{ color: "#6B5B45" }}>Canon mediana barrio</span>
            {listing.arriendo_p50_barrio
              ? <span className="font-semibold">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
              : <span className="text-xs italic" style={{ color: "#9B8B75" }}>Pocos inmuebles para calcular una media</span>
            }
          </div>
          <YieldMultiModal listing={listing} />
        </>
      )}

      {/* ── RENTER: canon típico + comparativo de precio ───────────────────────── */}
      {isRenter && (
        <>
          <div className="flex items-center justify-between rounded-xl px-4 py-3 text-sm" style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}>
            <span style={{ color: "#6B5B45" }}>Canon mediana barrio</span>
            {listing.arriendo_p50_barrio
              ? <span className="font-semibold">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
              : <span className="text-xs italic" style={{ color: "#9B8B75" }}>Pocos inmuebles para calcular una media</span>
            }
          </div>
          <PriceJustice listing={listing} />
        </>
      )}

      {/* Historial de precio — todos los targets */}
      {(() => {
        const historia = listing.precio_historia ?? [];

        if (historia.length === 0) return null;

        if (historia.length <= 2) {
          return (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold" style={{ color: "#1A1208" }}>Historial de precio</h3>
              <div className="divide-y overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
                {historia.map((h, i) => {
                  const daysAgo = Math.floor((Date.now() - new Date(h.fecha).getTime()) / 86400000);
                  const cuandoLabel = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "hace 1 día" : `hace ${daysAgo} días`;
                  const sube = (h.delta_pct ?? 0) > 0;
                  return (
                    <div key={i} className="flex items-start justify-between px-4 py-2.5 text-xs gap-3">
                      <span style={{ color: sube ? "#D85A30" : "#1D9E75", fontWeight: 600 }}>
                        {sube ? "↑ Subió" : "↓ Bajó"} {h.delta_pct != null ? `${Math.abs(h.delta_pct).toFixed(1)}%` : ""}
                      </span>
                      <div className="text-right" style={{ color: "#6B5B45" }}>
                        <div>{formatCOP(h.precio)}</div>
                        <div className="text-[10px]">{cuandoLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 3+ cambios → gráfica de línea
        const sorted = [...historia].sort((a, b) => a.fecha.localeCompare(b.fecha));
        const chartData = [
          ...sorted.map(h => ({
            fecha: h.fecha.slice(5, 10).replace("-", "/"), // MM/DD
            precio: +(h.precio / 1_000_000).toFixed(2),
          })),
          { fecha: "Hoy", precio: +((listing.precio_cop ?? 0) / 1_000_000).toFixed(2) },
        ];
        const currentPrecioM = +((listing.precio_cop ?? 0) / 1_000_000).toFixed(2);

        return (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold" style={{ color: "#1A1208" }}>Historial de precio</h3>
            <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
              <div className="px-2 pt-3 pb-2" style={{ height: 148 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: "#9B8B75" }} tickLine={false} axisLine={false} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <RechartsTooltip
                      formatter={(val: unknown) => [`$${val}M COP`, "Precio"]}
                      contentStyle={{ background: "#1A1208", border: "none", borderRadius: 8, color: "#fff", fontSize: 11 }}
                      labelStyle={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}
                    />
                    <Line
                      type="monotone" dataKey="precio"
                      stroke="#1D9E75" strokeWidth={2}
                      dot={{ r: 3, fill: "#1D9E75", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#1D9E75" }}
                    />
                    <ReferenceDot
                      x="Hoy" y={currentPrecioM}
                      r={5} fill="#D85A30" stroke="#fff" strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CTA único para usuarios free */}
      {!isPro && (
        <a
          href="/planes"
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition hover:opacity-90"
          style={{ background: "#1A1208", color: "#FFFFFF" }}
        >
          🔓 Desbloquea el análisis completo con MLS Pro →
        </a>
      )}

      {/* Sobre este barrio — editorial PRO */}
      <SobreBarrio listing={listing} target={target} />

      {/* Mini mapa */}
      {heroMapUrl && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[#1A1208]">Ubicación</h3>
          <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0" }}>
            <img src={heroMapUrl} alt={`Ubicación en ${listing.barrio_nombre}`} className="h-40 w-full object-cover" loading="lazy" />
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#6B5B45]" style={{ borderTop: "0.5px solid #E8E0D0", background: "#FAFAFA" }}>
              <MapPin className="h-3 w-3 shrink-0" />
              {listing.barrio_nombre && <span>{listing.barrio_nombre}</span>}
              {listing.estrato_real != null && <span>· Estrato {listing.estrato_real}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  const similaresSection = similares && similares.length > 0 ? (
    <div className="space-y-3 border-t pb-6" style={{ borderColor: "#E8E0D0", paddingTop: 20 }}>
      <h3 className="text-base font-bold" style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}>
        Propiedades similares
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {similares.slice(0, 4).map((s) => (
          <button
            key={s.id}
            onClick={() => onClose()}
            onClickCapture={() => { window.dispatchEvent(new CustomEvent("open-listing-drawer", { detail: { id: s.id } })); }}
            className="group flex flex-col overflow-hidden rounded-xl text-left transition hover:shadow-md"
            style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}
          >
            <div className="relative h-36 overflow-hidden" style={{ background: "#F5F0E8" }}>
              {s.foto_principal ? (
                <img src={s.foto_principal} alt={s.tipo_inmueble ?? "Foto"} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background: "linear-gradient(135deg, #1D9E75 0%, #085041 100%)" }}>
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 28, height: 28, opacity: 0.45 }}>
                    <rect x="6" y="12" width="24" height="30" rx="1" fill="white"/>
                    <rect x="30" y="20" width="14" height="22" rx="1" fill="white"/>
                    <rect x="10" y="16" width="4" height="4" fill="#1D9E75"/>
                    <rect x="18" y="16" width="4" height="4" fill="#1D9E75"/>
                    <rect x="10" y="24" width="4" height="4" fill="#1D9E75"/>
                    <rect x="18" y="24" width="4" height="4" fill="#1D9E75"/>
                    <rect x="13" y="32" width="6" height="10" fill="#1D9E75"/>
                    <rect x="34" y="24" width="4" height="4" fill="#1D9E75"/>
                    <rect x="34" y="30" width="4" height="4" fill="#1D9E75"/>
                  </svg>
                </div>
              )}
            </div>
            <div className="space-y-0.5 p-2.5">
              <div className="text-sm font-semibold" style={{ color: "#1A1208" }}>{s.precio_cop ? formatCOP(s.precio_cop) : "—"}</div>
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6B5B45" }}>
                {s.area_m2 != null && <span>{s.area_m2}m²</span>}
                {s.habitaciones != null && <span>· {s.habitaciones} hab</span>}
                {s.banos != null && <span>· {s.banos} baños</span>}
              </div>
              {s.barrio_nombre && (
                <div className="flex items-center gap-1 text-[11px]" style={{ color: "#6B5B45" }}>
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  {s.barrio_nombre}
                </div>
              )}
              {s.dias_en_mercado != null && <div className="text-[10px]" style={{ color: "#6B5B45" }}>{diasLabel(s.dias_en_mercado) ?? `${s.dias_en_mercado}d`}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const modalStyle = {
    "--background": "#FFFFFF",
    "--foreground": "#1A1208",
    "--muted-foreground": "#6B5B45",
    "--border": "rgb(184 164 138 / 50%)",
  } as React.CSSProperties;

  const loadingSpinner = (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#1D9E75] border-t-transparent" />
    </div>
  );

  // ── Mobile: bottom sheet ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <AnimatePresence>
          {listingId && (
            <>
              <motion.div
                key="drawer-backdrop-mobile"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/50"
                onClick={onClose}
              />
              <motion.div
                key="listing-drawer-mobile"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl shadow-2xl"
                style={{ height: "90vh", background: "#FAF7F2", ...modalStyle }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative flex shrink-0 items-center justify-center py-3">
                  <div className="h-1 w-10 rounded-full bg-[#C8B8A2]" />
                  <button onClick={onClose} className="absolute right-4 grid h-7 w-7 place-items-center rounded-lg text-[#6B5B45] transition hover:bg-[#F5F0E8]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <PhotoGallery fotos={listing?.fotos} titulo={listing?.tipo_inmueble ?? undefined} />
                  <div className="space-y-5 px-5 py-5">
                    {isLoading && loadingSpinner}
                    {listing && (
                      <>
                        {/* Precio + badges */}
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-display text-2xl font-bold leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}>
                                {listing.precio_cop ? formatCOP(listing.precio_cop) : "—"}
                              </div>
                              {listing.precio_usd && <div className="text-xs text-[#6B5B45]">~${(listing.precio_usd / 1000).toFixed(0)}k USD</div>}
                            </div>
                            {badgesRow}
                          </div>
                          {(listing.barrio_nombre || listing.municipio) && (
                            <div className="flex items-center gap-1 text-xs text-[#6B5B45]">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {[
                                listing.barrio_display ?? listing.barrio_nombre,
                                listing.comuna_nombre,
                                listing.municipio_display ?? listing.municipio,
                              ].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        {(isInvestor || isBuyer) && <ValorEstimado listing={listing} />}
                        {metricsChips}
                        {ctaButtons}
                        {analysisContent}
                        {similaresSection}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        {showAlertModal && listing && <AlertModal listing={listing} onClose={() => setShowAlertModal(false)} />}
      </>
    );
  }

  // ── Desktop: 2-column Zillow-style modal ────────────────────────────────────

  // Right column: contact card + zone card
  const rightColContent = listing ? (
    <div className="flex flex-col gap-4 px-4 py-5">
      {/* Contact card */}
      <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}>
        {/* Price */}
        <div className="px-4 pt-4 pb-3">
          <div
            className="text-[1.6rem] font-bold leading-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}
          >
            {listing.precio_cop ? formatCOP(listing.precio_cop) : "—"}
          </div>
          {listing.precio_usd && (
            <div className="mt-0.5 text-xs text-[#6B5B45]">~${(listing.precio_usd / 1000).toFixed(0)}k USD</div>
          )}
          <div className="mt-2">{badgesRow}</div>
          {isPro && listing.pct_bajo_mediana != null && (
            <div className="mt-3"><PriceBadge listing={listing} /></div>
          )}
          {(isInvestor || isBuyer) && listing.precio_m2_p25 && listing.precio_m2_p75 && (
            <div className="mt-3"><ValorEstimado listing={listing} /></div>
          )}
        </div>

        {/* Filas de métricas */}
        <div style={{ borderTop: "0.5px solid #F5F0E8" }}>
          {listing.area_m2 != null && (
            <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
              <span className="flex items-center gap-2 text-[#6B5B45]"><Maximize2 className="h-3.5 w-3.5" /> Área</span>
              <span className="font-medium" style={{ color: "#1A1208" }}>{listing.area_m2} m²</span>
            </div>
          )}
          {listing.habitaciones != null && (
            <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
              <span className="flex items-center gap-2 text-[#6B5B45]"><Bed className="h-3.5 w-3.5" /> Habitaciones</span>
              <span className="font-medium" style={{ color: "#1A1208" }}>{listing.habitaciones}</span>
            </div>
          )}
          {listing.banos != null && (
            <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
              <span className="flex items-center gap-2 text-[#6B5B45]"><Bath className="h-3.5 w-3.5" /> Baños</span>
              <span className="font-medium" style={{ color: "#1A1208" }}>{listing.banos}</span>
            </div>
          )}
          {listing.estrato_real != null && (
            <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "0.5px solid #F5F0E8" }}>
              <span className="flex items-center gap-2 text-[#6B5B45]"><Shield className="h-3.5 w-3.5" /> Estrato</span>
              <span className="font-medium" style={{ color: "#1A1208" }}>{listing.estrato_real}</span>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="px-4 py-4" style={{ borderTop: "0.5px solid #F5F0E8" }}>
          {ctaButtons}
        </div>
      </div>

      {/* Zone card */}
      <ZonaCard listing={listing} />
    </div>
  ) : null;

  // Left column
  const leftColContent = (
    <div>
      <PhotoGallery fotos={listing?.fotos} titulo={listing?.tipo_inmueble ?? undefined} height={320} />
      {isLoading && loadingSpinner}
      {listing && (
        <div className="space-y-5 px-5 py-5">
          {/* Header: badges + location */}
          <div className="space-y-2">
            {badgesRow}
            {(listing.barrio_nombre || listing.municipio) && (
              <div className="flex items-center gap-1 text-sm text-[#6B5B45]">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="font-medium">
                  {[
                    listing.barrio_display ?? listing.barrio_nombre,
                    listing.comuna_nombre,
                    listing.municipio_display ?? listing.municipio,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
          </div>
          {metricsChips}
          {analysisContent}
          {similaresSection}
        </div>
      )}
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {listingId && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={onClose}
            />
            <motion.div
              key="listing-drawer"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
              className="fixed z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
              style={{
                top: "50%",
                left: "50%",
                width: "min(1400px, 98vw)",
                height: "90vh",
                background: "#FAF7F2",
                border: "0.5px solid #E8E0D0",
                boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
                ...modalStyle,
              } as React.CSSProperties}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar */}
              <div
                className="sticky top-0 z-10 flex shrink-0 items-center justify-between bg-[#FAF7F2] px-5 py-3.5"
                style={{ borderBottom: "0.5px solid #E8E0D0" }}
              >
                <span className="text-[11px] font-medium uppercase tracking-widest text-[#6B5B45]">
                  Detalle del inmueble
                </span>
                <button
                  onClick={onClose}
                  className="grid h-7 w-7 place-items-center rounded-lg text-[#6B5B45] transition hover:bg-[#F5F0E8] hover:text-[#1A1208]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 2-column body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left col — scrollable */}
                <div className="flex-1 overflow-y-auto" style={{ borderRight: "0.5px solid #E8E0D0" }}>
                  {leftColContent}
                </div>
                {/* Right col — sticky contact + zone */}
                <div className="overflow-y-auto" style={{ width: "37%" }}>
                  {rightColContent}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {showAlertModal && listing && <AlertModal listing={listing} onClose={() => setShowAlertModal(false)} />}
    </>
  );
}
