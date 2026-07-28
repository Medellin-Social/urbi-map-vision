// Whitelist de hosts embebibles para tour 3D / video (iframe). Espejo del backend
// (_ALLOWED_EMBED_HOSTS en api/routers/listings_propios.py). Nunca embeber un
// iframe de un host fuera de esta lista (clickjacking / contenido malicioso).
export const EMBED_HOSTS = [
  "matterport.com", "my.matterport.com", "kuula.co", "cloudpano.com",
  "istaging.com", "ricoh360.com", "insta360.com", "youtube.com",
  "youtu.be", "vimeo.com",
];

/** URL segura para <iframe src>; null si el host no está en la whitelist. */
export function toEmbedSrc(raw?: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;  // solo https embebible
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!EMBED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return null;
  if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
  if (host.endsWith("youtube.com")) {
    const id = u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : raw;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id ? `https://player.vimeo.com/video/${id}` : raw;
  }
  return raw;  // matterport/kuula/cloudpano/istaging/ricoh360/insta360 embeben directo
}
