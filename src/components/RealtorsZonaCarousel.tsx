import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/tracking";
import { Stars, iniciales } from "@/components/agentes/agenteShared";
import { K } from "@/design/tokens";

export type RealtorZona = {
  id: string;
  nombre: string;
  foto_url?: string | null;
  telefono?: string | null;
  certificado?: boolean | null;
  anios_experiencia?: number | null;
  agencia_nombre?: string | null;
  rating_promedio?: number | null;
  n_resenas?: number | null;
};

type Nivel = "barrio" | "comuna";

// Oro sobrio sobre fondo claro — distingue la comuna (paga más) sin ser chillón.
const ORO = "#C8972E";
const ORO_RING = "#E6CD93";
const ORO_CHIP = "#FBF3DD";
const ORO_BORDE = "#ECDCB4";
const WA_VERDE = "#25D366"; // verde solo para WhatsApp (feedback agentes)

/** wa.me del realtor mostrado. CO: antepone 57 si vienen 10 dígitos. Null sin teléfono. */
function waHref(tel: string | null | undefined, nombre: string, zona: string | null | undefined, lang: string): string | null {
  const d = (tel ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  const full = d.length <= 10 ? "57" + d : d;
  const msg = lang === "en"
    ? `Hi ${nombre}, I saw you as a preferred agent${zona ? " in " + zona : ""} on Medellín Social and I'd like your help.`
    : `Hola ${nombre}, te vi como agente preferido${zona ? " de " + zona : ""} en Medellín Social y quiero que me ayudes.`;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163A11.86 11.86 0 010 6.19 11.93 11.93 0 0112.05.24c3.18 0 6.17 1.24 8.42 3.49a11.82 11.82 0 013.48 8.41c0 6.56-5.33 11.89-11.89 11.89a11.9 11.9 0 01-5.68-1.45L.057 24zM6.6 20.13c1.68 1 3.28 1.6 5.4 1.6 5.45 0 9.89-4.43 9.89-9.88 0-5.46-4.44-9.89-9.88-9.89C6.56 1.96 2.13 6.39 2.13 11.85c0 2.22.65 3.88 1.75 5.63l-1 3.66 3.72-.98zm11.39-5.56c-.07-.12-.26-.19-.54-.33-.28-.14-1.65-.81-1.9-.9-.26-.1-.44-.14-.63.14-.19.28-.72.9-.88 1.09-.16.19-.32.21-.6.07-.28-.14-1.18-.43-2.24-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.17.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.63-1.51-.86-2.07-.23-.55-.46-.47-.63-.48l-.54-.01c-.19 0-.49.07-.75.35-.26.28-.98.96-.98 2.33 0 1.38 1 2.71 1.14 2.9.14.19 1.97 3.0 4.77 4.21.67.29 1.19.46 1.6.59.67.21 1.28.18 1.76.11.54-.08 1.65-.67 1.88-1.32.23-.65.23-1.21.16-1.33z" />
    </svg>
  );
}

/** UN realtor preferido de la zona por CARGA (regla barrio→comuna en el server).
 *  `/siguiente` avanza el cursor compartido (realtor_preferido_rotacion) y devuelve
 *  el que toca → estático en esta vista, el siguiente al recargar. Reparte parejo
 *  entre los que pagaron. Devuelve el realtor, el nivel resuelto y loading. */
function useRealtorZonaSiguiente(barrioId?: number | null, cdComuna?: number | null): { realtor: RealtorZona | null; nivel: Nivel | null; loading: boolean } {
  const barrioKey = barrioId != null && barrioId > 0 ? String(barrioId) : null;
  const comunaKey = cdComuna != null && cdComuna > 0 ? String(cdComuna) : null;
  const [state, setState] = useState<{ realtor: RealtorZona | null; nivel: Nivel | null; loading: boolean }>({ realtor: null, nivel: null, loading: false });

  useEffect(() => {
    let cancel = false;
    if (!barrioKey && !comunaKey) { setState({ realtor: null, nivel: null, loading: false }); return; }
    setState({ realtor: null, nivel: null, loading: true });

    (async () => {
      // El más específico; el server cae a comuna si el barrio no tiene preferidos.
      const nivel: Nivel = barrioKey ? "barrio" : "comuna";
      const codigo = barrioKey ?? comunaKey!;
      try {
        const r = await apiFetch<{ realtor: RealtorZona | null; nivel: Nivel | null }>(
          API_ENDPOINTS.realtorPreferidoSiguiente(nivel, codigo),
        );
        if (!cancel) setState({ realtor: r.realtor, nivel: r.nivel, loading: false });
      } catch {
        if (!cancel) setState({ realtor: null, nivel: null, loading: false });
      }
    })();

    return () => { cancel = true; };
  }, [barrioKey, comunaKey]);

  return state;
}

/** Rectángulo (esquina sup-derecha del mapa) con los realtors de la zona clickeada,
 *  deslizando uno distinto cada ~6s (pausa al hover/foco; respeta reduced-motion).
 *  Comuna (paga más) = acentos oro + pulso; barrio neutro. CTA WhatsApp directo al
 *  realtor mostrado. Certificado → sello. Zona sin preferidos → gancho de captación. */
export function RealtorsZonaCarousel({
  barrioId,
  cdComuna,
  zonaNombre,
}: {
  barrioId?: number | null;
  cdComuna?: number | null;
  zonaNombre?: string | null;
}) {
  const { lang } = useLang();
  const reduce = useReducedMotion();
  const { realtor: cur, nivel, loading } = useRealtorZonaSiguiente(barrioId, cdComuna);

  const zonaSel = (barrioId != null && barrioId > 0) || (cdComuna != null && cdComuna > 0);

  // Impresión: registra el realtor que se muestra (exposición = valor del cupo pago).
  useEffect(() => {
    if (!cur) return;
    track("realtor_zona_impresion", { entity_type: "agent", entity_id: cur.id, metadata: { zona_nivel: nivel, zona: zonaNombre } });
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zona seleccionada pero sin preferidos (y ya cargó) → gancho de captación.
  if (!loading && !cur && zonaSel) {
    const nivelVacio = barrioId != null && barrioId > 0 ? "barrio" : "comuna";
    const codigoVacio = nivelVacio === "barrio" ? barrioId : cdComuna;
    return (
      <a
        href={`/planes/featured-realtor?zona_nivel=${nivelVacio}&zona_codigo=${codigoVacio}`}
        data-testid="realtors-zona-vacia"
        onClick={() => track("realtor_zona_cta_preferente", { metadata: { zona_nivel: nivelVacio, zona: zonaNombre } })}
        style={{
          display: "block", width: 278, maxWidth: "calc(100vw - 24px)", borderRadius: 16, padding: "14px 15px", textDecoration: "none",
          background: "rgba(255,255,255,0.97)", border: `1px dashed ${ORO_BORDE}`,
          boxShadow: "0 10px 28px rgba(20,32,29,0.16)", backdropFilter: "blur(6px)",
        }}
      >
        <span style={{ fontFamily: K.manrope, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: ORO }}>
          {lang === "en" ? "Are you a realtor?" : "¿Sos realtor?"}
        </span>
        <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 15, color: K.ink, margin: "4px 0 2px" }}>
          {lang === "en" ? `Be the preferred agent in ${zonaNombre ?? "this area"}` : `Sé el preferente de ${zonaNombre ?? "esta zona"}`}
        </p>
        <span style={{ fontFamily: K.manrope, fontSize: 12, color: K.muted }}>
          {(lang === "en" ? "Show up first when buyers search here →" : "Aparecé primero cuando busquen acá →")}
        </span>
      </a>
    );
  }

  if (!cur) return null; // cargando o sin zona → nada
  const premium = nivel === "comuna";
  const wa = waHref(cur.telefono, cur.nombre, zonaNombre, lang);
  const meta = [cur.agencia_nombre, cur.anios_experiencia ? `${cur.anios_experiencia} ${lang === "en" ? "yrs" : "años"}` : null].filter(Boolean).join(" · ");

  const pulso = premium && !reduce
    ? {
        animate: {
          boxShadow: [
            "0 10px 28px rgba(20,32,29,0.14), 0 0 0 0 rgba(200,151,46,0.42)",
            "0 10px 28px rgba(20,32,29,0.14), 0 0 0 9px rgba(200,151,46,0.00)",
          ],
        },
        transition: { duration: 2.2, repeat: Infinity, ease: "easeOut" as const },
      }
    : {};

  return (
    <motion.div
      data-testid="realtors-zona-carousel"
      data-nivel={nivel ?? ""}
      {...pulso}
      style={{
        width: 278,
        maxWidth: "calc(100vw - 24px)",
        borderRadius: 16,
        padding: 13,
        backdropFilter: "blur(6px)",
        background: "rgba(255,255,255,0.97)",
        border: `1px solid ${premium ? ORO_BORDE : K.line}`,
        ...(pulso.animate ? {} : { boxShadow: "0 10px 28px rgba(20,32,29,0.16)" }),
      }}
    >
      <div style={{ marginBottom: 9, minWidth: 0 }}>
        {premium ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ flexShrink: 0, fontFamily: K.manrope, fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: ORO, background: ORO_CHIP, border: `1px solid ${ORO_BORDE}`, borderRadius: 999, padding: "3px 8px" }}>
              ★ {lang === "en" ? "Preferred" : "Preferente"}
            </span>
            <span style={{ fontFamily: K.manrope, fontSize: 11, fontWeight: 700, color: K.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {zonaNombre ?? ""}
            </span>
          </span>
        ) : (
          <span style={{ display: "block", fontFamily: K.manrope, fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: K.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(lang === "en" ? "Agent in " : "Agente en ") + (zonaNombre ?? "")}
          </span>
        )}
      </div>

      {/* Altura fija: unos realtors traen agencia/rating y otros no → sin saltos. */}
      <div style={{ height: 56 }}>
            <a
              href={`/agentes/${cur.id}`}
              onClick={() => track("realtor_zona_click", { entity_type: "agent", entity_id: cur.id, metadata: { accion: "perfil", zona_nivel: nivel } })}
              style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", height: "100%" }}
            >
              <span style={{ position: "relative", flexShrink: 0, width: 48, height: 48 }}>
                {cur.foto_url ? (
                  <img src={cur.foto_url} alt={cur.nombre} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", boxShadow: premium ? `0 0 0 2px ${ORO_RING}` : "none" }} />
                ) : (
                  <span style={{ width: 48, height: 48, borderRadius: "50%", background: premium ? ORO_CHIP : K.tealLight, color: premium ? ORO : K.tealDeep, display: "grid", placeItems: "center", fontFamily: K.manrope, fontWeight: 800, fontSize: 16, boxShadow: premium ? `0 0 0 2px ${ORO_RING}` : "none" }}>
                    {iniciales(cur.nombre)}
                  </span>
                )}
                {cur.certificado && (
                  <span
                    title={lang === "en" ? "Certified agent" : "Agente certificado"}
                    style={{ position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: "50%", background: K.teal, color: "#fff", border: "2px solid #fff", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 900 }}
                  >
                    ✓
                  </span>
                )}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontFamily: K.serif, fontWeight: 800, fontSize: 15.5, color: K.ink, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cur.nombre}
                </p>
                {meta && (
                  <p style={{ fontFamily: K.manrope, fontSize: 12, color: K.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meta}
                  </p>
                )}
                {cur.rating_promedio != null && cur.rating_promedio > 0 && (
                  <div style={{ marginTop: 3 }}><Stars value={cur.rating_promedio} size={12} /></div>
                )}
              </div>
            </a>
      </div>

      {/* CTA: lead directo al realtor mostrado (el que paga recibe el lead). */}
      <a
        href={wa ?? `/agentes/${cur.id}`}
        target={wa ? "_blank" : undefined}
        rel={wa ? "noopener noreferrer" : undefined}
        data-testid="realtor-contactar"
        onClick={() => track("realtor_zona_click", { entity_type: "agent", entity_id: cur.id, metadata: { accion: wa ? "whatsapp" : "perfil", zona_nivel: nivel } })}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 11,
          padding: "9px 12px", borderRadius: 10, textDecoration: "none",
          fontFamily: K.manrope, fontWeight: 800, fontSize: 13,
          background: wa ? WA_VERDE : K.ink, color: "#fff",
        }}
      >
        {wa ? <WhatsAppIcon /> : null}
        {wa ? (lang === "en" ? "Contact" : "Contactar") : (lang === "en" ? "View profile" : "Ver perfil")}
      </a>
    </motion.div>
  );
}
