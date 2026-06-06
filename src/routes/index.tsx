import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { LandingMapHeader } from '@/components/LandingMapHeader'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { useBarrio } from '@/components/comunidad/BarrioContext'
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
  paper: '#fbf9f3', surface: '#f5f0e8', line: '#e9e4d8',
  ink: '#14201d', muted: '#62736d',
  teal: '#1D9E75', tealDeep: '#085041',
  coral: '#D85A30', coralLight: '#FAECE7',
  amarillo: '#ffc928', rojo: '#e63148',
  serif: "'Fraunces', Georgia, serif" as const,
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

function SecTitle({ children, link, linkLabel }: { children: string; link?: string; linkLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
      <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.7rem', whiteSpace: 'nowrap', letterSpacing: '-.5px', color: K.ink, margin: 0 }}>
        {children}
      </h2>
      <div style={{ height: 2, background: K.ink, flex: 1, opacity: .1, transform: 'translateY(-5px)' }} />
      {link && (
        <a href={link} style={{ fontSize: '.76rem', fontWeight: 800, textTransform: 'uppercase', color: K.tealDeep, whiteSpace: 'nowrap', letterSpacing: '.5px', textDecoration: 'none' }}>
          {linkLabel ?? 'Ver todo →'}
        </a>
      )}
    </div>
  )
}

function HomeContent() {
  const { barrio, lang } = useBarrio()
  const t = (es: string, en: string) => lang === 'es' ? es : en

  const [nombre, setNombre] = useState('')
  const [email,  setEmail]  = useState('')
  const [suscrito, setSuscrito] = useState(false)

  const mapFlyToRef = useRef<((lat: number, lon: number, zoom?: number) => void) | null>(null)
  const didMountRef = useRef(false)

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (!barrio.lat || !barrio.lon) return
    mapFlyToRef.current?.(barrio.lat, barrio.lon, barrio.zoom)
  }, [barrio.slug])

  const isTodos  = barrio.slug === 'todos'
  const noBarrio = !barrio.barrio_id && !isTodos

  const barrioFilter = isTodos ? null : (barrio.barrio_id ?? null)

  const { data: noticias   = [] }                          = useNoticias(4)
  const { data: deals      = [], isLoading: dealsLoading }  = useDeals(1, barrioFilter)
  const { data: directorio = [], isLoading: dirLoading }    = useDirectorio(1, barrioFilter)

  return (
    <>
      {/* ── HERO ──────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <LandingMapHeader flyToRef={mapFlyToRef} hideOverlay />
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
      <section style={{ padding: '48px 26px 36px', borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SecTitle link="/blog" linkLabel={t('Todas las noticias →', 'All news →')}>
            {t('Lo último del barrio', 'Latest from the Barrio')}
          </SecTitle>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {noticias.length === 0 ? (
              <p style={{ color: K.muted, gridColumn: '1/-1' }}>
                {t('Cargando noticias...', 'Loading news...')}
              </p>
            ) : noticias.map((n, i) => (
              <a key={n.id ?? i} href={n.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'block', padding: 16,
                background: K.surface,
                borderRadius: 10, border: `0.5px solid ${K.line}`,
                textDecoration: 'none',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: K.coral,
                  marginBottom: 8, display: 'block',
                }}>
                  {n.fuente === 'el_colombiano' ? 'El Colombiano' : (n.fuente ?? 'Medellín')}
                </span>
                <h3 style={{
                  fontFamily: K.serif, fontSize: 16, fontWeight: 600,
                  color: K.ink, lineHeight: 1.3, marginBottom: 8, margin: '0 0 8px',
                }}>
                  {n.titulo}
                </h3>
                {n.fecha_publicacion && (
                  <span style={{ fontSize: 11, color: K.muted }}>
                    {new Date(n.fecha_publicacion).toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 2 — HOTSPOTS & DEALS ─────────────── */}
      <section style={{ padding: '48px 26px 36px', background: K.surface, borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SecTitle link={`/local-business/${barrio.slug}`} linkLabel={t('Ver todos →', 'See all →')}>
            {t('Hotspots & Deals exclusivos', 'Hotspots & Exclusive Deals')}
          </SecTitle>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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
                border: `0.5px solid ${K.line}`,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
              }}>
                {/* Badge deal */}
                <div style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 1,
                  background: K.coral, color: '#fff',
                  fontWeight: 900, fontSize: 14,
                  padding: '4px 10px', borderRadius: 6,
                }}>
                  {deal.tipo_deal}
                </div>

                {/* Foto */}
                <div style={{
                  height: 120, background: K.line,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, overflow: 'hidden',
                }}>
                  {deal.foto_url
                    ? <img src={deal.foto_url} alt={deal.tienda_nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>{deal.categoria === 'bares' ? '🍸' : deal.categoria === 'masajes_spa' ? '💆' : deal.categoria === 'brunch' ? '🥞' : '🍽️'}</span>
                  }
                </div>

                <div style={{ padding: 12 }}>
                  <p style={{ fontSize: 11, color: K.muted, marginBottom: 4, margin: '0 0 4px' }}>
                    {CATEGORIA_LABELS[deal.categoria ?? ''] ?? deal.categoria}
                    {deal.barrio_nombre ? ` · ${deal.barrio_nombre}` : ''}
                  </p>
                  <p style={{ fontWeight: 600, fontSize: 14, color: K.ink, margin: '0 0 4px' }}>
                    {deal.descripcion}
                  </p>
                  <p style={{ fontSize: 12, color: K.muted, margin: 0 }}>
                    {deal.tienda_nombre}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 3 — DIRECTORIO 5 ESTRELLAS ───────── */}
      <section style={{ padding: '48px 26px', borderBottom: `1px solid ${K.line}` }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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
                background: K.surface,
                border: `0.5px solid ${K.line}`,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
              }}>
                {/* Badge categoría */}
                <div style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 1,
                  background: K.amarillo, color: K.ink,
                  fontWeight: 900, fontSize: 11,
                  padding: '3px 8px', borderRadius: 4,
                  letterSpacing: '0.5px',
                }}>
                  ★ {CATEGORIA_LABELS[negocio.categoria] ?? negocio.categoria}
                </div>

                {/* Foto o placeholder */}
                <div style={{
                  height: 130, overflow: 'hidden',
                  background: CATEGORIA_COLORS[negocio.categoria] ?? K.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {negocio.foto_url ? (
                    <img
                      src={negocio.foto_url}
                      alt={negocio.nombre}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <span style={{ fontSize: 40 }}>
                      {CATEGORIA_EMOJI[negocio.categoria] ?? '⭐'}
                    </span>
                  )}
                </div>

                <div style={{ padding: '12px 14px' }}>
                  {negocio.barrio_nombre && (
                    <p style={{ fontSize: 11, color: K.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {negocio.barrio_nombre}
                    </p>
                  )}

                  <p style={{ fontWeight: 600, fontSize: 15, color: K.ink, margin: '0 0 6px', lineHeight: 1.2 }}>
                    {negocio.nombre}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <span style={{ color: '#ffc928' }}>★★★★★</span>
                    <span style={{ fontSize: 13, color: K.muted }}>{negocio.rating_google?.toFixed(1)}</span>
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
                          flex: 1, textAlign: 'center', padding: '6px 0',
                          background: K.paper, border: `0.5px solid ${K.line}`,
                          borderRadius: 6, fontSize: 12, color: K.ink,
                          textDecoration: 'none', fontWeight: 500,
                        }}
                      >
                        📍 Ver en Maps
                      </a>
                    )}
                    {negocio.whatsapp && (
                      <a
                        href={`https://wa.me/${negocio.whatsapp.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          flex: 1, textAlign: 'center', padding: '6px 0',
                          background: '#25D366', borderRadius: 6,
                          fontSize: 12, color: '#fff',
                          textDecoration: 'none', fontWeight: 500,
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
      <section style={{ padding: '48px 26px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', background: '#fff', border: `1px solid ${K.line}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 14px 38px rgba(20,32,29,.1)' }}>
            <div style={{ minHeight: 320, backgroundImage: `url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80'), radial-gradient(120% 120% at 80% 10%, #2a5bdc 0%, #143cc4 45%, #0a8a4f 100%)`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ padding: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ display: 'inline-block', background: K.amarillo, color: K.ink, fontWeight: 800, fontSize: '.68rem', letterSpacing: '1.6px', textTransform: 'uppercase', padding: '6px 13px', borderRadius: 6, alignSelf: 'flex-start', marginBottom: 14 }}>
                {t('Inversión Inmobiliaria', 'Real Estate Investment')}
              </span>
              <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.9rem', margin: '0 0 12px', letterSpacing: '-.5px', color: K.ink }}>
                {t('Invierte en Medellín con datos reales.', 'Invest in Medellín with real data.')}
              </h2>
              <p style={{ color: K.muted, marginBottom: 24, lineHeight: 1.55, fontSize: '1.02rem' }}>
                {t(
                  'Yields, precios justos y oportunidades por barrio. El primer motor de decisión inmobiliaria del Valle de Aburrá.',
                  'Yields, fair prices and opportunities by neighborhood. The first real estate decision engine in the Aburrá Valley.',
                )}
              </p>
              <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginBottom: 26 }}>
                <div>
                  <small style={{ fontSize: '.78rem', color: K.muted, textTransform: 'uppercase', letterSpacing: '.5px', display: 'block' }}>{t('Arriendos desde', 'Rentals from')}</small>
                  <strong style={{ fontFamily: K.serif, fontSize: '1.5rem', color: '#143cc4', display: 'block', marginTop: 3 }}>$1.400/mes</strong>
                </div>
                <div>
                  <small style={{ fontSize: '.78rem', color: K.muted, textTransform: 'uppercase', letterSpacing: '.5px', display: 'block' }}>{t('Yield promedio', 'Avg. yield')}</small>
                  <strong style={{ fontFamily: K.serif, fontSize: '1.5rem', color: '#143cc4', display: 'block', marginTop: 3 }}>7.2% EA</strong>
                </div>
              </div>
              <a href="/map" style={{ display: 'inline-block', background: K.ink, color: '#fff', fontWeight: 800, padding: '13px 26px', borderRadius: 999, textDecoration: 'none', fontSize: '.96rem', alignSelf: 'flex-start' }}>
                {t('Ver el mapa de inversión', 'Explore investment map')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUSCRIPCIÓN ───────────────────────────────── */}
      <section id="subscribe" style={{ padding: '0 26px 60px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', background: 'linear-gradient(120deg, rgba(214,33,126,.92), rgba(255,122,26,.86) 55%, rgba(255,201,40,.82))', borderRadius: 22, padding: '56px 34px', textAlign: 'center', color: '#fff', boxShadow: '0 22px 60px rgba(214,33,126,.3)' }}>
          <span style={{ fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', fontSize: '.76rem', background: 'rgba(0,0,0,.26)', display: 'inline-block', padding: '7px 16px', borderRadius: 999, marginBottom: 18 }}>
            🎉 {t('Miembros Fundadores · Invitación a la Fiesta', 'Founding Members · Launch Party Invite')}
          </span>
          <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.9rem,4.5vw,2.9rem)', margin: '0 0 14px', letterSpacing: '-.5px' }}>
            {t('Sé Parte del Comienzo', 'Be Part of the Beginning')}
          </h2>
          <p style={{ maxWidth: 620, margin: '0 auto 28px', fontSize: '1.08rem', lineHeight: 1.55 }}>
            {t(
              'Medellín Social llega barrio por barrio. Suscríbete gratis y recibe lo mejor de tu barrio antes que nadie.',
              'Medellín Social rolls out barrio by barrio. Subscribe free and get the best of your barrio first.',
            )}
          </p>
          {suscrito ? (
            <p style={{ fontWeight: 800, fontSize: '1.18rem' }}>
              🎉 {t('¡Estás en la lista fundadora!', "You're on the founding list!")}
            </p>
          ) : (
            <form onSubmit={e => { e.preventDefault(); setSuscrito(true) }} style={{ display: 'flex', gap: 11, maxWidth: 580, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
              <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder={t('Tu nombre', 'Your name')} style={{ flex: 1, minWidth: 180, padding: '14px 18px', border: 'none', borderRadius: 11, fontSize: '1rem', fontFamily: 'inherit' }} />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('Tu correo', 'Your email')} style={{ flex: 1, minWidth: 200, padding: '14px 18px', border: 'none', borderRadius: 11, fontSize: '1rem', fontFamily: 'inherit' }} />
              <button type="submit" style={{ background: K.ink, color: '#fff', border: 'none', fontWeight: 800, padding: '14px 26px', borderRadius: 999, cursor: 'pointer', fontSize: '.96rem', fontFamily: 'inherit' }}>
                {t('Quiero mi Invitación 🎟️', 'Get My Invite 🎟️')}
              </button>
            </form>
          )}
          <p style={{ fontSize: '.82rem', opacity: .92, marginTop: 16 }}>
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
