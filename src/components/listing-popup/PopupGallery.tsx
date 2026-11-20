import { useLang } from "@/lib/i18n";
import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "@/lib/icons";

const PHOTO_H = 150;

function BuildingPlaceholder() {
  return (
    <div
      className="flex w-full items-center justify-center"
      style={{ height: PHOTO_H, background: "linear-gradient(135deg, #0F8A4F 0%, #0A5C36 100%)" }}
    >
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 40, height: 40, opacity: 0.45 }} aria-hidden>
        <rect x="6" y="12" width="24" height="30" rx="1" fill="white" />
        <rect x="30" y="20" width="14" height="22" rx="1" fill="white" />
        <rect x="10" y="16" width="4" height="4" fill="#0F8A4F" />
        <rect x="18" y="16" width="4" height="4" fill="#0F8A4F" />
        <rect x="10" y="24" width="4" height="4" fill="#0F8A4F" />
        <rect x="18" y="24" width="4" height="4" fill="#0F8A4F" />
        <rect x="13" y="32" width="6" height="10" fill="#0F8A4F" />
        <rect x="34" y="24" width="4" height="4" fill="#0F8A4F" />
        <rect x="34" y="30" width="4" height="4" fill="#0F8A4F" />
      </svg>
    </div>
  );
}

type Props = {
  /** Full gallery from the detail endpoint (may be absent while loading). */
  fotos?: string[] | null;
  /** foto_principal from the PIN — the detail endpoint returns it null. */
  fallbackFoto?: string | null;
  /** Detail still loading — show skeleton only if we have no photo at all. */
  loading?: boolean;
  alt: string;
};

/** Gallery: carousel over fotos[] when available; single pin photo meanwhile;
 *  skeleton/placeholder when nothing. Plug-in ready for a bigger fotos[] later. */
export function PopupGallery({ fotos, fallbackFoto, loading, alt }: Props) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  const gallery = (fotos ?? []).filter(Boolean);
  const { lang } = useLang();

  if (gallery.length > 1) {
    return (
      <Carousel setApi={setApi} className="relative" opts={{ loop: true }}>
        <CarouselContent className="ml-0">
          {gallery.map((src, i) => (
            <CarouselItem key={src} className="pl-0">
              <img
                src={src}
                alt={lang === "en" ? `${alt} — photo ${i + 1} of ${gallery.length}` : `${alt} — foto ${i + 1} de ${gallery.length}`}
                className="w-full object-cover"
                style={{ height: PHOTO_H }}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        {/* Zonas laterales estilo Zillow: toda la altura de la foto. Lado izq/der
            navegan; el centro queda libre → tap abre el detalle (popup grande). */}
        <button
          type="button"
          aria-label={lang === "en" ? "Previous photo" : "Foto anterior"}
          onClick={(e) => { e.stopPropagation(); api?.scrollPrev(); }}
          className="group absolute left-0 top-0 flex h-full w-1/4 items-center justify-start pl-1.5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
            <ChevronLeft className="h-5 w-5" />
          </span>
        </button>
        <button
          type="button"
          aria-label={lang === "en" ? "Next photo" : "Foto siguiente"}
          onClick={(e) => { e.stopPropagation(); api?.scrollNext(); }}
          className="group absolute right-0 top-0 flex h-full w-1/4 items-center justify-end pr-1.5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
            <ChevronRight className="h-5 w-5" />
          </span>
        </button>
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {index + 1}/{gallery.length}
        </span>
      </Carousel>
    );
  }

  const single = gallery[0] ?? fallbackFoto;
  if (single) {
    return (
      <img
        src={single}
        alt={alt}
        className="w-full object-cover"
        style={{ height: PHOTO_H }}
        loading="eager"
        decoding="async"
      />
    );
  }
  if (loading) return <Skeleton className="w-full rounded-none" style={{ height: PHOTO_H }} />;
  return <BuildingPlaceholder />;
}
