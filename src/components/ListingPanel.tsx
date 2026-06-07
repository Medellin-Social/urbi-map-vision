import { useRef, useState } from "react";
import { GripVertical, MapPin, Minus, X, Maximize2 as ExpandIcon } from "lucide-react";
import { formatCOP } from "@/lib/format";
import type { ApiListing, ApiBarrio } from "@/lib/adapters";

const SOURCE_LABEL: Record<string, string> = {
  fincaraiz:      "Ver en Fincaraíz →",
  metrocuadrado:  "Ver en Metrocuadrado →",
  medellinliving: "Ver en MedellinLiving →",
};

function scoreLabel(s: number): string {
  if (s >= 70) return "EXCELENTE";
  if (s >= 55) return "BUENO";
  if (s >= 40) return "MODERADO";
  return "BAJO";
}

const PANEL_W = 320;
const PANEL_MIN_H = 200;

function clampPos(x: number, y: number, w: number) {
  const maxX = typeof window !== "undefined" ? window.innerWidth  - w  - 8 : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - 200   : y;
  return {
    left: Math.max(0, Math.min(maxX, x)),
    top:  Math.max(0, Math.min(maxY, y)),
  };
}

type Props = {
  listing: ApiListing;
  barrio?: ApiBarrio | null;
  initialPos?: { x: number; y: number };
  onClose: () => void;
  onOpenDetail?: () => void;
};

export function ListingPanel({ listing, barrio, initialPos, onClose, onOpenDetail }: Props) {
  const OFFSET_X = 16;
  const OFFSET_Y = -24;

  const defaultLeft = initialPos
    ? initialPos.x + OFFSET_X
    : typeof window !== "undefined" ? window.innerWidth - PANEL_W - 20 : 100;
  const defaultTop = initialPos
    ? initialPos.y + OFFSET_Y
    : typeof window !== "undefined" ? 80 : 80;

  const [pos, setPos]         = useState(() => clampPos(defaultLeft, defaultTop, PANEL_W));
  const [height, setHeight]   = useState(420);
  const [minimized, setMinimized] = useState(false);

  const posRef    = useRef(pos);
  const heightRef = useRef(height);
  posRef.current    = pos;
  heightRef.current = height;

  // ── Drag ──────────────────────────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,a")) return;
    e.preventDefault();
    const offX = e.clientX - posRef.current.left;
    const offY = e.clientY - posRef.current.top;
    document.body.style.cursor = "grabbing";

    const onMove = (ev: MouseEvent) =>
      setPos(clampPos(ev.clientX - offX, ev.clientY - offY, PANEL_W));

    const onUp = (ev: MouseEvent) => {
      setPos(clampPos(ev.clientX - offX, ev.clientY - offY, PANEL_W));
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ── Resize ────────────────────────────────────────────────────────────────
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = heightRef.current;
    document.body.style.cursor = "s-resize";

    const maxH = () =>
      typeof window !== "undefined"
        ? Math.min(window.innerHeight * 0.85, window.innerHeight - posRef.current.top - 20)
        : 600;

    const onMove = (ev: MouseEvent) =>
      setHeight(Math.max(PANEL_MIN_H, Math.min(maxH(), startH + (ev.clientY - startY))));

    const onUp = (ev: MouseEvent) => {
      setHeight(Math.max(PANEL_MIN_H, Math.min(maxH(), startH + (ev.clientY - startY))));
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ── Data ──────────────────────────────────────────────────────────────────
  const tipoOp  = listing.tipo_operacion ?? "venta";
  const tipoInm = listing.tipo_inmueble  ?? "";
  const fuente  = (listing.fuente ?? "").toLowerCase();

  const pm2 =
    listing.precio_m2 && listing.precio_m2 > 0
      ? listing.precio_m2
      : listing.precio_cop && listing.area_m2 && listing.area_m2 > 0
        ? Math.round(listing.precio_cop / listing.area_m2)
        : null;

  const mediana = listing.precio_m2_mediana_barrio;

  let badge: { label: string; color: string; emoji: string; desc: string } | null = null;
  if (tipoOp === "venta" && pm2 && mediana && mediana > 0) {
    const diff = ((pm2 - mediana) / mediana) * 100;
    if (diff < -10)
      badge = { label: "BUENA OFERTA", color: "#085041", emoji: "🟢", desc: `${Math.abs(diff).toFixed(0)}% bajo la mediana del barrio` };
    else if (diff > 15)
      badge = { label: "SOBRE PRECIO",  color: "#E24B4A", emoji: "🔴", desc: `${diff.toFixed(0)}% sobre la mediana` };
    else
      badge = { label: "PRECIO JUSTO",  color: "#9B8B75", emoji: "⚪", desc: "Dentro del rango del barrio" };
  }

  let yieldEst: number | null = null;
  if (tipoOp === "venta" && listing.precio_cop && barrio?.mercado.arriendo_p50_cop) {
    const y = (barrio.mercado.arriendo_p50_cop * 12) / listing.precio_cop * 100;
    if (y > 0 && y < 30) yieldEst = y;
  }

  const score  = barrio?.scores.score_activo ?? null;
  const opColor = tipoOp === "arriendo" ? "#5DCAA5" : "#1D9E75";

  const waText = encodeURIComponent(
    `Hola, me interesa una propiedad en ${listing.barrio_nombre ?? ""} de ${listing.precio_cop ? formatCOP(listing.precio_cop) : "—"} COP. ¿Pueden ayudarme?`,
  );
  const waUrl = `https://wa.me/+573122502394?text=${waText}`;

  return (
    <div
      className="pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-2xl"
      style={{
        left:      pos.left,
        top:       pos.top,
        width:     PANEL_W,
        height:    minimized ? "auto" : height,
        minHeight: PANEL_MIN_H,
        background: '#FAF7F2',
        border: '0.5px solid #E8E0D0',
        boxShadow: '0 8px 32px rgba(26,18,8,0.15)',
        '--background': '#FFFFFF',
        '--foreground': '#1A1208',
        '--surface': '#FAF7F2',
        '--surface-elevated': '#F5F0E8',
        '--muted-foreground': '#6B5B45',
        '--border': 'rgb(184 164 138 / 50%)',
      } as React.CSSProperties}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="flex h-10 shrink-0 cursor-grab select-none items-center justify-between px-3"
        style={{ background: '#F5F0E8', borderBottom: '0.5px solid #E8E0D0' }}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <span
              className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
              style={{
                background: tipoOp === "arriendo" ? "#E1F5EE" : "#FAECE7",
                color:      tipoOp === "arriendo" ? "#1D9E75" : "#D85A30",
              }}
            >
              {tipoOp}
            </span>
            {tipoInm && (
              <span className="rounded px-2 py-0.5 text-[11px] capitalize text-[#6B5B45]" style={{ background: 'rgba(26,18,8,.07)' }}>
                {tipoInm}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized((v) => !v)}
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
            title={minimized ? "Expandir" : "Minimizar"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {listing.barrio_nombre && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {listing.barrio_nombre}
              </div>
            )}

            {listing.precio_cop && (
              <div>
                <div className="font-display text-xl font-bold">
                  {formatCOP(listing.precio_cop)} COP
                </div>
                {listing.precio_usd && (
                  <div className="text-[11px] text-muted-foreground">
                    ~${(listing.precio_usd / 1000).toFixed(0)}k USD
                  </div>
                )}
              </div>
            )}

            {(listing.area_m2 || listing.habitaciones || listing.banos) && (
              <div className="flex flex-wrap gap-3 text-xs text-foreground/80">
                {listing.area_m2      && <span>📐 {listing.area_m2}m²</span>}
                {listing.habitaciones && <span>🛏️ {listing.habitaciones}hab</span>}
                {listing.banos        && <span>🚿 {listing.banos}baños</span>}
              </div>
            )}

            <div className="rounded-lg p-3 text-xs space-y-1.5" style={{ background: '#F5F0E8', border: '0.5px solid #E8E0D0' }}>
              {/* precio/m² solo para venta */}
              {pm2 && tipoOp === "venta" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio/m²:</span>
                  <span className="font-semibold">{formatCOP(pm2)}/m²</span>
                </div>
              )}
              {mediana && tipoOp === "venta" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mediana zona:</span>
                  <span>{formatCOP(mediana)}/m²</span>
                </div>
              )}
              {yieldEst != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Yield estimado:</span>
                  <span className="font-semibold text-primary">{yieldEst.toFixed(1)}%</span>
                </div>
              )}
              {score != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Score zona:</span>
                  <span className="font-semibold text-primary">
                    {score} · {scoreLabel(score)}
                  </span>
                </div>
              )}
            </div>

            {badge && (
              <div
                className="rounded-lg p-2.5 text-xs"
                style={{ background: `${badge.color}18`, border: `1px solid ${badge.color}44` }}
              >
                <div className="font-bold" style={{ color: badge.color }}>
                  {badge.emoji} {badge.label}
                </div>
                <div className="mt-0.5 text-muted-foreground">{badge.desc}</div>
              </div>
            )}

            {/* Ver detalle completo → abre modal */}
            <button
              onClick={onOpenDetail}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold text-[#1A1208] transition hover:bg-[#E8E0D0]"
              style={{ border: '0.5px solid #E8E0D0', background: '#F5F0E8' }}
            >
              <ExpandIcon className="h-3 w-3" />
              Ver detalle completo
            </button>

            <div className="flex gap-2">
              {listing.url && (
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center rounded-md py-2 text-[11px] font-semibold text-[#6B5B45] transition hover:bg-[#E8E0D0]"
                  style={{ border: '0.5px solid #E8E0D0', background: 'transparent' }}
                >
                  {SOURCE_LABEL[fuente] ?? "Ver listado →"}
                </a>
              )}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center rounded-md py-2 text-[11px] font-semibold text-[#E1F5EE] transition hover:opacity-90"
                  style={{ background: '#1D9E75', border: 'none' }}
              >
                Agente 💬
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Resize handle */}
      {!minimized && (
        <div
          onMouseDown={startResize}
          className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-s-resize opacity-30 hover:opacity-70 transition-opacity"
          title="Redimensionar"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full text-muted-foreground">
            <circle cx="13" cy="13" r="1.4" />
            <circle cx="9"  cy="13" r="1.4" />
            <circle cx="13" cy="9"  r="1.4" />
            <circle cx="5"  cy="13" r="1.4" />
            <circle cx="9"  cy="9"  r="1.4" />
            <circle cx="13" cy="5"  r="1.4" />
          </svg>
        </div>
      )}
    </div>
  );
}
