import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useRef } from 'react'
import { MapView } from '@/components/MapView'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { useBarrio, BARRIOS } from '@/components/comunidad/BarrioContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDeals } from '@/hooks/useDeals'
import { useDirectorio } from '@/hooks/useDirectorio'
import { useNoticias } from '@/hooks/useNoticias'

export const Route = createFileRoute('/')({
  component: HomePage,
  head: () => ({
    meta: [
      { title: 'Medellín Social · Tu Ciudad. Tu Barrio. Tu Historia.' },
      { name: 'description', content: 'Eventos, negocios y cultura local en Medellín y el Valle de Aburrá.' },
    ],
  }),
})

const K = {
  paper: '#FAF8F5', surface: '#F2ECE2', line: '#e9e4d8',
  ink: '#14201d', muted: '#62736d',
  teal: '#1D9E75', tealDeep: '#085041',
  coral: '#D85A30', coralLight: '#FAECE7',
  amarillo: '#ffc928', rojo: '#e63148',
  serif: "'Fraunces', Georgia, serif" as const,
  lora: "'Lora', Georgia, serif" as const,
  manrope: "'Manrope', system-ui, sans-serif" as const,
}

const CATEGORIA_LABELS: Record<string, string> = {
  brunch: 'Brunch',
  cena: 'Restaurante',
  gimnasios: 'Gimnasio',
  masajes_spa: 'Spa & Wellness',
  medicos: 'Salud',
  cafes: 'Café',
  bares: 'Bar',
  yoga: 'Yoga',
  dentistas: 'Dental',
  peluquerias: 'Estética',
  almuerzo: 'Almuerzo',
  estetica: 'Estética',
  panaderia: 'Panadería',
}

const CATEGORIA_LABELS_EN: Record<string, string> = {
  brunch: 'Brunch',
  cena: 'Restaurant',
  gimnasios: 'Gym',
  masajes_spa: 'Spa & Wellness',
  medicos: 'Health',
  cafes: 'Café',
  bares: 'Bar',
  yoga: 'Yoga',
  dentistas: 'Dental',
  peluquerias: 'Beauty',
  almuerzo: 'Lunch',
  estetica: 'Beauty',
  panaderia: 'Bakery',
}

const CATEGORIA_COLORS: Record<string, string> = {
  bares: '#14201d',
  brunch: '#f5f0e8',
  cafes: '#c8a96e',
  cena: '#2d1b0e',
  gimnasios: '#1D9E75',
  masajes_spa: '#d4a5c9',
  medicos: '#e8f4f8',
  dentistas: '#e8f4f8',
  peluquerias: '#fce4ec',
  yoga: '#e8f5e9',
}

const CATEGORIA_EMOJI: Record<string, string> = {
  bares: '🍺',
  brunch: '☕',
  cafes: '☕',
  cena: '🍽️',
  gimnasios: '💪',
  masajes_spa: '🧖',
  medicos: '🏥',
  dentistas: '🦷',
  peluquerias: '✂️',
  yoga: '🧘',
}

type MapPhase = 'chooser' | 'barrios' | 'barrio_action'

function toSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function barrioSlug(id: number, nombre: string): string {
  const found = BARRIOS.find((b) => b.barrio_id === id)
  return found?.slug ?? toSlug(nombre)
}

type PickedBarrio = { id: number; nombre: string; slug: string; lat: number; lng: number }

function HeroOverlay({ phase, barrio, onChoose, onClose }: {
  phase: MapPhase
  barrio: PickedBarrio | null
  onChoose: (choice: 'barrios' | 'comunidad') => void
  onClose: () => void
}) {
  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 20px', borderRadius: 999, border: 'none',
    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'opacity .15s',
  }

  if (phase === 'chooser') {
    return (
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 10, zIndex: 10,
      }}>
        <button style={{ ...btnBase, background: K.teal, color: '#fff' }}
          onClick={() => onChoose('barrios')}>
          🗺 Ver barrios
        </button>
        <button style={{ ...btnBase, background: K.ink, color: '#fff' }}
          onClick={() => onChoose('comunidad')}>
          🎉 Ver comunidad
        </button>
      </div>
    )
  }

  if (phase === 'barrios') {
    return (
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(20,32,29,.82)', backdropFilter: 'blur(6px)',
        color: '#fff', borderRadius: 12, padding: '10px 18px',
        fontSize: 13, fontWeight: 600, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span>Selecciona un barrio en el mapa</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>
    )
  }

  if (phase === 'barrio_action' && barrio) {
    return (
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: K.paper, borderRadius: 16, padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(20,32,29,.18)', zIndex: 10, minWidth: 280,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: K.ink }}>{barrio.nombre}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: K.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/eventos/${barrio.slug}`} style={{ ...btnBase, background: K.coral, color: '#fff', textDecoration: 'none' }}>
            📅 Ver eventos
          </a>
          <a href={`/local-business/${barrio.slug}`} style={{ ...btnBase, background: K.teal, color: '#fff', textDecoration: 'none' }}>
            🏪 Ver negocios
          </a>
          <a href={`/map?lat=${barrio.lat.toFixed(5)}&lng=${barrio.lng.toFixed(5)}&zoom=14`} style={{ ...btnBase, background: K.ink, color: '#fff', textDecoration: 'none' }}>
            🏠 Ver listings
          </a>
        </div>
      </div>
    )
  }

  return null
}

function SecTitle({ children, link, linkLabel }: { children: string; link?: string; linkLabel?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', rowGap: 6 }}>
        <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.25rem, 4.5vw, 1.7rem)', letterSpacing: '-.5px', color: K.ink, margin: 0, flexShrink: 0 }}>
          {children}
        </h2>
        <div style={{ height: 2, background: K.ink, flex: '1 1 20px', minWidth: 20, opacity: .1, alignSelf: 'center' }} />
        {link && (
          <a href={link} style={{ fontSize: '.76rem', fontWeight: 800, textTransform: 'uppercase', color: K.tealDeep, whiteSpace: 'nowrap', letterSpacing: '.5px', textDecoration: 'none', flexShrink: 0 }}>
            {linkLabel ?? 'Ver todo →'}
          </a>
        )}
      </div>
    </div>
  )
}

function HomeContent() {
  const { barrio, lang } = useBarrio()
  const isMobile = useIsMobile()
  const t = (es: string, en: string) => lang === 'es' ? es : en
  const catLabel = (cat: string) => (lang === 'es' ? CATEGORIA_LABELS : CATEGORIA_LABELS_EN)[cat] ?? cat

  const [nombre, setNombre] = useState('')
  const [email,  setEmail]  = useState('')
  const [suscrito, setSuscrito] = useState(false)

  const [mapPhase, setMapPhase] = useState<MapPhase | null>(null)
  const [pickedBarrio, setPickedBarrio] = useState<PickedBarrio | null>(null)
  const flyToBarriosRef = useRef<(() => void) | null>(null)

  const handleMapClick = useCallback(() => {
    if (mapPhase === null) setMapPhase('chooser')
  }, [mapPhase])

  const handleChoose = useCallback((choice: 'barrios' | 'comunidad') => {
    if (choice === 'comunidad') {
      window.location.href = '/eventos/el-poblado'
      return
    }
    setMapPhase('barrios')
    flyToBarriosRef.current?.()
  }, [])

  const handleBarrioClick = useCallback((id: number, nombre: string, lat: number, lng: number) => {
    if (mapPhase !== 'barrios') return
    setPickedBarrio({ id, nombre: nombre.replace(/_/g, ' '), slug: barrioSlug(id, nombre), lat, lng })
    setMapPhase('barrio_action')
  }, [mapPhase])

  const handleOverlayClose = useCallback(() => {
    setMapPhase(null)
    setPickedBarrio(null)
  }, [])

  const isTodos  = barrio.slug === 'todos'
  const noBarrio = !barrio.barrio_id && !isTodos

  const barrioFilter = isTodos ? null : (barrio.barrio_id ?? null)

  const { data: noticias   = [] }                          = useNoticias(4)
  const { data: deals      = [], isLoading: dealsLoading }  = useDeals(1, barrioFilter)
  const { data: directorio = [], isLoading: dirLoading }    = useDirectorio(1, barrioFilter)

  return (
    <>
      {/* ── HERO — mapa /map (comunas → barrios, sin listings) ─────────── */}
      <section
        style={{ position: 'relative', overflow: 'hidden', height: isMobile ? '50vh' : '72vh', minHeight: isMobile ? 320 : 420, cursor: mapPhase === null ? 'pointer' : 'default' }}
        onClick={mapPhase === null ? handleMapClick : undefined}
      >
        <MapView
          mapView="zonas"
          selectedId={null}
          onSelect={() => {}}
          onBarrioClick={mapPhase === 'barrios' ? handleBarrioClick : undefined}
          flyToBarriosRef={flyToBarriosRef}
          cooperativeGestures={isMobile}
        />
        {mapPhase !== null && (
          <HeroOverlay
            phase={mapPhase}
            barrio={pickedBarrio}
            onChoose={handleChoose}
            onClose={handleOverlayClose}
          />
        )}
      </section>

      {/* ── NO BARRIO ─────────────────────────────────── */}
      {noBarrio && (
        <div style={{ maxWidth: 1200, margin: '48px auto', padding: '0 26px', textAlign: 'center' }}>
          <p style={{ fontFamily: K.serif, fontSize: '1.4rem', color: K.muted }}>
            {t(`Próximamente en ${barrio.nombre}.`, `Coming soon to ${barrio.nombre}.`)}
          </p>
        </div>
      )}

      {/* ── SECCIÓN 1 — LO ÚLTIMO DEL BARRIO ─────────── */}
      <section className="section-padding" style={{ padding: isMobile ? '28px 16px 20px' : '72px 26px 56px', borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SecTitle link="/blog" linkLabel={t('Todas las noticias →', 'All news →')}>
            {t('Lo último del barrio', 'Latest from the Barrio')}
          </SecTitle>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: isMobile ? 10 : 16 }} className="noticias-grid">
            {noticias.length === 0 ? (
              <p style={{ color: K.muted, gridColumn: '1/-1' }}>
                {t('Cargando noticias...', 'Loading news...')}
              </p>
            ) : (isMobile ? noticias.slice(0, 2) : noticias).map((n, i) => (
              <a key={n.id ?? i} href={n.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'block', padding: isMobile ? '12px 12px 10px' : '18px 18px 16px',
                background: K.paper,
                borderRadius: isMobile ? 10 : 14,
                boxShadow: '0 1px 6px rgba(20,32,29,.07), 0 4px 18px rgba(20,32,29,.04)',
                textDecoration: 'none',
              }}>
                <span style={{
                  display: 'inline-block',
                  fontFamily: K.manrope,
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: K.coral,
                  background: K.coralLight,
                  padding: '2px 7px', borderRadius: 999,
                  marginBottom: 7,
                }}>
                  {n.fuente === 'el_colombiano' ? 'El Colombiano' : (n.fuente ?? 'Medellín')}
                </span>
                <h3 style={{
                  fontFamily: K.serif, fontSize: isMobile ? 13 : 16, fontWeight: 600,
                  color: K.ink, lineHeight: 1.3, margin: '0 0 6px',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {n.titulo}
                </h3>
                {!isMobile && n.fecha_publicacion && (
                  <span style={{ fontFamily: K.manrope, fontSize: 11, color: K.muted, letterSpacing: '.2px' }}>
                    {new Date(n.fecha_publicacion).toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 2 — HOTSPOTS & DEALS ─────────────── */}
      <section className="section-padding" style={{ padding: '72px 26px 56px', background: K.surface, borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SecTitle link={`/local-business/${barrio.slug}`} linkLabel={t('Ver todos →', 'See all →')}>
            {t('Hotspots & Deals exclusivos', 'Hotspots & Exclusive Deals')}
          </SecTitle>

          <div className="deals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {dealsLoading ? (
              <p style={{ color: K.muted, gridColumn: '1/-1', fontSize: 14 }}>
                {t('Cargando deals...', 'Loading deals...')}
              </p>
            ) : deals.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', background: K.paper, borderRadius: 10, border: `0.5px solid ${K.line}` }}>
                <p style={{ color: K.muted, marginBottom: 8, margin: '0 0 8px' }}>
                  {t(`Aún no hay deals en ${barrio.nombre}.`, `No deals in ${barrio.nombre} yet.`)}
                </p>
                <a href="/negocios/unirse" style={{ color: K.coral, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                  {t('¿Tienes un negocio? Publícalo aquí →', 'Have a business? List it here →')}
                </a>
              </div>
            ) : deals.map((deal, i) => (
              <div key={deal.id ?? i} style={{
                background: K.paper,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(20,32,29,.08)',
              }}>
                {/* Foto con overlay */}
                <div style={{
                  height: 140, overflow: 'hidden', position: 'relative',
                  background: CATEGORIA_COLORS[deal.categoria ?? ''] ?? K.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 34, zIndex: 1 }}>
                    {deal.categoria === 'bares' ? '🍸' : deal.categoria === 'masajes_spa' ? '💆' : deal.categoria === 'brunch' ? '🥞' : '🍽️'}
                  </span>
                  {deal.foto_url && (
                    <img
                      src={deal.foto_url}
                      alt={deal.tienda_nombre}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  {/* gradient overlay */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'linear-gradient(to top, rgba(20,32,29,.72) 0%, rgba(20,32,29,.08) 55%, transparent 100%)' }} />
                  {/* pills over gradient */}
                  <div style={{ position: 'absolute', bottom: 9, left: 10, right: 10, zIndex: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <span style={{ fontFamily: K.manrope, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'rgba(255,255,255,.82)', background: 'rgba(255,255,255,.14)', padding: '3px 8px', borderRadius: 999 }}>
                      {catLabel(deal.categoria ?? '')}
                    </span>
                    <span style={{ fontFamily: K.manrope, fontSize: 10, fontWeight: 800, color: '#fff', background: K.coral, padding: '3px 9px', borderRadius: 999 }}>
                      {deal.tipo_deal}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '12px 14px 14px' }}>
                  <p style={{ fontFamily: K.manrope, fontSize: 11, color: K.muted, margin: '0 0 4px', letterSpacing: '.3px' }}>
                    {deal.barrio_nombre ?? ''}
                  </p>
                  <p style={{ fontFamily: K.manrope, fontWeight: 600, fontSize: 14, color: K.ink, margin: '0 0 3px' }}>
                    {deal.descripcion}
                  </p>
                  <p style={{ fontFamily: K.manrope, fontSize: 12, color: K.muted, margin: 0 }}>
                    {deal.tienda_nombre}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 3 — DIRECTORIO 5 ESTRELLAS ───────── */}
      <section className="section-padding" style={{ padding: '72px 26px', borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SecTitle link={`/local-business/${barrio.slug}`} linkLabel={t('Ver todo →', 'Browse all →')}>
            {t('Directorio 5 Estrellas', '5-Star Directory')}
          </SecTitle>
          <p style={{ color: K.muted, marginBottom: 22, maxWidth: 700, fontSize: '1rem', marginTop: 0 }}>
            {t(
              'Un nombre de confianza por categoría — los negocios que tus vecinos ya aman.',
              'One trusted name per category — the businesses your neighbors already love.',
            )}
          </p>

          <div className="directorio-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {dirLoading ? (
              <p style={{ color: K.muted, gridColumn: '1/-1', fontSize: 14 }}>
                {t('Cargando directorio...', 'Loading directory...')}
              </p>
            ) : directorio.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', background: K.paper, borderRadius: 10, border: `0.5px solid ${K.line}` }}>
                <p style={{ color: K.muted, marginBottom: 8, margin: '0 0 8px' }}>
                  {t(`Sin negocios destacados en ${barrio.nombre} aún.`, `No featured businesses in ${barrio.nombre} yet.`)}
                </p>
                <a href={`/local-business/${barrio.slug}`} style={{ color: K.coral, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                  {t('Explorar directorio completo →', 'Explore full directory →')}
                </a>
              </div>
            ) : directorio.slice(0, 4).map((negocio, i) => (
              <div key={negocio.id ?? i} style={{
                background: K.paper,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(20,32,29,.08)',
              }}>
                {/* Foto o placeholder */}
                <div style={{
                  height: 140, overflow: 'hidden',
                  background: CATEGORIA_COLORS[negocio.categoria] ?? K.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <span style={{ fontSize: 40, zIndex: 1 }}>
                    {CATEGORIA_EMOJI[negocio.categoria] ?? '⭐'}
                  </span>
                  {negocio.foto_url && (
                    <img
                      src={negocio.foto_url}
                      alt={negocio.nombre}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  {/* gradient overlay */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'linear-gradient(to top, rgba(20,32,29,.68) 0%, rgba(20,32,29,.06) 50%, transparent 100%)' }} />
                  {/* category pill */}
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 4 }}>
                    <span style={{ fontFamily: K.manrope, fontSize: 10, fontWeight: 800, color: K.ink, background: K.amarillo, padding: '3px 9px', borderRadius: 999, letterSpacing: '.4px' }}>
                      ★ {catLabel(negocio.categoria)}
                    </span>
                  </div>
                  {negocio.barrio_nombre && (
                    <div style={{ position: 'absolute', bottom: 9, left: 10, zIndex: 4 }}>
                      <span style={{ fontFamily: K.manrope, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.82)', background: 'rgba(255,255,255,.14)', padding: '3px 8px', borderRadius: 999, letterSpacing: '.3px' }}>
                        {negocio.barrio_nombre}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '12px 14px 14px' }}>
                  <p style={{ fontFamily: K.manrope, fontWeight: 700, fontSize: 15, color: K.ink, margin: '0 0 5px', lineHeight: 1.2 }}>
                    {negocio.nombre}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 11 }}>
                    <span style={{ color: '#ffc928', fontSize: 13 }}>★★★★★</span>
                    <span style={{ fontFamily: K.manrope, fontSize: 12, color: K.muted }}>{negocio.rating_google?.toFixed(1)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {(negocio.google_place_id || negocio.lat) && (
                      <a
                        href={negocio.google_place_id
                          ? `https://www.google.com/maps/place/?q=place_id:${negocio.google_place_id}`
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.nombre + ' ' + (negocio.barrio_nombre ?? 'Medellín'))}`
                        }
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          flex: 1, textAlign: 'center', padding: '7px 0',
                          background: K.surface,
                          borderRadius: 8, fontFamily: K.manrope, fontSize: 12, color: K.ink,
                          textDecoration: 'none', fontWeight: 600,
                        }}
                      >
                        📍 {t('Ver en Maps', 'View on Maps')}
                      </a>
                    )}
                    {negocio.whatsapp && (
                      <a
                        href={`https://wa.me/${negocio.whatsapp.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          flex: 1, textAlign: 'center', padding: '7px 0',
                          background: '#25D366', borderRadius: 8,
                          fontFamily: K.manrope, fontSize: 12, color: '#fff',
                          textDecoration: 'none', fontWeight: 600,
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REAL ESTATE ───────────────────────────────── */}
      <section className="section-padding" style={{ padding: '72px 26px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="real-estate-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', background: K.paper, borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(20,32,29,.12)' }}>
            <div style={{ minHeight: 340, backgroundImage: `url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80'), linear-gradient(145deg, #0D1F1A 0%, #1A2B22 100%)`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ padding: 'clamp(24px, 5vw, 48px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: K.paper }}>
              <span style={{ display: 'inline-block', fontFamily: K.manrope, background: K.coralLight, color: K.coral, fontWeight: 800, fontSize: '.68rem', letterSpacing: '1.4px', textTransform: 'uppercase', padding: '6px 13px', borderRadius: 999, alignSelf: 'flex-start', marginBottom: 16 }}>
                {t('Inversión Inmobiliaria', 'Real Estate Investment')}
              </span>
              <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.55rem,3.5vw,2rem)', margin: '0 0 10px', letterSpacing: '-.5px', color: K.ink }}>
                {t('Invierte en Medellín con datos reales.', 'Invest in Medellín with real data.')}
              </h2>
              <p style={{ fontFamily: K.manrope, color: K.muted, marginBottom: 28, lineHeight: 1.6, fontSize: '.98rem' }}>
                {t(
                  'Yields, precios justos y oportunidades por barrio. El primer motor de decisión inmobiliaria del Valle de Aburrá.',
                  'Yields, fair prices and opportunities by neighborhood. The first real estate decision engine in the Aburrá Valley.',
                )}
              </p>

              {/* Financial metrics — Stripe-style */}
              <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderTop: `1.5px solid ${K.line}`, borderBottom: `1.5px solid ${K.line}`, padding: '20px 0' }}>
                <div style={{ flex: 1, paddingRight: 22, borderRight: `1.5px solid ${K.line}` }}>
                  <div style={{ fontFamily: K.manrope, fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: K.muted, marginBottom: 8 }}>
                    {t('Arriendos desde', 'Rentals from')}
                  </div>
                  <div style={{ fontFamily: K.serif, fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', fontWeight: 900, color: K.tealDeep, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    $1.400<span style={{ fontSize: '1rem', fontWeight: 500, color: K.muted, letterSpacing: 0 }}>/mes</span>
                  </div>
                </div>
                <div style={{ flex: 1, paddingLeft: 22 }}>
                  <div style={{ fontFamily: K.manrope, fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: K.muted, marginBottom: 8 }}>
                    {t('Yield promedio', 'Avg. yield')}
                  </div>
                  <div style={{ fontFamily: K.serif, fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', fontWeight: 900, color: K.coral, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    7.2%<span style={{ fontSize: '1rem', fontWeight: 500, color: K.muted, letterSpacing: 0 }}> EA</span>
                  </div>
                </div>
              </div>

              <a href="/map" style={{ fontFamily: K.manrope, display: 'inline-block', background: K.ink, color: '#fff', fontWeight: 800, padding: '13px 26px', borderRadius: 999, textDecoration: 'none', fontSize: '.92rem', alignSelf: 'flex-start', letterSpacing: '.2px' }}>
                {t('Ver el mapa de inversión', 'Explore investment map')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUSCRIPCIÓN ───────────────────────────────── */}
      <section id="subscribe" className="section-padding" style={{ padding: '0 16px 72px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', background: 'linear-gradient(145deg, #1A2B24 0%, #14201d 55%, #2A1A10 100%)', borderRadius: 22, padding: 'clamp(32px, 5vw, 60px) clamp(20px, 5vw, 52px)', textAlign: 'center', color: '#fff', boxShadow: '0 16px 48px rgba(20,32,29,.28)' }}>
          <span style={{ fontFamily: K.manrope, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', fontSize: '.72rem', background: 'rgba(216,90,48,.22)', border: '1px solid rgba(216,90,48,.4)', color: K.coral, display: 'inline-block', padding: '7px 18px', borderRadius: 999, marginBottom: 20 }}>
            🎉 {t('Miembros Fundadores · Invitación a la Fiesta', 'Founding Members · Launch Party Invite')}
          </span>
          <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.9rem,4.5vw,2.9rem)', margin: '0 0 14px', letterSpacing: '-.5px' }}>
            {t('Sé Parte del Comienzo', 'Be Part of the Beginning')}
          </h2>
          <p style={{ fontFamily: K.manrope, maxWidth: 600, margin: '0 auto 30px', fontSize: '1.02rem', lineHeight: 1.6, color: 'rgba(255,255,255,.76)' }}>
            {t(
              'Medellín Social llega barrio por barrio. Suscríbete gratis y recibe lo mejor de tu barrio antes que nadie.',
              'Medellín Social rolls out barrio by barrio. Subscribe free and get the best of your barrio first.',
            )}
          </p>
          {suscrito ? (
            <p style={{ fontFamily: K.manrope, fontWeight: 800, fontSize: '1.18rem', color: K.teal }}>
              🎉 {t('¡Estás en la lista fundadora!', "You're on the founding list!")}
            </p>
          ) : (
            <form onSubmit={e => { e.preventDefault(); setSuscrito(true) }} style={{ display: 'flex', gap: 10, maxWidth: 560, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
              <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder={t('Tu nombre', 'Your name')} style={{ flex: '1 1 160px', padding: '14px 18px', border: '1px solid rgba(255,255,255,.12)', borderRadius: 11, fontSize: '.96rem', fontFamily: K.manrope, background: 'rgba(255,255,255,.07)', color: '#fff', outline: 'none' }} />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('Tu correo', 'Your email')} style={{ flex: '1 1 180px', padding: '14px 18px', border: '1px solid rgba(255,255,255,.12)', borderRadius: 11, fontSize: '.96rem', fontFamily: K.manrope, background: 'rgba(255,255,255,.07)', color: '#fff', outline: 'none' }} />
              <button type="submit" style={{ width: '100%', background: K.coral, color: '#fff', border: 'none', fontFamily: K.manrope, fontWeight: 800, padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontSize: '.94rem', letterSpacing: '.3px' }}>
                {t('Quiero mi Invitación 🎟️', 'Get My Invite 🎟️')}
              </button>
            </form>
          )}
          <p style={{ fontFamily: K.manrope, fontSize: '.8rem', opacity: .55, marginTop: 18 }}>
            {t('Gratis para siempre. Sin spam.', 'Free forever. No spam.')}
          </p>
        </div>
      </section>
    </>
  )
}

function HomePage() {
  return (
    <ComunidadLayout initialSlug="todos">
      <HomeContent />
    </ComunidadLayout>
  )
}
