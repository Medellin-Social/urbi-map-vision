import { useState } from "react";

function BuildingPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        height,
        background: "linear-gradient(135deg, #1D9E75 0%, #085041 100%)",
        borderBottom: "0.5px solid #E8E0D0",
      }}
    >
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 64, height: 64, opacity: 0.4 }}>
        <rect x="10" y="20" width="40" height="50" rx="2" fill="white"/>
        <rect x="50" y="32" width="22" height="38" rx="2" fill="white"/>
        <rect x="16" y="28" width="7" height="7" fill="#1D9E75"/>
        <rect x="30" y="28" width="7" height="7" fill="#1D9E75"/>
        <rect x="16" y="40" width="7" height="7" fill="#1D9E75"/>
        <rect x="30" y="40" width="7" height="7" fill="#1D9E75"/>
        <rect x="21" y="53" width="10" height="17" fill="#1D9E75"/>
        <rect x="56" y="40" width="7" height="7" fill="#1D9E75"/>
        <rect x="56" y="52" width="7" height="7" fill="#1D9E75"/>
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
  const photos = fotos?.filter(Boolean) ?? [];

  if (!photos.length) {
    return <BuildingPlaceholder height={height} />;
  }

  return (
    <div className="relative overflow-hidden" style={{ height, borderBottom: "0.5px solid #E8E0D0" }}>
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
                className="rounded-full transition-all"
                style={{
                  height: 6,
                  width: i === idx ? 16 : 6,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.5)",
                }}
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
