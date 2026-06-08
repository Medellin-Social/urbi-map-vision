import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  X, Heart, Phone, ExternalLink, ChevronDown, ChevronUp,
  MapPin, Eye, Clock, Building2, Bed, Bath, Maximize2, Share2,
  ArrowRight, Shield, TrendingUp,
} from "lucide-react";
import { useTarget } from "@/contexts/TargetContext";
import { useIsPro, LockedField } from "@/components/LockedField";
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

// PhotoGallery re-exported from @/components/PhotoGallery

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
  const isPro = useIsPro();
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
                  {listing.buena_oferta && isPro && (
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
            {(target === 'investor' || target === 'landlord') && (
              <>
                {/* FREE: arriendo mediana — always visible */}
                {listing.arriendo_p50_barrio && (
                  <div
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-sm"
                    style={{ background: "#F5F0E8", border: "0.5px solid #E8E0D0" }}
                  >
                    <span className="text-[#6B5B45]">Canon mediana barrio</span>
                    <span className="font-semibold">{formatCOP(listing.arriendo_p50_barrio)}/mes</span>
                  </div>
                )}
                {/* PAGO: yield, score, valorización */}
                {isPro ? (
                  (listing.yield_estimado || listing.yield_bruto_pct || listing.score_corto != null || listing.var_anual_pct != null) && (
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
                  )
                ) : (
                  <LockedField label="Yield detallado + score desglosado" preview="7.2% · Score 81/100" />
                )}
              </>
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

            {/* ── Price history (buyer + investor) — PAGO ── */}
            {(target === 'buyer' || target === 'investor') && (
              isPro && listing.precio_historia && listing.precio_historia.length > 0 ? (
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
              ) : !isPro ? (
                <LockedField label="Historial de bajadas de precio" preview="3 bajadas detectadas" />
              ) : null
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
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#1A1208]">Descripción</h3>
              {listing.descripcion ? (
                <CollapsibleDescription text={listing.descripcion} />
              ) : (
                <p className="text-sm leading-relaxed text-[#9B8B75]">
                  Descripción no disponible para este listing.{" "}
                  {listing.url && (
                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline transition hover:text-[#1D9E75]"
                    >
                      Consulta la fuente original →
                    </a>
                  )}
                </p>
              )}
            </div>

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
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: "linear-gradient(135deg, #1D9E75 0%, #085041 100%)" }}
                          >
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

  const modalStyle = {
    "--background": "#FFFFFF",
    "--foreground": "#1A1208",
    "--muted-foreground": "#6B5B45",
    "--border": "rgb(184 164 138 / 50%)",
  } as React.CSSProperties;

  // ── Mobile: bottom sheet ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <AnimatePresence>
        {listingId && (
          <>
            <motion.div
              key="drawer-backdrop-mobile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={onClose}
            />
            <motion.div
              key="listing-drawer-mobile"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl shadow-2xl"
              style={{ height: "90vh", background: "#FAF7F2", ...modalStyle }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle + close */}
              <div className="relative flex shrink-0 items-center justify-center py-3">
                <div className="h-1 w-10 rounded-full bg-[#C8B8A2]" />
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

  // ── Desktop: centered modal ─────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {listingId && (
        <>
          {/* Overlay */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            key="listing-drawer"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(680px, 92vw)",
              maxHeight: "85vh",
              background: "#FAF7F2",
              border: "0.5px solid #E8E0D0",
              boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
              ...modalStyle,
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header */}
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
            <div className="flex-1 overflow-y-auto">
              <Content />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
