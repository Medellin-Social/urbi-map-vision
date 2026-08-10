/**
 * GoHighLevel checkout links.
 * Pega cada URL cuando esté lista en GHL — mientras esté vacía usa el fallback.
 */
export const GHL = {
  /** Listing Destacado — pago único $1,000 USD por listing */
  listing: "",
  // ej: "https://checkout.medellin.social/listing-destacado"

  /** Agente de Zona — barrio $200 USD/mes */
  agente_barrio: "",
  // ej: "https://checkout.medellin.social/agente-barrio"

  /** Agente de Zona — comuna $1,000 USD/mes */
  agente_comuna: "",
  // ej: "https://checkout.medellin.social/agente-comuna"
};

/**
 * Redirige a GHL con params opcionales en la URL.
 * Si el link está vacío, redirige al fallback.
 */
export function ghlRedirect(url: string, params: Record<string, string | number> = {}, fallback = "/planes") {
  if (!url) { window.location.href = fallback; return; }
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  window.location.href = u.toString();
}
