/**
 * GoHighLevel checkout links.
 * Pega cada URL cuando esté lista en GHL — mientras esté vacía usa el fallback.
 */
export const GHL = {
  /** Listing Member — $149/mo especial */
  listing_member: "",

  /** Featured Realtor — $299/mo especial */
  featured_realtor: "",

  /** Hot Spot — $199/mo especial, negocio local */
  hot_spot: "",

  /** Deal/Convenio — $29/mo por deal activo */
  deal: "",
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
