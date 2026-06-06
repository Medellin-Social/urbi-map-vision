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
  const isGratis = gratuito || precio === 0
  const label = isGratis ? 'Gratis' : `$${(precio / 1000).toFixed(0)}k COP`
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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden',
      background: '#fff', border: `1px solid ${K.line}`,
      boxShadow: '0 8px 28px rgba(20,32,29,.1)',
    }}>
      {/* Imagen */}
      <div style={{ height: 200, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {evento.foto_url
          ? <ImgWithFallback src={evento.foto_url} alt={evento.titulo} categoria={evento.categoria} />
          : <ImgPlaceholder categoria={evento.categoria} />
        }
        {evento.destacado && (
          <span style={{
            position: 'absolute', top: 12, left: 12,
            background: K.coral, color: '#fff', fontWeight: 800,
            fontSize: '.68rem', padding: '4px 10px', borderRadius: 6,
            textTransform: 'uppercase', letterSpacing: '.8px',
          }}>⭐ Destacado</span>
        )}
      </div>

      {/* Contenido */}
      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
          {cat && (
            <span style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: cat.color }}>
              {cat.emoji} {cat.label}
            </span>
          )}
          <PrecioLabel gratuito={evento.gratuito} precio={evento.precio} />
        </div>
        <h3 style={{ fontFamily: K.serif, fontWeight: 700, fontSize: '1.08rem', lineHeight: 1.25, margin: '0 0 8px', color: K.ink }}>
          {evento.titulo}
        </h3>
        {evento.descripcion && (
          <p style={{
            fontSize: '.8rem', color: K.muted, margin: '0 0 12px', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {evento.descripcion}
          </p>
        )}
        <a
          href={evento.url_externo ?? '#'}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-block', background: K.coral, color: '#fff',
            fontWeight: 800, fontSize: '.82rem', padding: '9px 20px',
            borderRadius: 999, textDecoration: 'none', alignSelf: 'flex-start',
          }}
        >
          Ver detalles →
        </a>

        {/* Fecha — debajo del botón */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${K.line}` }}>
          <div style={{ background: K.surface, borderRadius: 8, padding: '5px 10px', textAlign: 'center', minWidth: 42, flexShrink: 0 }}>
            <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.1rem', lineHeight: 1, color: K.coral }}>{f.day}</div>
            <div style={{ fontSize: '.58rem', textTransform: 'uppercase', letterSpacing: 1, color: K.muted }}>{f.month}</div>
          </div>
          <div>
            <div style={{ fontSize: '.8rem', color: K.ink, fontWeight: 600 }}>{f.full}</div>
            {f.hora && f.hora !== '12:00 a. m.' && (
              <div style={{ fontSize: '.74rem', color: K.muted }}>🕐 {f.hora}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function EventCardMini({ evento }: { evento: EventoData }) {
  const f = parseFecha(evento.fecha_inicio)
  const cat = catMeta(evento.categoria)

  return (
    <a
      href={evento.url_externo ?? '#'}
      target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', gap: 14, padding: '16px 0',
        borderBottom: `1px solid ${K.line}`,
        textDecoration: 'none', color: K.ink,
      }}
    >
      {/* Thumbnail — donde estaba el bloque de fecha */}
      <div style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 10, overflow: 'hidden' }}>
        {evento.foto_url
          ? <ImgWithFallback src={evento.foto_url} alt={evento.titulo} categoria={evento.categoria} />
          : <ImgPlaceholder categoria={evento.categoria} />
        }
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
          {cat && (
            <span style={{ fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: cat.color }}>
              {cat.emoji} {cat.label}
            </span>
          )}
          <PrecioLabel gratuito={evento.gratuito} precio={evento.precio} />
        </div>
        <h4 style={{ fontFamily: K.serif, fontWeight: 600, fontSize: '1rem', lineHeight: 1.2, margin: '0 0 3px', color: K.ink }}>
          {evento.titulo}
        </h4>
        {evento.barrio_nombre && (
          <div style={{ fontSize: '.72rem', color: K.muted, marginBottom: 3 }}>{evento.barrio_nombre}</div>
        )}
        {/* Fecha — debajo del texto */}
        <div style={{ fontSize: '.72rem', color: K.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: K.coral, fontWeight: 700 }}>{f.day} {f.month}</span>
          {f.hora && f.hora !== '12:00 a. m.' && <span>· {f.hora}</span>}
        </div>
      </div>
    </a>
  )
}
