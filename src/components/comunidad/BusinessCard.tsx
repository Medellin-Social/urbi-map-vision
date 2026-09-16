export type { TiendaData } from '@/hooks/useTiendas'
import type { TiendaData } from '@/hooks/useTiendas'
import { CATEGORIA_LABELS, CATEGORIA_COLORS, CATEGORIA_EMOJI } from '@/lib/categorias_comunidad'
import { safeHref } from '@/lib/utils'

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
  const mapsUrl = tienda.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${tienda.google_place_id}`
    : tienda.lat && tienda.lon
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tienda.nombre + ' ' + (tienda.barrio_nombre ?? 'Medellín'))}`
      : null
  const webHref = safeHref(tienda.website)

  if (!wa && !mapsUrl && !webHref) return null

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
      {webHref && (
        <a href={webHref} target="_blank" rel="noopener noreferrer"
          style={{ ...btnBase, background: K.coralLight, color: K.coral }}>
          🌐 Web
        </a>
      )}
    </div>
  )
}

export function BusinessCardDirectory({ tienda }: { tienda: TiendaData }) {
  const catLabel = tienda.categoria ? (CATEGORIA_LABELS[tienda.categoria] ?? tienda.categoria) : null
  const catColor = tienda.categoria ? (CATEGORIA_COLORS[tienda.categoria] ?? '#f5f0e8') : '#f5f0e8'
  const catEmoji = tienda.categoria ? (CATEGORIA_EMOJI[tienda.categoria] ?? '⭐') : '⭐'

  const wa = tienda.whatsapp
    ? `https://wa.me/${tienda.whatsapp.replace(/\D/g, '')}`
    : tienda.telefono ? `https://wa.me/57${tienda.telefono.replace(/\D/g, '')}` : null
  const mapsUrl = tienda.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${tienda.google_place_id}`
    : (tienda.lat && tienda.lon)
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tienda.nombre + ' ' + (tienda.barrio_nombre ?? 'Medellín'))}`
      : null

  const primaryBtn = wa || mapsUrl
  const secondaryBtn = wa ? mapsUrl : null

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e9e4d8',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '0 2px 8px rgba(20,32,29,.06)',
    }}>
      {/* Foto */}
      <div style={{
        height: 120, flexShrink: 0, position: 'relative',
        background: catColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {tienda.foto_url ? (
          <img
            src={tienda.foto_url} alt={tienda.nombre}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span style={{ fontSize: 36 }}>{catEmoji}</span>
        )}
        {catLabel && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: '#ffc928', color: '#14201d',
            fontWeight: 800, fontSize: 10, padding: '3px 7px',
            borderRadius: 4, letterSpacing: '0.4px', whiteSpace: 'nowrap',
            maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            ★ {catLabel}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
        {/* Barrio */}
        {tienda.barrio_nombre && (
          <p style={{
            fontSize: 10, color: '#62736d', margin: 0,
            textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tienda.barrio_nombre}
          </p>
        )}

        {/* Nombre */}
        <p style={{
          fontWeight: 700, fontSize: 14, color: '#14201d',
          margin: 0, lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {tienda.nombre}
        </p>

        {/* Rating + precio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          {tienda.rating_google ? (
            <>
              <span style={{ color: '#ffc928', fontSize: 12, letterSpacing: 1 }}>
                {'★'.repeat(Math.min(Math.round(tienda.rating_google), 5))}
              </span>
              <span style={{ fontSize: 11, color: '#62736d', fontWeight: 600 }}>
                {tienda.rating_google.toFixed(1)}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: '#9B8B75' }}>Sin calificación</span>
          )}
        </div>

        {/* Dirección */}
        {tienda.direccion && (
          <p style={{
            fontSize: 11, color: '#9B8B75', margin: 0, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tienda.direccion}
          </p>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Botones */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {primaryBtn && (
            <a href={primaryBtn} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, textAlign: 'center', padding: '7px 0',
              background: wa ? '#25D366' : '#4285F4',
              borderRadius: 7, fontSize: 11, color: '#fff',
              textDecoration: 'none', fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {wa ? '💬 WhatsApp' : '📍 Maps'}
            </a>
          )}
          {secondaryBtn && (
            <a href={secondaryBtn} target="_blank" rel="noopener noreferrer" style={{
              flex: '0 0 auto', padding: '7px 10px',
              background: '#f5f0e8', border: '1px solid #e9e4d8',
              borderRadius: 7, fontSize: 11, color: '#14201d',
              textDecoration: 'none', fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              📍
            </a>
          )}
          {!primaryBtn && !secondaryBtn && safeHref(tienda.website) && (
            <a href={safeHref(tienda.website)} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, textAlign: 'center', padding: '7px 0',
              background: '#f5f0e8', border: '1px solid #e9e4d8',
              borderRadius: 7, fontSize: 11, color: '#14201d',
              textDecoration: 'none', fontWeight: 600,
            }}>
              🌐 Web
            </a>
          )}
        </div>
      </div>
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
              {CATEGORIA_LABELS[tienda.categoria] ?? tienda.categoria}
            </div>
          )}
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
