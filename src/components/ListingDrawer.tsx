import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  X, Heart, Phone, ExternalLink, ChevronDown, ChevronUp,
  MapPin, Eye, Clock, Building2, Bed, Bath, Maximize2, Share2,
  ArrowRight, Shield, TrendingUp,
} from "lucide-react";
import { useTarget } from "@/contexts/TargetContext";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { MAPBOX_TOKEN } from "@/lib/mapboxToken";
import { formatCOP } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFavoritosListings } from "@/hooks/useFavoritosListings";
import { auth } from "@/lib/auth";
import { toast } from "sonner";
import type { ApiListingDetail, SimilarListing } from "@/lib/adapters";

// ─── helpers ──────────────────────────────────────────────────────────────────

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
  fincaraiz: "Ver en Fincaraíz →",
  metrocuadrado: "Ver en Metrocuadrado →",
  medellinliving: "Ver en MedellinLiving →",
};

// ─── sub-components ────────────────────────────────────────────────────────────

function PhotoGallery({ fotos, titulo }: { fotos?: string[] | null; titulo?: string }) {
  const [idx, setIdx] = useState(0);
  const photos = fotos?.filter(Boolean) ?? [];

  if (!photos.length) {
    return (
      <div
        className="flex h-56 items-center justify-center text-4xl"
        style={{ background: "#F5F0E8", borderBottom: "0.5px solid #E8E0D0" }}
      >
        🏠
      </div>
    );
  }

  return (
    <div className="relative h-56 overflow-hidden" style={{ borderBottom: "0.5px solid #E8E0D0" }}>
      <img
        src={photos[idx]}
        alt={titulo ?? "Foto del inmueble"}
        className="h-full w-full object-cover transition-opacity duration-300"
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            ‹
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % photos.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {photos.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === idx ? 16 : 6, background: i === idx ? "#fff" : "rgba(255,255,255,0.5)" }}
              />
            ))}
          </div>
          <span className="absolute bottom-2 right-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
            {idx + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}

function MetricChip({ icon, label }: { icon: React.ReactNode; label: string | number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-center"
      style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}
    >
      <span className="text-[#6B5B45]">{icon}</span>
      <span className="text-xs font-semibold text-[#1A1208]">{label}</span>
    </div>
  );
}

function CollapsibleDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 200;
  const needsTruncate = text.length > LIMIT;

  return (
    <div className="space-y-1.5">
      <p className="whitespace-pre-line text-sm leading-relaxed text-[#6B5B45]">
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

// ─── main component ────────────────────────────────────────────────────────────

type Props = {
  listingId: number | null;
  onClose: () => void;
};

export function ListingDrawer({ listingId, onClose }: Props) {
  const isMobile = useIsMobile();
  const { isFav, toggle: toggleFav } = useFavoritosListings();
  const { target } = useTarget();
  const closedRef = useRef(false);

  const { data: listing, isLoading } = useQuery<ApiListingDetail>({
    queryKey: ["listing-drawer", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.listing(listingId!)),
    enabled: listingId != null,
    staleTime: 60_000,
  });

  // Register view on open
  useEffect(() => {
    if (!listingId) return;
    closedRef.current = false;
    apiFetch(API_ENDPOINTS.listingVista(listingId), { method: "POST", body: JSON.stringify({}) }).catch(() => {});
    return () => { closedRef.current = true; };
  }, [listingId]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll on mobile
  useEffect(() => {
    if (isMobile && listingId) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, listingId]);

  const { data: similares } = useQuery<SimilarListing[]>({
    queryKey: ["listing-similares", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.listingSimilares(listingId!)),
    enabled: listingId != null && !!listing,
    staleTime: 120_000,
  });

  if (!listingId) return null;

  const tipoOp  = listing?.tipo_operacion ?? "venta";
  const fuente  = (listing?.fuente ?? "").toLowerCase();
  const lat     = listing?.lat;
  const lon     = listing?.lon;

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

  // ─── Shared content ────────────────────────────────────────────────────────
  const Content = () => (
    <div className="flex flex-col">
      {/* Gallery */}
      <PhotoGallery fotos={listing?.fotos} titulo={listing?.tipo_inmueble ?? undefined} />

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex h-40 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#1D9E75] border-t-transparent" />
          </div>
        )}

        {listing && (
          <div className="space-y-5 px-5 py-5">
            {/* ── Header ── */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="font-display text-2xl font-bold leading-tight"
                    style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}
                  >
                    {listing.precio_cop ? formatCOP(listing.precio_cop) : "—"}
                  </div>
                  {listing.precio_usd && (
                    <div className="text-xs text-[#6B5B45]">
                      ~${(listing.precio_usd / 1000).toFixed(0)}k USD
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
                    style={{
                      background: tipoOp === "arriendo" ? "#E1F5EE" : "#FAECE7",
                      color:      tipoOp === "arriendo" ? "#1D9E75" : "#D85A30",
                    }}
                  >
                    {tipoOp}
                  </span>
                  {listing.buena_oferta && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ background: "#E1F5EE", color: "#085041", border: "0.5px solid #1D9E75" }}
                    >
                      Buena oferta
                    </span>
                  )}
                </div>
              </div>

              {(listing.barrio_nombre || listing.municipio) && (
                <div className="flex items-center gap-1 text-xs text-[#6B5B45]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[listing.barrio_nombre, listing.municipio].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            {/* ── Key metrics ── */}
            {(listing.area_m2 || listing.habitaciones || listing.banos || listing.estrato_real) && (
              <div className="grid grid-cols-4 gap-2">
                {listing.area_m2 != null && (
                  <MetricChip icon={<Maximize2 className="h-3.5 w-3.5" />} label={`${listing.area_m2}m²`} />
                )}
                {listing.habitaciones != null && (
                  <MetricChip icon={<Bed className="h-3.5 w-3.5" />} label={`${listing.habitaciones} hab`} />
                )}
                {listing.banos != null && (
                  <MetricChip icon={<Bath className="h-3.5 w-3.5" />} label={`${listing.banos} baños`} />
                )}
                {listing.estrato_real != null && (
                  <MetricChip icon={<Shield className="h-3.5 w-3.5" />} label={`Est. ${listing.estrato_real}`} />
                )}
              </div>
            )}

            {/* ── Activity metrics ── */}
            {(listing.dias_en_mercado != null || listing.vistas) && (
              <div
                className="flex items-center gap-4 rounded-xl px-4 py-3 text-xs"
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

            {/* ── Target-specific investment metrics ── */}
            {(target === 'investor' || target === 'landlord') && (listing.yield_estimado || listing.yield_bruto_pct || listing.score_corto != null || listing.var_anual_pct != null) && (
              <div
                className="divide-y overflow-hidden rounded-xl"
                style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF", "--tw-divide-opacity": 1 } as React.CSSProperties}
              >
                {(listing.yield_estimado || listing.yield_bruto_pct) && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      <TrendingUp className="h-3.5 w-3.5" /> Yield estimado
                    </span>
                    <span className="font-semibold text-[#1D9E75]">
                      {((listing.yield_estimado ?? listing.yield_bruto_pct) ?? 0).toFixed(1)}%
                    </span>
                  </div>
                )}
                {listing.arriendo_p50_barrio && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      💰 Arriendo mediana barrio
                    </span>
                    <span className="font-medium">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
                  </div>
                )}
                {listing.var_anual_pct != null && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      📈 Valorización anual
                    </span>
                    <span className={`font-semibold ${listing.var_anual_pct >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
                      {listing.var_anual_pct >= 0 ? "+" : ""}{listing.var_anual_pct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {listing.score_corto != null && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      🏆 Score zona
                    </span>
                    <span className="font-medium">{listing.score_corto}/100</span>
                  </div>
                )}
              </div>
            )}
            {target === 'renter' && listing.arriendo_p50_barrio && (
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3 text-sm"
                style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}
              >
                <span className="text-[#6B5B45]">Arriendo típico en la zona</span>
                <span className="font-semibold">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
              </div>
            )}

            {/* ── Price history (buyer + investor) ── */}
            {(target === 'buyer' || target === 'investor') && listing.precio_historia && listing.precio_historia.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1A1208]">Historial de precios</h3>
                <div
                  className="divide-y overflow-hidden rounded-xl"
                  style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" } as React.CSSProperties}
                >
                  {listing.precio_historia.map((h, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                      <span className="text-[#6B5B45]">{h.fecha.slice(0, 10)}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCOP(h.precio)}</span>
                        {h.delta_pct != null && (
                          <span className={h.delta_pct < 0 ? "text-[#1D9E75]" : "text-[#E24B4A]"}>
                            {h.delta_pct > 0 ? "+" : ""}{h.delta_pct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Details ── */}
            {(listing.tipo_inmueble || listing.antiguedad || listing.administracion) && (
              <div
                className="divide-y overflow-hidden rounded-xl"
                style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF", "--tw-divide-opacity": 1 } as React.CSSProperties}
              >
                {listing.tipo_inmueble && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      <Building2 className="h-3.5 w-3.5" /> Tipo
                    </span>
                    <span className="font-medium capitalize">{listing.tipo_inmueble}</span>
                  </div>
                )}
                {listing.antiguedad && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      🗓 Antigüedad
                    </span>
                    <span className="font-medium">{listing.antiguedad}</span>
                  </div>
                )}
                {listing.administracion && listing.administracion > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#6B5B45]">
                      💳 Administración
                    </span>
                    <span className="font-medium">{formatCOP(listing.administracion)}/mes</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Description ── */}
            {listing.descripcion && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1A1208]">Descripción</h3>
                <CollapsibleDescription text={listing.descripcion} />
              </div>
            )}

            {/* ── Mini map ── */}
            {heroMapUrl ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1A1208]">Ubicación</h3>
                <div
                  className="overflow-hidden rounded-xl"
                  style={{ border: "0.5px solid #E8E0D0" }}
                >
                  <img
                    src={heroMapUrl}
                    alt={`Ubicación en ${listing.barrio_nombre}`}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                  <div
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#6B5B45]"
                    style={{ borderTop: "0.5px solid #E8E0D0", background: "#FAFAFA" }}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    {listing.barrio_nombre && <span>{listing.barrio_nombre}</span>}
                    {listing.estrato_real != null && <span>· Estrato {listing.estrato_real}</span>}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── CTAs ── */}
            <div className="space-y-2.5 pb-2">
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
                <button
                  onClick={() => {
                    if (!auth.get()) return;
                    toggleFav(listing.url ?? "", listing.barrio_id);
                  }}
                  title={isFav(listing.url ?? "") ? "Quitar de favoritos" : "Guardar"}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl transition"
                  style={{
                    border: "0.5px solid #E8E0D0",
                    background: isFav(listing.url ?? "") ? "#FAECE7" : "#F5F0E8",
                  }}
                >
                  <Heart
                    className="h-5 w-5"
                    style={{ color: isFav(listing.url ?? "") ? "#D85A30" : "#6B5B45" }}
                    fill={isFav(listing.url ?? "") ? "#D85A30" : "none"}
                  />
                </button>
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
                    {SOURCE_LABEL[fuente] ?? "Ver listado original"}
                  </a>
                )}
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium text-[#6B5B45] transition hover:text-[#1A1208]"
                  style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}
                  title="Copiar link"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Link to full analysis (paid) */}
              <a
                href={`/listing/${listingId}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition hover:opacity-90"
                style={{
                  border: "0.5px solid #1D9E75",
                  background: "#E1F5EE",
                  color: "#085041",
                }}
              >
                Ver análisis de inversión completo <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* ── Similares ── */}
            {similares && similares.length > 0 && (
              <div className="space-y-3 border-t pb-6" style={{ borderColor: "#E8E0D0", paddingTop: 20 }}>
                <h3
                  className="text-base font-bold"
                  style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1A1208" }}
                >
                  Propiedades similares
                </h3>
                <div className={`grid gap-2.5 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                  {similares.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onClose()}
                      onClickCapture={() => {
                        window.dispatchEvent(new CustomEvent("open-listing-drawer", { detail: { id: s.id } }));
                      }}
                      className="group flex flex-col overflow-hidden rounded-xl text-left transition hover:shadow-md"
                      style={{ border: "0.5px solid #E8E0D0", background: "#FFFFFF" }}
                    >
                      {/* Foto */}
                      <div className="relative h-28 overflow-hidden" style={{ background: "#F5F0E8" }}>
                        {s.foto_principal ? (
                          <img
                            src={s.foto_principal}
                            alt={s.tipo_inmueble ?? "Foto"}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-3xl">🏠</div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="space-y-0.5 p-2.5">
                        <div className="text-sm font-semibold" style={{ color: "#1A1208" }}>
                          {s.precio_cop ? formatCOP(s.precio_cop) : "—"}
                        </div>
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
                        {s.dias_en_mercado != null && (
                          <div className="text-[10px]" style={{ color: "#6B5B45" }}>
                            {diasLabel(s.dias_en_mercado) ?? `${s.dias_en_mercado}d`}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── Desktop: slide-in panel from right ──────────────────────────────────────
  if (!isMobile) {
    return (
      <AnimatePresence>
        {listingId && (
          <>
            {/* Invisible click-away area (doesn't cover MLSPanel) */}
            <div
              className="pointer-events-auto absolute inset-0 z-30"
              onClick={onClose}
            />
            <motion.div
              key="listing-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="absolute right-0 top-0 z-40 flex h-full w-[420px] max-w-[90vw] flex-col overflow-hidden shadow-2xl"
              style={{
                background: "#FAF7F2",
                borderLeft: "0.5px solid #E8E0D0",
                "--background": "#FFFFFF",
                "--foreground": "#1A1208",
                "--muted-foreground": "#6B5B45",
                "--border": "rgb(184 164 138 / 50%)",
              } as React.CSSProperties}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <div
                className="flex shrink-0 items-center justify-between px-4 pt-16 pb-3"
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

              <div className="flex-1 overflow-y-auto">
                <Content />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ── Mobile: bottom sheet ────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {listingId && (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto absolute inset-0 z-30 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            key="listing-drawer-mobile"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-40 flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl shadow-2xl"
            style={{
              background: "#FAF7F2",
              "--background": "#FFFFFF",
              "--foreground": "#1A1208",
              "--muted-foreground": "#6B5B45",
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-[#E8E0D0]" />
              <button
                onClick={onClose}
                className="absolute right-4 grid h-7 w-7 place-items-center rounded-lg text-[#6B5B45] transition hover:bg-[#F5F0E8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <Content />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
