import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bath, Bed, ChevronRight, ExternalLink, Eye, Heart, MapPin, Maximize2, X } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { formatCOP } from "@/lib/format";
import type { ApiListing, ApiListingDetail } from "@/lib/adapters";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsAgente } from "@/components/LockedField";
import { PopupGallery } from "./PopupGallery";
import { PopupPriceHistory } from "./PopupPriceHistory";
import { PopupMarketIntel } from "./PopupMarketIntel";

const POPUP_WIDTH = 360;

const copShort = (n: number) => formatCOP(Math.round(n)).replace(" COP", "");

/** Pin data comes ALL CAPS (barrio_nombre "ALEJANDRIA") — sentence-case it while
 *  the detail (which has *_display already cased) loads. */
function titleCase(s?: string | null): string | null {
  if (!s) return null;
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

function Descripcion({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="space-y-1" aria-label="Descripción">
      <h3 className="text-xs font-semibold" style={{ color: "#1A1208" }}>Descripción</h3>
      <p
        className={`whitespace-pre-line text-[11px] leading-relaxed ${expanded ? "" : "line-clamp-4"}`}
        style={{ color: "#6B5B45" }}
      >
        {text}
      </p>
      {text.length > 220 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] font-semibold"
          style={{ color: "#1D9E75" }}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </section>
  );
}

type Props = {
  listing: ApiListing; // pin data — instant header, never blank
  onClose: () => void;
  onViewMore: (id: number) => void;
};

export function ListingPopup({ listing, onClose, onViewMore }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Same queryKey as ListingDrawer → shared cache; opening the drawer after is free.
  const { data: detail, isLoading } = useQuery<ApiListingDetail>({
    queryKey: ["listing-drawer", listing.id],
    queryFn: () => apiFetch(API_ENDPOINTS.listing(listing.id)),
    staleTime: 60_000,
  });

  // Regla de negocio: inmueble = público; inteligencia de barrio/mercado = solo realtor.
  // Flag local (plan === 'agente') OR señal del backend: buena_oferta/pct_bajo_mediana
  // solo llegan non-null cuando is_agente() pasó server-side (cubre el caso
  // "aprobado en tabla agentes" que el flag local no ve).
  const isRealtor =
    useIsAgente() || detail?.buena_oferta != null || detail?.pct_bajo_mediana != null;

  // Esc closes; focus moves into the popup and returns to the trigger on unmount.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // ponytail: minimal focus trap — cycle within the popup's focusables
      const nodes = containerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  // Center over the visible map area (viewport minus right panel on desktop),
  // same convention as ListingMiniPopup.
  const panelWidth = window.innerWidth >= 768 ? 380 : 0;
  const width = Math.min(POPUP_WIDTH, window.innerWidth - 24);
  const left = Math.max(12, (window.innerWidth - panelWidth - width) / 2);

  // Header fields: prefer detail (proper *_display casing), fall back to pin.
  const d = detail;
  const tipoOp = d?.tipo_operacion ?? listing.tipo_operacion;
  const precioCop = d?.precio_cop ?? listing.precio_cop;
  const precioUsd = d?.precio_usd ?? listing.precio_usd;
  const habitaciones = d?.habitaciones ?? listing.habitaciones;
  const banos = d?.banos ?? listing.banos;
  const areaM2 = d?.area_m2 ?? listing.area_m2;
  const precioM2 = d?.precio_m2 ?? listing.precio_m2;
  const barrio = d?.barrio_display ?? titleCase(listing.barrio_nombre);
  const municipio = d?.municipio_display ?? titleCase(listing.municipio);
  const ubicacion = [barrio, municipio].filter(Boolean).join(", ");
  const tipoInmueble = titleCase(d?.tipo_inmueble ?? listing.tipo_inmueble);
  const fuente = d?.fuente_display ?? listing.fuente_display ?? listing.fuente;
  const url = d?.url ?? listing.url;

  // Características — each chip only when present (~15% coverage for most).
  const caracteristicas: string[] = [];
  if (tipoInmueble) caracteristicas.push(tipoInmueble);
  const estrato = d?.estrato_real ?? listing.estrato_real;
  if (estrato != null) caracteristicas.push(`Estrato ${estrato}`);
  if (d?.antiguedad) caracteristicas.push(d.antiguedad);
  if (d?.parqueaderos != null) caracteristicas.push(`${d.parqueaderos} parqueadero${d.parqueaderos === 1 ? "" : "s"}`);
  if (d?.piso != null) caracteristicas.push(`Piso ${d.piso}`);
  if (d?.estado_inmueble) caracteristicas.push(d.estado_inmueble);

  const descripcion = d?.descripcion?.trim();

  return (
    <>
      {/* Transparent backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de listing en ${ubicacion || "el mapa"}`}
        tabIndex={-1}
        className="fixed z-50 flex flex-col overflow-hidden rounded-xl shadow-2xl outline-none"
        style={{
          left,
          top: 72,
          width,
          maxHeight: "calc(100vh - 120px)",
          background: "#FAF7F2",
          border: "0.5px solid #E8E0D0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Gallery — pin photo instantly, fotos[] from the detail when loaded */}
        <div className="relative shrink-0">
          <PopupGallery
            fotos={d?.fotos}
            fallbackFoto={listing.foto_principal}
            loading={isLoading}
            alt={`${tipoInmueble ?? "Inmueble"} en ${ubicacion || "Medellín"}`}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          {tipoOp && (
            <span
              className="absolute left-2 top-2 z-10 rounded px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: tipoOp === "arriendo" ? "#E1F5EE" : "#FAECE7",
                color: tipoOp === "arriendo" ? "#1D9E75" : "#D85A30",
              }}
            >
              {tipoOp === "arriendo" ? "Arriendo" : "Venta"}
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 space-y-3 overflow-y-auto p-3">
          {/* 2. Price */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold leading-tight" style={{ color: "#1A1208" }}>
                {precioCop ? formatCOP(precioCop) : "—"}
              </span>
              {precioUsd != null && precioUsd > 0 && (
                <span className="text-[11px]" style={{ color: "#9B8B75" }}>
                  ≈ US${Math.round(precioUsd).toLocaleString("en-US")}
                </span>
              )}
            </div>

            {/* 3. Specs — each hidden individually when missing */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "#6B5B45" }}>
              {habitaciones != null && (
                <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5 shrink-0" />{habitaciones} hab</span>
              )}
              {banos != null && (
                <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5 shrink-0" />{Math.round(banos)} baños</span>
              )}
              {areaM2 != null && (
                <span className="flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5 shrink-0" />{Math.round(areaM2)} m²</span>
              )}
              {precioM2 != null && precioM2 > 0 && (
                <span>{copShort(precioM2)}/m²</span>
              )}
            </div>

            {/* 4. Location — never direccion_raw (corrupt text from the scraper) */}
            {ubicacion && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: "#9B8B75" }}>
                <MapPin className="h-3 w-3 shrink-0" />{ubicacion}
              </div>
            )}

            {/* Engagement — only when non-zero */}
            {((d?.vistas ?? 0) > 0 || (d?.favoritos_count ?? 0) > 0) && (
              <div className="mt-1 flex items-center gap-3 text-[11px]" style={{ color: "#9B8B75" }}>
                {(d?.vistas ?? 0) > 0 && (
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3 shrink-0" />{d!.vistas} vistas</span>
                )}
                {(d?.favoritos_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3 shrink-0" />{d!.favoritos_count} guardados</span>
                )}
              </div>
            )}
          </div>

          {/* 5. Características */}
          {caracteristicas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {caracteristicas.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "#FFFFFF", border: "0.5px solid #E8E0D0", color: "#6B5B45" }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* 5b. "Lo que destaca" — top amenidades como chips (estilo What's special) */}
          {(d?.amenidades?.length ?? 0) > 0 && (
            <section className="space-y-1" aria-label="Lo que destaca">
              <h3 className="text-xs font-semibold" style={{ color: "#1A1208" }}>Lo que destaca</h3>
              <div className="flex flex-wrap gap-1.5">
                {d!.amenidades!.slice(0, 5).map((a) => (
                  <span
                    key={a}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "#E1F5EE", color: "#085041" }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 6. Descripción — skeleton while loading, absent if the source has none */}
          {descripcion ? (
            <Descripcion text={descripcion} />
          ) : isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : null}

          {/* 7. Price history — ~3% coverage; section absent otherwise */}
          {d && <PopupPriceHistory historia={d.precio_historia} precioActual={d.precio_cop} />}

          {/* 8. Inteligencia de mercado — SOLO realtor (público no ve nada de barrio/scoring) */}
          {isRealtor && (
            d ? (
              <PopupMarketIntel detail={d} />
            ) : isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : null
          )}
        </div>

        {/* 9. CTAs — fixed at the bottom, outside the scroll */}
        <div className="flex shrink-0 gap-2 border-t p-3" style={{ borderColor: "#E8E0D0" }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition hover:opacity-80"
              style={{ color: "#1D9E75", border: "1px solid #1D9E75" }}
            >
              Ver en {fuente ?? "la fuente"} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onViewMore(listing.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white transition hover:opacity-90"
            style={{ background: "#1D9E75" }}
          >
            Ver más <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
