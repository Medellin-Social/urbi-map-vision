export interface EventoData {
  id: number
  fuente: string
  titulo: string
  descripcion?: string | null
  foto_url?: string | null
  url_externo?: string | null
  fecha_inicio: string
  fecha_fin?: string | null
  gratuito: boolean
  precio: number
  organizador?: string | null
  categoria?: string | null
  tipo_audiencia?: string | null
  lat?: number | null
  lon?: number | null
  barrio_id?: number | null
  barrio_nombre?: string | null
  destacado: boolean
}

const K = {
  ink: '#14201d', muted: '#62736d', teal: '#1D9E75', tealDeep: '#085041',
  coral: '#D85A30', coralLight: '#FAECE7', amarillo: '#ffc928',
  line: '#e9e4d8', surface: '#f5f0e8',
  serif: "'Fraunces', Georgia, serif" as const,
}

function parseFecha(str: string) {
  const normalized = str.replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return { day: '??', month: '???', full: str, hora: '' }
  return {
    day: d.toLocaleDateString('es-CO', { day: 'numeric' }),
    month: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '').toUpperCase(),
    full: d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
    hora: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  }
}

const CATEGORIA_META: Record<string, { label: string; emoji: string; color: string }> = {
  musica:      { label: 'Música',      emoji: '🎵', color: '#D85A30' },
  networking:  { label: 'Networking',  emoji: '🤝', color: '#1D9E75' },
  gastronomia: { label: 'Gastronomía', emoji: '🍽️', color: '#b8960a' },
  cultura:     { label: 'Cultura',     emoji: '🎭', color: '#d6217e' },
  deporte:     { label: 'Deporte',     emoji: '🏃', color: '#639922' },
  bienestar:   { label: 'Bienestar',   emoji: '🧘', color: '#9B8B75' },
  tech:        { label: 'Tech',        emoji: '💻', color: '#143cc4' },
  social:      { label: 'Social',      emoji: '🎉', color: '#D85A30' },
  happy_hour:  { label: 'Happy Hour',  emoji: '🍹', color: '#b8960a' },
}

function catMeta(cat?: string | null) {
  if (!cat) return null
  return CATEGORIA_META[cat] ?? { label: cat, emoji: '📅', color: K.coral }
}

function ImgPlaceholder({ categoria }: { categoria?: string | null }) {
  const meta = catMeta(categoria)
  return (
    <div style={{
      width: '100%', height: '100%',
      background: meta ? `linear-gradient(135deg, ${meta.color}dd, ${meta.color}88)` : `linear-gradient(135deg, ${K.teal}, ${K.tealDeep})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '2.2rem',
    }}>
      {meta?.emoji ?? '📅'}
    </div>
  )
}

function ImgWithFallback({ src, alt, categoria }: { src: string; alt: string; categoria?: string | null }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <img
        src={src} alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={e => {
          const img = e.currentTarget
          img.style.display = 'none'
          const ph = img.nextElementSibling as HTMLElement | null
          if (ph) ph.style.removeProperty('display')
        }}
      />
      <div style={{ display: 'none', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
        <ImgPlaceholder categoria={categoria} />
      </div>
    </div>
  )
}

function PrecioLabel({ gratuito, precio }: { gratuito: boolean; precio: number }) {
  const isGratis = gratuito
  const label = isGratis ? 'Gratis' : precio > 0 ? `$${(precio / 1000).toFixed(0)}k COP` : null
  if (!label) return null
  return (
    <span style={{
      display: 'inline-block',
      background: isGratis ? K.teal + '22' : K.amarillo + '44',
      color: isGratis ? K.tealDeep : '#6b5200',
      fontWeight: 700, fontSize: '.66rem', padding: '2px 8px', borderRadius: 6,
    }}>
      {isGratis ? '🎟️ ' : '💵 '}{label}
    </span>
  )
}

export function EventCardFeatured({ evento }: { evento: EventoData }) {
  const f = parseFecha(evento.fecha_inicio)
  const cat = catMeta(evento.categoria)
  const priceLabel = evento.gratuito ? 'Gratis' : evento.precio > 0 ? `$${(evento.precio / 1000).toFixed(0)}k` : null

  return (
    <a
      href={evento.url_externo ?? '#'}
      target="_blank" rel="noopener noreferrer"
      style={{
        display: 'block', background: '#FAF7F2',
        border: '0.5px solid #E8E0D0', borderRadius: 10,
        overflow: 'hidden', textDecoration: 'none', position: 'relative',
      }}
    >
      {/* Badge */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 1,
        background: K.coral, color: K.coralLight,
        fontSize: 10, fontWeight: 700,
        padding: '3px 8px', borderRadius: 4,
        letterSpacing: '0.5px', textTransform: 'uppercase',
      }}>
        Destacado
      </div>

      {/* Foto */}
      <div style={{ height: 140, overflow: 'hidden', flexShrink: 0 }}>
        {evento.foto_url
          ? <ImgWithFallback src={evento.foto_url} alt={evento.titulo} categoria={evento.categoria} />
          : <ImgPlaceholder categoria={evento.categoria} />
        }
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          {cat && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: K.coral }}>
              {cat.emoji} {cat.label}
            </span>
          )}
          {priceLabel && <span style={{ fontSize: 10, color: '#9B8B75' }}>· {priceLabel}</span>}
        </div>
        <h3 style={{ fontFamily: K.serif, fontSize: 15, fontWeight: 600, color: '#1A1208', lineHeight: 1.3, margin: '0 0 6px' }}>
          {evento.titulo}
        </h3>
        <p style={{ fontSize: 12, color: '#9B8B75', margin: 0 }}>
          {evento.organizador ? `${evento.organizador} · ` : ''}{f.day} {f.month}
        </p>
      </div>
    </a>
  )
}

export function EventCardMini({ evento }: { evento: EventoData }) {
  const f = parseFecha(evento.fecha_inicio)
  const cat = catMeta(evento.categoria)
  const priceLabel = evento.gratuito ? ' · Gratis' : evento.precio > 0 ? ` · $${(evento.precio / 1000).toFixed(0)}k` : ''

  return (
    <a
      href={evento.url_externo ?? '#'}
      target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column',
        background: '#FFFFFF', border: '0.5px solid #E8E0D0',
        borderRadius: 10, overflow: 'hidden', textDecoration: 'none',
      }}
    >
      {/* Foto */}
      <div style={{ height: 130, overflow: 'hidden', flexShrink: 0 }}>
        {evento.foto_url
          ? <ImgWithFallback src={evento.foto_url} alt={evento.titulo} categoria={evento.categoria} />
          : <ImgPlaceholder categoria={evento.categoria} />
        }
      </div>

      {/* Footer: fecha box + contenido */}
      <div style={{ display: 'flex', gap: 12, padding: 12 }}>
        {/* Fecha box */}
        <div style={{
          background: '#F5F0E8', borderRadius: 8,
          padding: '8px 10px', textAlign: 'center',
          minWidth: 44, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontFamily: K.serif, fontSize: 20, fontWeight: 700, color: '#1A1208', lineHeight: 1 }}>
            {f.day}
          </div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9B8B75', marginTop: 2 }}>
            {f.month}
          </div>
        </div>

        {/* Contenido */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: K.coral, marginBottom: 4 }}>
            {cat ? `${cat.emoji} ${cat.label}` : '📅'}{priceLabel}
          </div>
          <h3 style={{
            fontSize: 14, fontWeight: 600, color: '#1A1208', lineHeight: 1.3, margin: '0 0 4px',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {evento.titulo}
          </h3>
          <p style={{ fontSize: 11, color: '#9B8B75', margin: 0 }}>
            📍 {evento.barrio_nombre || evento.organizador || 'Medellín'}
          </p>
        </div>
      </div>
    </a>
  )
}
