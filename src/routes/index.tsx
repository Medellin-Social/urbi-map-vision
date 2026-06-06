import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { LandingMapHeader } from '@/components/LandingMapHeader'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { useBarrio } from '@/components/comunidad/BarrioContext'
import { EventCardFeatured, EventCardMini, type EventoData } from '@/components/comunidad/EventCard'
import { BusinessCardDirectory, type TiendaData } from '@/components/comunidad/BusinessCard'
import { API_BASE_URL } from '@/config/api'

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

interface EventosResp { total: number; eventos: EventoData[] }
interface TiendasResp { total: number; tiendas: TiendaData[] }

const PILLS_TIEMPO = [
  { id: 'all',    es: 'Todos',       en: 'All' },
  { id: 'hoy',   es: 'Hoy',         en: 'Today' },
  { id: 'finde', es: 'Este finde',  en: 'Weekend' },
  { id: 'semana',es: 'Esta semana', en: 'This week' },
]
const PILLS_CAT = [
  { id: 'all',        es: 'Todos',      en: 'All' },
  { id: 'networking', es: 'Networking', en: 'Networking' },
  { id: 'musica',     es: 'Música',     en: 'Music' },
  { id: 'bienestar',  es: 'Bienestar',  en: 'Wellness' },
  { id: 'gratis',     es: 'Gratis',     en: 'Free' },
]

function filterEvt(eventos: EventoData[], tiempo: string, cat: string) {
  const now = new Date()
  return eventos.filter(e => {
    const d = new Date(e.fecha_inicio + 'T00:00:00')
    if (tiempo === 'hoy'   && d.toDateString() !== now.toDateString()) return false
    if (tiempo === 'finde' && d.getDay() !== 0 && d.getDay() !== 6)   return false
    if (tiempo === 'semana') {
      const n7 = new Date(now); n7.setDate(now.getDate() + 7)
      if (d < now || d > n7) return false
    }
    if (cat === 'gratis' && !e.gratuito) return false
    if (cat !== 'all' && cat !== 'gratis' && e.categoria?.toLowerCase() !== cat) return false
    return true
  })
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

  const [tiempo, setTiempo] = useState('all')
  const [cat,    setCat]    = useState('all')
  const [nombre, setNombre] = useState('')
  const [email,  setEmail]  = useState('')
  const [suscrito, setSuscrito] = useState(false)

  const mapFlyToRef  = useRef<((lat: number, lon: number, zoom?: number) => void) | null>(null)
  const didMountRef  = useRef(false)

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (!barrio.lat || !barrio.lon) return
    mapFlyToRef.current?.(barrio.lat, barrio.lon, barrio.zoom)
  }, [barrio.slug])

  const isTodos = barrio.slug === 'todos'

  const { data: evData } = useQuery<EventosResp | null>({
    queryKey: ['home-eventos', barrio.slug],
    queryFn: async () => {
      const url = isTodos
        ? `${API_BASE_URL}/comunidad/todos/eventos?limit=20`
        : `${API_BASE_URL}/comunidad/${barrio.barrio_id}/eventos?limit=20`
      const r = await fetch(url)
      return r.ok ? r.json() as Promise<EventosResp> : null
    },
    enabled: isTodos || !!barrio.barrio_id,
  })

  const { data: tzData } = useQuery<TiendasResp | null>({
    queryKey: ['home-tiendas', barrio.slug],
    queryFn: async () => {
      const url = isTodos
        ? `${API_BASE_URL}/comunidad/todos/tiendas?limit=4`
        : `${API_BASE_URL}/comunidad/${barrio.barrio_id}/tiendas?limit=4`
      const r = await fetch(url)
      return r.ok ? r.json() as Promise<TiendasResp> : null
    },
    enabled: isTodos || !!barrio.barrio_id,
  })

  const allEvt    = evData?.eventos ?? []
  const destacados = allEvt.filter(e => e.destacado).slice(0, 3)
  const proximos   = filterEvt(allEvt, tiempo, cat).slice(0, 6)
  const tiendas    = tzData?.tiendas ?? []
  const noBarrio   = !barrio.barrio_id && !isTodos

  return (
    <>
      {/* ── HERO ──────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        {/* LandingMapHeader: barrio polygons + terrain + cinematic rotation */}
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

      {/* ── EVENTOS DESTACADOS ────────────────────────── */}
      {!noBarrio && (
        <section style={{ padding: '48px 26px 36px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <SecTitle link={`/eventos/${barrio.slug}`}>{t('Eventos Destacados', 'Featured Events')}</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 }}>
            {destacados.length === 0 ? (
              <p style={{ color: K.muted, gridColumn: '1/-1' }}>
                {t('Aún no hay eventos destacados.', 'No featured events yet.')}
                {' '}<a href="#" style={{ color: K.coral, fontWeight: 700, textDecoration: 'none' }}>{t('¿Tienes uno? Publícalo →', 'Have one? Publish →')}</a>
              </p>
            ) : destacados.map(e => <EventCardFeatured key={e.id} evento={e} />)}
          </div>
        </section>
      )}

      {/* ── PRÓXIMOS EVENTOS ──────────────────────────── */}
      {!noBarrio && (
        <section style={{ padding: '0 26px 48px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <SecTitle link={`/eventos/${barrio.slug}`} linkLabel={t('Ver todos →', 'See all →')}>
            {t('Próximos Eventos', 'Upcoming Events')}
          </SecTitle>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {PILLS_TIEMPO.map(p => (
              <button key={p.id} onClick={() => setTiempo(p.id)} style={{
                border: tiempo === p.id ? `2px solid ${K.coral}` : `2px solid ${K.line}`,
                background: tiempo === p.id ? K.coralLight : 'transparent',
                color: tiempo === p.id ? K.coral : K.muted,
                fontWeight: 700, fontSize: '.8rem', padding: '6px 14px',
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              }}>{lang === 'es' ? p.es : p.en}</button>
            ))}
            <div style={{ width: 1, background: K.line, alignSelf: 'center', height: 18 }} />
            {PILLS_CAT.map(p => (
              <button key={p.id} onClick={() => setCat(p.id)} style={{
                border: cat === p.id ? `2px solid ${K.teal}` : `2px solid ${K.line}`,
                background: cat === p.id ? K.tealDeep + '18' : 'transparent',
                color: cat === p.id ? K.tealDeep : K.muted,
                fontWeight: 700, fontSize: '.8rem', padding: '6px 14px',
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              }}>{lang === 'es' ? p.es : p.en}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '0 40px' }}>
            {proximos.length === 0 ? (
              <p style={{ color: K.muted, gridColumn: '1/-1' }}>
                {t('Ningún evento coincide con los filtros.', 'No events match the filters.')}
              </p>
            ) : proximos.map(e => <EventCardMini key={e.id} evento={e} />)}
          </div>
        </section>
      )}

      {/* ── DIRECTORIO 5 ESTRELLAS ────────────────────── */}
      {!noBarrio && (
        <section style={{ padding: '48px 26px', background: K.surface, borderTop: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SecTitle link={`/local-business/${barrio.slug}`} linkLabel={t('Ver todo →', 'Browse all →')}>
              {t('Directorio 5 Estrellas', '5-Star Directory')}
            </SecTitle>
            <p style={{ color: K.muted, marginBottom: 22, maxWidth: 700, fontSize: '1.02rem' }}>
              {t(
  `Los negocios que tus vecinos ya aman en ${isTodos ? 'el Valle de Aburrá' : barrio.nombre}.`,
  `The businesses your neighbors already love in ${isTodos ? 'the Valle de Aburrá' : barrio.nombre}.`
)}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 18 }}>
              {tiendas.length === 0 ? (
                <a href={`/local-business/${barrio.slug}`} style={{ color: K.coral, fontWeight: 700, textDecoration: 'none', gridColumn: '1/-1' }}>
                  {t('Explorar directorio de negocios →', 'Explore business directory →')}
                </a>
              ) : tiendas.map(t => <BusinessCardDirectory key={t.id} tienda={t} />)}
            </div>
          </div>
        </section>
      )}

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
