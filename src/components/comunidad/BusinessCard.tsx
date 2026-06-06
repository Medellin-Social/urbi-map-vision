export type { TiendaData } from '@/hooks/useTiendas'
import type { TiendaData } from '@/hooks/useTiendas'

const K = {
  ink: '#14201d',
  muted: '#62736d',
  teal: '#1D9E75',
  tealDeep: '#085041',
  coral: '#D85A30',
  coralLight: '#FAECE7',
  amarillo: '#ffc928',
  line: '#e9e4d8',
  serif: "'Fraunces', Georgia, serif" as const,
  green: '#25D366',
}

function Stars({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null
  const full = Math.min(Math.round(rating), 5)
  return (
    <div style={{ color: K.amarillo, fontSize: '.88rem', letterSpacing: 1, marginTop: 4 }}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
      <span style={{ color: K.muted, fontSize: '.68rem', marginLeft: 5 }}>{rating.toFixed(1)}</span>
    </div>
  )
}

function PriceRange({ value }: { value: string | null | undefined }) {
  if (!value) return null
  return (
    <span style={{ fontSize: '.7rem', color: K.muted, fontWeight: 700, marginLeft: 6 }}>{value}</span>
  )
}

function ActionButtons({ tienda, compact }: { tienda: TiendaData; compact?: boolean }) {
  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontWeight: 700, fontSize: '.72rem',
    padding: compact ? '4px 10px' : '6px 13px',
    borderRadius: 999, textDecoration: 'none', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  }
  const wa = tienda.whatsapp
    ? `https://wa.me/${tienda.whatsapp.replace(/\D/g, '')}`
    : tienda.telefono
      ? `https://wa.me/57${tienda.telefono.replace(/\D/g, '')}`
      : null
  const mapsUrl = tienda.lat && tienda.lon
    ? `https://www.google.com/maps/search/?api=1&query=${tienda.lat},${tienda.lon}`
    : null

  if (!wa && !mapsUrl && !tienda.website) return null

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          style={{ ...btnBase, background: K.green, color: '#fff' }}>
          💬 WA
        </a>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          style={{ ...btnBase, background: '#4285F4', color: '#fff' }}>
          📍 Maps
        </a>
      )}
      {tienda.website && (
        <a href={tienda.website} target="_blank" rel="noopener noreferrer"
          style={{ ...btnBase, background: K.coralLight, color: K.coral }}>
          🌐 Web
        </a>
      )}
    </div>
  )
}

export function BusinessCardDirectory({ tienda }: { tienda: TiendaData }) {
  const bg = tienda.foto_url
    ? `url('${tienda.foto_url}')`
    : `linear-gradient(135deg, ${K.teal}, ${K.tealDeep})`

  return (
    <div style={{
      textAlign: 'center', border: `1px solid ${K.line}`,
      borderRadius: 18, padding: '22px 14px 16px',
      background: '#fff', cursor: 'pointer',
      transition: 'transform .15s, box-shadow .15s, border-color .15s',
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(-4px)'
      el.style.boxShadow = '0 14px 32px rgba(20,32,29,.12)'
      el.style.borderColor = 'transparent'
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = ''
      el.style.boxShadow = ''
      el.style.borderColor = K.line
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px',
        backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center',
        boxShadow: '0 6px 16px rgba(0,0,0,.14)',
      }} />
      <h4 style={{ fontFamily: K.serif, fontWeight: 600, fontSize: '1rem', margin: '0 0 3px', color: K.ink }}>
        {tienda.nombre}
      </h4>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        {tienda.categoria && (
          <div style={{ fontSize: '.7rem', color: K.tealDeep, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px' }}>
            {tienda.categoria}
          </div>
        )}
        <PriceRange value={tienda.precio_rango} />
      </div>
      <Stars rating={tienda.rating_google} />
      <ActionButtons tienda={tienda} compact />
    </div>
  )
}

export function BusinessCardList({ tienda }: { tienda: TiendaData }) {
  const bg = tienda.foto_url
    ? `url('${tienda.foto_url}')`
    : `linear-gradient(135deg, ${K.teal}, ${K.tealDeep})`

  return (
    <div style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: `1px solid ${K.line}`, alignItems: 'flex-start' }}>
      <div style={{
        width: 68, height: 68, borderRadius: 12, flexShrink: 0,
        backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontFamily: K.serif, fontWeight: 600, fontSize: '1rem', margin: '0 0 2px', color: K.ink }}>
          {tienda.nombre}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {tienda.categoria && (
            <div style={{ fontSize: '.68rem', color: K.tealDeep, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {tienda.categoria}
            </div>
          )}
          <PriceRange value={tienda.precio_rango} />
        </div>
        {tienda.direccion && (
          <div style={{ fontSize: '.76rem', color: K.muted, marginTop: 3 }}>{tienda.direccion}</div>
        )}
        <Stars rating={tienda.rating_google} />
        <ActionButtons tienda={tienda} />
      </div>
    </div>
  )
}
