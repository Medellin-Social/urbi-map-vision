import { useEffect, useRef, useState } from "react";
import { X } from "@/lib/icons";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

function BuildingPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        height,
        background: "linear-gradient(135deg, #0F8A4F 0%, #0A5C36 100%)",
        borderBottom: "0.5px solid #E5E0D5",
      }}
    >
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 64, height: 64, opacity: 0.4 }}>
        <rect x="10" y="20" width="40" height="50" rx="2" fill="white"/>
        <rect x="50" y="32" width="22" height="38" rx="2" fill="white"/>
        <rect x="16" y="28" width="7" height="7" fill="#0F8A4F"/>
        <rect x="30" y="28" width="7" height="7" fill="#0F8A4F"/>
        <rect x="16" y="40" width="7" height="7" fill="#0F8A4F"/>
        <rect x="30" y="40" width="7" height="7" fill="#0F8A4F"/>
        <rect x="21" y="53" width="10" height="17" fill="#0F8A4F"/>
        <rect x="56" y="40" width="7" height="7" fill="#0F8A4F"/>
        <rect x="56" y="52" width="7" height="7" fill="#0F8A4F"/>
      </svg>
    </div>
  );
}

type Props = {
  fotos?: string[] | null;
  titulo?: string;
  height?: number;
};

export function PhotoGallery({ fotos, titulo, height = 224 }: Props) {
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const photos = fotos?.filter(Boolean) ?? [];

  // Embla: slide/swipe en la galería inline (antes era un salto de src).
  const [api, setApi] = useState<CarouselApi>();
  useEffect(() => {
    if (!api) return;
    const onSel = () => setIdx(api.selectedScrollSnap());
    api.on("select", onSel);
    return () => { api.off("select", onSel); };
  }, [api]);
  // Guard tap-vs-swipe: solo abre el lightbox con un tap limpio, no al deslizar.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const wasDrag = useRef(false);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % photos.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightbox, photos.length]);

  if (!photos.length) {
    return <BuildingPlaceholder height={height} />;
  }

  return (
    <>
      <div
        className="relative overflow-hidden"
        style={{ height, borderBottom: "0.5px solid #E5E0D5" }}
        onPointerDown={(e) => { dragStart.current = { x: e.clientX, y: e.clientY }; wasDrag.current = false; }}
        onPointerMove={(e) => {
          const s = dragStart.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) wasDrag.current = true;
        }}
      >
        <Carousel setApi={setApi} className="h-full" opts={{ loop: true }}>
          <CarouselContent className="ml-0 h-full">
            {photos.map((src, i) => (
              <CarouselItem key={i} className="pl-0" style={{ height }}>
                <img
                  src={src}
                  alt={titulo ?? "Foto del inmueble"}
                  className="h-full w-full object-cover cursor-zoom-in"
                  style={{ height }}
                  onClick={() => { if (!wasDrag.current) setLightbox(true); }}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        {photos.length > 1 && (
          <>
            <button
              onClick={() => api?.scrollPrev()}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              ‹
            </button>
            <button
              onClick={() => api?.scrollNext()}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
              {photos.slice(0, 8).map((_, i) => (
                <button
                  key={i}
                  onClick={() => api?.scrollTo(i)}
                  className="rounded-full transition-all"
                  style={{
                    height: 6,
                    width: i === idx ? 16 : 6,
                    background: i === idx ? "#fff" : "rgba(255,255,255,0.5)",
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => setLightbox(true)}
              className="absolute bottom-2 right-3 z-10 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm hover:bg-black/60 transition"
            >
              {idx + 1} / {photos.length} · Ver todas
            </button>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(false)}
        >
          {/* Close */}
          <button
            onClick={() => setLightbox(false)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Counter */}
          <span className="absolute top-4 left-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            {idx + 1} / {photos.length}
          </span>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + photos.length) % photos.length); }}
              className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white text-2xl transition hover:bg-white/20"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={photos[idx]}
            alt={titulo ?? "Foto del inmueble"}
            className="max-h-[88dvh] max-w-[88vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % photos.length); }}
              className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white text-2xl transition hover:bg-white/20"
            >
              ›
            </button>
          )}

          {/* Dot strip */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.slice(0, 12).map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className="rounded-full transition-all"
                style={{
                  height: 7,
                  width: i === idx ? 20 : 7,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
