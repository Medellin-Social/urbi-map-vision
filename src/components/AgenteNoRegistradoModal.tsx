// Aviso "Este agente aún no está registrado" (Programa de agentes, Parte uno).
// Para anuncios importados sin agente registrado: nunca se genera un perfil, foto ni
// insignia desde la fuente importada. Ofrece el anuncio original (si hay URL válida)
// y el directorio filtrado por la zona del inmueble (certificados y preferentes).
import { useEffect } from "react";
import { X } from "@/lib/icons";
import { useLang } from "@/lib/i18n";
import { originalListingUrl, type OriginalListingSource } from "@/lib/originalListing";

export function AgenteNoRegistradoModal({ listing, barrio, comuna, onClose }: {
  listing: OriginalListingSource | null | undefined;
  barrio?: string | null;
  comuna?: string | null;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const original = originalListingUrl(listing);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const qs = new URLSearchParams({ tipo_agente: "certified,preferred" });
  if (barrio) qs.set("zona", barrio);
  if (comuna) qs.set("comuna", comuna);
  const directorio = `/agentes?${qs.toString()}`;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }}
      onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="ag-noreg-title" data-testid="aviso-no-registrado" data-i18n-skip
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="ag-noreg-title" className="text-lg font-bold" style={{ color: "#111418" }}>
            {en ? "This agent isn't registered yet" : "Este agente aún no está registrado"}
          </h2>
          <button onClick={onClose} aria-label={en ? "Close" : "Cerrar"} className="rounded-full p-1 hover:bg-black/5"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "#3A3D3A" }}>
          {en
            ? "You can contact this agent directly through the property's original listing. To explore certified and preferred agents in the area you're interested in, use our directory."
            : "Puedes contactar directamente a este agente a través del anuncio original del inmueble. Para explorar agentes certificados y preferentes en la zona que te interesa, utiliza nuestro directorio."}
        </p>
        <div className="mt-5 grid gap-2">
          {original && (
            <a href={original} target="_blank" rel="noopener noreferrer" data-testid="ver-anuncio-original"
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: "#0F8A4F" }}>
              {en ? "View original listing" : "Ver anuncio original"}
            </a>
          )}
          <a href={directorio} data-testid="buscar-certificados"
            className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition hover:opacity-90"
            style={{ border: "1px solid #0F8A4F", color: "#0A5C36", background: original ? "#E7F4EC" : "#FFFFFF" }}>
            {en ? "Find certified and preferred agents" : "Buscar agentes certificados y preferentes"}
          </a>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs">
          <a href="/agentes/programa" className="font-semibold" style={{ color: "#0A5C36" }}>
            {en ? "Are you this agent? Learn how to register" : "¿Eres este agente? Conoce cómo registrarte"}
          </a>
          <a href="/agentes/estados#no-registrado" style={{ color: "#6E726E" }}>
            {en ? "What does this mean?" : "¿Qué significa?"}
          </a>
        </div>
      </div>
    </div>
  );
}
