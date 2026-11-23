// Kit de presentación de las secciones del Centro de agente (Mis listings, Bandeja,
// Mercado, Herramientas). Inicio sigue usando _kit.tsx tal cual — esto lo complementa
// con piezas más expresivas: KPI con ícono, paneles con encabezado, pills por tono.
// Prefijo "-": el router de TanStack ignora este archivo (no es ruta).
// Sin textos en español aquí: todo el copy vive en dashboard.tsx (escaneado por i18n).
import type { ComponentType, ReactNode, SVGProps } from "react";
import { C } from "./_kit";

type IconT = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

// Tonos semánticos. fg sobre bg pasa AA (≥4.5:1) en todos.
export const TONE = {
  brand:   { fg: "#0C7A45", bg: "#E7F4EC", line: "#BFE3CD", solid: "#0F8A4F" },
  info:    { fg: "#1F5FAD", bg: "#EAF2FC", line: "#C9DDF6", solid: "#3987e5" },
  warn:    { fg: "#875400", bg: "#FFF4DB", line: "#F3DCA2", solid: "#fab219" },
  bad:     { fg: "#B42318", bg: "#FDECEA", line: "#F5C6C0", solid: "#d03b3b" },
  violet:  { fg: "#4a3aa7", bg: "#EFEDFA", line: "#D6D1F2", solid: "#4a3aa7" },
  neutral: { fg: "#4B4F4C", bg: "#F3F0E8", line: "#E7E2D6", solid: "#8A8E8A" },
} as const;
export type Tone = keyof typeof TONE;

export function IconChip({ icon: Icon, tone = "neutral", size = 36 }: { icon: IconT; tone?: Tone; size?: number }) {
  const t = TONE[tone];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl"
      style={{ width: size, height: size, background: t.bg, color: t.fg }}
      aria-hidden
    >
      <Icon className={size >= 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

export function Pill({ tone = "neutral", dot, children, title, testId }: {
  tone?: Tone; dot?: boolean; children: ReactNode; title?: string; testId?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      data-testid={testId}
      title={title}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5"
      style={{ background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.line}` }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.solid }} aria-hidden />}
      {children}
    </span>
  );
}

// Encabezado de sección: título grande + bajada + acciones a la derecha.
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: C.ink }}>{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: C.sub }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// KPI con ícono. Si trae onClick se vuelve un filtro (botón con estado activo).
export function KpiCard({ icon, label, value, hint, tone = "neutral", active, onClick }: {
  icon: IconT; label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; active?: boolean; onClick?: () => void;
}) {
  const t = TONE[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold leading-tight" style={{ color: C.sub }}>{label}</span>
        <IconChip icon={icon} tone={tone} size={32} />
      </div>
      <div className="mt-1 text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: C.ink }}>{value}</div>
      {hint && <div className="mt-1.5 text-[11.5px] leading-snug" style={{ color: C.muted }}>{hint}</div>}
    </>
  );
  const style = {
    background: C.card,
    border: `1px solid ${active ? t.solid : C.line}`,
    boxShadow: active ? `0 0 0 3px ${t.bg}` : "0 1px 2px rgba(17,20,24,0.04)",
  };
  const cls = "relative flex flex-col overflow-hidden rounded-2xl p-4 text-left transition";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cls} hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      style={style}
    >
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>{body}</div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const lg = cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <div className={`mb-6 grid grid-cols-2 gap-3 ${lg}`}>{children}</div>;
}

// Panel: tarjeta con encabezado (ícono + título + conteo + acción) y cuerpo.
export function Panel({ icon, tone = "neutral", title, subtitle, count, actions, children, flush, className = "", id }: {
  icon?: IconT; tone?: Tone; title?: ReactNode; subtitle?: ReactNode; count?: number;
  actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; id?: string;
}) {
  return (
    <section
      id={id}
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(17,20,24,0.04)" }}
    >
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex min-w-0 items-center gap-3">
            {icon && <IconChip icon={icon} tone={tone} />}
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
                {title}
                {count != null && (
                  <span className="rounded-full px-2 text-[11px] font-bold tabular-nums leading-5" style={{ background: C.soft, color: C.sub }}>
                    {count}
                  </span>
                )}
              </h2>
              {subtitle && <p className="text-[12px] leading-snug" style={{ color: C.muted }}>{subtitle}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

// Celda de métrica para grids internos de un Panel (sin borde propio).
export function MetricCell({ label, value, hint, ring, accent }: {
  label: string; value: ReactNode; hint?: ReactNode; ring?: number | null; accent?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {ring !== undefined && <MiniRing value={ring} />}
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium leading-tight" style={{ color: C.muted }}>{label}</div>
        <div className="mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums" style={{ color: accent ?? C.ink }}>{value}</div>
        {hint && <div className="mt-0.5 truncate text-[11px]" style={{ color: C.sub }}>{hint}</div>}
      </div>
    </div>
  );
}

export function MiniRing({ value, size = 44 }: { value: number | null; size?: number }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const R = size / 2 - 5, CIRC = 2 * Math.PI * R;
  const col = v == null ? C.muted : v >= 66 ? C.brand : v >= 33 ? C.warn : C.bad;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={C.soft} strokeWidth={5} />
        {v != null && (
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={`${CIRC * (v / 100)} ${CIRC}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold tabular-nums" style={{ color: C.ink }}>
        {v == null ? "—" : Math.round(v)}
      </span>
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, msg, action }: { icon: IconT; title?: string; msg: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl px-6 py-12 text-center" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: C.soft, color: C.muted }} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      {title && <p className="mt-3 text-[14px] font-semibold" style={{ color: C.ink }}>{title}</p>}
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed" style={{ color: C.muted }}>{msg}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Avatar de iniciales con color estable por nombre.
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const col = C.cat[h % C.cat.length];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: col, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// Stepper horizontal de etapas (completadas / actual / pendientes).
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < current, now = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-1.5 rounded-full" style={{ background: done ? C.brand : now ? TONE.brand.line : C.soft }} />
            <span
              className="truncate text-[11px] font-semibold"
              style={{ color: done ? TONE.brand.fg : now ? C.ink : C.muted }}
              aria-current={now ? "step" : undefined}
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Tabs compactos tipo segmented con conteo.
export function FilterTabs<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string; n?: number }[]; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl p-1" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.v)}
            className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={on ? { background: C.card, color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: C.muted }}
          >
            {o.label}
            {o.n != null && <span className="tabular-nums" style={{ opacity: 0.65 }}>{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}
