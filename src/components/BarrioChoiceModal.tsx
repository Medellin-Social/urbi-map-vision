interface Props {
  barrio: { nombre: string; municipio: string };
  onClose: () => void;
  onComunidad: () => void;
  onInversiones: () => void;
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function BarrioChoiceModal({ barrio, onClose, onComunidad, onInversiones }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-[420px] rounded-xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-widest text-white/40">
              {barrio.municipio}
            </div>
            <h2 className="mt-0.5 font-display text-xl font-bold text-white">
              {titleCase(barrio.nombre)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="h-px bg-white/10 mb-5" />

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onComunidad}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E5484D]/60 hover:bg-[#E5484D]/08"
          >
            <span className="text-3xl">🏘️</span>
            <span className="text-[15px] font-semibold text-white">Comunidad</span>
            <span className="text-[12px] leading-snug text-white/50">
              Conoce el barrio, cafés y eventos locales
            </span>
          </button>

          <button
            onClick={onInversiones}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1F5BC6]/60 hover:bg-[#1F5BC6]/08"
          >
            <span className="text-3xl">📊</span>
            <span className="text-[15px] font-semibold text-white">Invertir</span>
            <span className="text-[12px] leading-snug text-white/50">
              Ver yields, precios y análisis de inversión
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
