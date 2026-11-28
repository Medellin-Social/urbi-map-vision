import { seo } from "@/lib/seo";
import { createFileRoute } from '@tanstack/react-router'
import { formatMoney } from "@/lib/format";
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { apiFetch } from '@/lib/apiClient'
import { API_ENDPOINTS } from '@/config/api'
import type { ApiListingsResponse, ApiListing } from '@/lib/adapters'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { MapView } from '@/components/MapView'
import { useIsMobile } from '@/hooks/use-mobile'
import { K as TOKENS } from "@/design/tokens";
import { RealEstateTourModal } from '@/components/RealEstateTourModal'

export const Route = createFileRoute('/real-estate')({
  component: RealEstateRoot,
  head: () => seo({ title: "Real estate en Medellín · Medellín Social", description: "Publicá o encontrá inmuebles para comprar o arrendar en Medellín y el Valle de Aburrá, un barrio a la vez.", path: "/real-estate" }),
})

function RealEstateRoot() {
  return (
    <ComunidadLayout>
      <RealEstatePage />
    </ComunidadLayout>
  )
}

const K = TOKENS;

function fmtCOP(n: number): string {
  return formatMoney(n, "COP", undefined, { suffix: false })
}

// Encabezado de sección editorial (mismo patrón que el home: serif + regla + link).
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

const STATS = [
  { value: '+378%',        label: 'IED Medellín 2025',          note: 'Inversión extranjera directa' },
  { value: '$1.5k–$2.5k', label: 'USD precio/m² El Poblado',   note: 'Rango promedio 2025' },
  { value: '+1.27M',        label: 'Visitantes internacionales',  note: 'Llegadas aéreas 2025' },
  { value: '15–20%',       label: 'Compradores extranjeros',     note: 'Del mercado nacional' },
]

// ── Hero: el MAPA es el héroe (Ken). Backdrop vivo no-interactivo + overlay editorial;
//    el CTA/clic lleva al mapa en pantalla completa, donde ya se recomienda el agente. ──
function MapHero({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  return (
    <section data-tour="re-hero" style={{ padding: isMobile ? '12px 12px 0' : '22px 26px 0' }}>
      <style>{`
        @keyframes reKenBurns { from { transform: scale(1) } to { transform: scale(1.06) } }
        .re-map-bg { animation: reKenBurns 16s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .re-map-bg { animation: none; } }
      `}</style>
      <div style={{
        position: 'relative', maxWidth: 1240, margin: '0 auto', borderRadius: isMobile ? 18 : 26, overflow: 'hidden',
        minHeight: isMobile ? 500 : 600, display: 'flex', alignItems: 'flex-end', background: K.ink,
        boxShadow: '0 20px 60px rgba(17,20,24,.22)',
      }}>
        {/* Mapa vivo como fondo (no captura clics; el CTA lleva a /map interactivo) */}
        <div className="re-map-bg" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <MapView mapView="zonas" selectedId={null} onSelect={() => {}} fitValle pitch={0} bearing={0} />
        </div>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(17,20,24,.12) 0%, rgba(17,20,24,.35) 42%, rgba(17,20,24,.92) 100%)' }} />
        {/* Tricolor firma */}
        <div style={{ display: 'flex', height: 6, position: 'absolute', top: 0, left: 0, right: 0 }} aria-hidden>
          <div style={{ flex: 2, background: K.amarillo }} /><div style={{ flex: 1, background: K.azul }} /><div style={{ flex: 1, background: K.rojo }} />
        </div>
        <div style={{ position: 'relative', padding: isMobile ? '28px 20px 30px' : '56px 56px 54px', color: '#fff', maxWidth: 820 }}>
          <span style={{ fontFamily: K.manrope, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: K.amarillo }}>
            {t('Real estate · Valle de Aburrá', 'Real estate · Aburrá Valley')}
          </span>
          <h1 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(2.1rem, 6.2vw, 4.2rem)', lineHeight: 1.02, letterSpacing: '-2px', margin: '10px 0 14px' }}>
            {t('Buscá tu próxima casa, un barrio a la vez.', 'Find your next home, one barrio at a time.')}
          </h1>
          <p style={{ fontSize: isMobile ? '1.02rem' : '1.2rem', lineHeight: 1.5, color: 'rgba(255,255,255,.9)', margin: '0 0 22px', maxWidth: 620 }}>
            {t('Todas las plataformas en una sola búsqueda. Y al explorar una zona, te recomendamos el agente preferido que la conoce.', 'Every listing platform in one search. And as you explore an area, we recommend the preferred agent who knows it.')}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/map" style={{ background: K.rojo, color: '#fff', fontWeight: 800, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}>
              {t('Explorá el mapa', 'Explore the map')} →
            </a>
            <a href="/publicar" style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', fontWeight: 800, padding: '14px 28px', borderRadius: 999, textDecoration: 'none', backdropFilter: 'blur(6px)' }}>
              {t('Publicá tu inmueble', 'List your property')}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Los 3 caminos (Ken): vender/arrendar · encontrar agente · registrarse. ──
function AccionesSection({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  const cards: { n: string; h: string; p: string; cta: string; href: string; extra?: { label: string; href: string } }[] = [
    {
      n: '01', h: t('Vendé o arrendá tu inmueble', 'Sell or rent your property'),
      p: t('Publicalo en minutos y que lo vean todos los que buscan en tu zona. ¿Preferís que te acompañe un profesional? Elegí un agente que te ayude.', 'List it in minutes and reach everyone searching your area. Prefer a pro to guide you? Pick an agent to help.'),
      cta: t('Publicar inmueble', 'List property'), href: '/publicar',
      extra: { label: t('o elegí un agente que te ayude →', 'or pick an agent to help →'), href: '/agentes' },
    },
    {
      n: '02', h: t('Encontrá un agente', 'Find an agent'),
      p: t('Buscá agentes por zona y estado. Compará perfiles, años de experiencia y reseñas, y contactá al que mejor encaje con lo que necesitás.', 'Search agents by area and status. Compare profiles, experience and reviews, and reach the one that best fits what you need.'),
      cta: t('Buscar agentes', 'Browse agents'), href: '/agentes',
    },
    {
      n: '03', h: t('¿Sos realtor?', 'Are you a realtor?'),
      p: t('Registrate, mostrá tu perfil junto a tus inmuebles y recibí tus leads directo. Certificate para destacar tu trayectoria.', 'Register, show your profile next to your listings and get your leads directly. Get certified to highlight your track record.'),
      cta: t('Registrarme como agente', 'Become a registered agent'), href: '/agentes/registro',
      extra: { label: t('Ver la guía de estados de agentes →', 'See the agent status guide →'), href: '/agentes/estados' },
    },
  ]
  return (
    <section data-tour="re-acciones" style={{ padding: isMobile ? '40px 16px 8px' : '72px 26px 16px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 22 : 32 }}>
        {cards.map((c) => (
          <div key={c.n} data-tour={`re-camino-${c.n}`} style={{ borderTop: `3px solid ${K.ink}`, paddingTop: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1rem', color: K.rojo, marginBottom: 6 }}>{c.n}</div>
            <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.5rem', margin: '0 0 10px', color: K.ink, letterSpacing: '-.4px' }}>{c.h}</h2>
            <p style={{ color: K.muted, lineHeight: 1.6, margin: '0 0 18px', flex: 1 }}>{c.p}</p>
            <a href={c.href} style={{ alignSelf: 'flex-start', background: K.ink, color: '#fff', fontWeight: 800, fontSize: '.9rem', padding: '11px 22px', borderRadius: 999, textDecoration: 'none' }}>
              {c.cta} →
            </a>
            {c.extra && (
              <a href={c.extra.href} style={{ marginTop: 12, color: K.tealDeep, fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>
                {c.extra.label}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Para realtors: tiers + rotación (bloque teal-gradient, como "qué hacer esta semana"). ──
function RealtorsSection({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  const tiers = [
    { h: t('Listing gratis', 'Free listing'), p: t('Tu inmueble aparece porque reunimos todos los listings de la ciudad.', 'Your listing shows up because we aggregate every listing in the city.') },
    { h: t('Registrado', 'Registered'), p: t('Gratis. Tu perfil sale en tus listings y recibís tus leads directo.', 'Free. Your profile shows on your listings and you get your leads directly.') },
    { h: 'Barrio Preferred', p: t('4 cupos por barrio. Rotás en los listings sin agente de ese barrio.', '4 slots per barrio. You rotate on that barrio’s unregistered listings.') },
    { h: 'Comuna Preferred', p: t('8 cupos por comuna. Rotás en toda la comuna, visibilidad premium.', '8 slots per comuna. You rotate across the whole comuna, premium visibility.') },
  ]
  return (
    <section data-tour="re-realtors" style={{ padding: isMobile ? '28px 16px' : '56px 26px' }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        background: `linear-gradient(125deg, ${K.tealDeep}, ${K.teal})`, color: '#fff',
        borderRadius: 20, padding: isMobile ? '28px 20px' : '44px', boxShadow: '0 18px 44px rgba(8,80,65,.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 26 }}>
          <div>
            <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: isMobile ? '1.5rem' : '2rem', margin: 0, letterSpacing: '-.6px' }}>
              {t('Para realtors', 'For realtors')}
            </h2>
            <p style={{ opacity: .9, fontSize: '1rem', margin: '6px 0 0', maxWidth: 560 }}>
              {t('Hacete el agente preferido de tu zona: aparecés primero cuando buscan ahí.', 'Become your area’s preferred agent: you show up first when people search there.')}
            </p>
          </div>
          <a href="/agentes/registro" style={{ background: '#fff', color: K.ink, padding: '12px 24px', borderRadius: 999, fontWeight: 800, fontSize: '.88rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('Registrate como realtor →', 'Become a realtor →')}
          </a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
          {tiers.map((x) => (
            <div key={x.h} style={{ background: 'rgba(255,255,255,.13)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 14, padding: '18px 16px', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontFamily: K.serif, fontWeight: 800, fontSize: '1.1rem', marginBottom: 6 }}>{x.h}</div>
              <div style={{ fontFamily: K.manrope, fontSize: '.86rem', lineHeight: 1.5, opacity: .9 }}>{x.p}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: K.manrope, fontWeight: 800, fontSize: '.9rem', opacity: .95 }}>
            {t('Rotación justa:', 'Fair rotation:')}
          </span>
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 36, height: 36, borderRadius: 999, background: n === 1 ? K.amarillo : 'rgba(255,255,255,.15)', color: n === 1 ? K.ink : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: K.manrope, fontWeight: 800 }}>{n}</span>
                <span style={{ opacity: .7 }}>{n < 4 ? '→' : '↺'}</span>
              </span>
            ))}
          </div>
          <span style={{ fontFamily: K.manrope, fontSize: '.86rem', opacity: .85 }}>
            {t('cada preferido recibe su turno.', 'each preferred agent takes a turn.')}
          </span>
        </div>
      </div>
    </section>
  )
}

function ListingCard({ listing }: { listing: ApiListing }) {
  const precio = listing.precio_cop
  const barrio = listing.barrio_nombre ?? '—'
  const area   = listing.area_m2
  const hab    = listing.habitaciones
  const op     = listing.tipo_operacion === 'arriendo' ? 'Arriendo' : 'Venta'
  const opColor = listing.tipo_operacion === 'arriendo' ? K.teal : K.coral

  return (
    <a
      href={listing.id ? `/listing/${listing.id}` : '#'}
      style={{ background: K.paper, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', boxShadow: '0 2px 10px rgba(20,32,29,.07)', transition: 'box-shadow .15s, transform .15s' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.boxShadow = '0 8px 32px rgba(20,32,29,0.13)'; el.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.boxShadow = '0 2px 10px rgba(20,32,29,.07)'; el.style.transform = 'none' }}
    >
      <div style={{ height: 178, background: `linear-gradient(135deg, ${K.surface} 0%, ${K.line} 100%)`, position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
        {listing.foto_principal ? (
          <img src={listing.foto_principal} alt={barrio} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.4rem', opacity: .28 }}>🏢</div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,32,29,.65) 0%, rgba(20,32,29,.05) 50%, transparent 100%)' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          <span style={{ fontFamily: K.manrope, background: opColor, color: '#fff', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', padding: '3px 9px', borderRadius: 999 }}>{op}</span>
          {listing.buena_oferta && (
            <span style={{ fontFamily: K.manrope, background: K.amarillo, color: K.ink, fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', padding: '3px 9px', borderRadius: 999 }}>Buena oferta</span>
          )}
        </div>
        {precio && (
          <div style={{ position: 'absolute', bottom: 10, left: 12 }}>
            <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.2rem', color: '#fff', lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,.3)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtCOP(precio)}
              {listing.tipo_operacion === 'arriendo' && <span style={{ fontSize: '.7rem', fontWeight: 500, opacity: .8 }}> /mes</span>}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontFamily: K.manrope, fontSize: '.77rem', color: K.muted, fontWeight: 600 }}>📍 {barrio}</div>
        <div style={{ display: 'flex', gap: 10, fontFamily: K.manrope, fontSize: '.72rem', color: K.muted }}>
          {area && <span>{area} m²</span>}
          {hab  && <span>{hab} hab</span>}
        </div>
      </div>
    </a>
  )
}

function ListingCardSkeleton() {
  return (
    <div style={{ background: K.paper, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(20,32,29,.07)' }}>
      <div style={{ height: 178, background: K.surface }} />
      <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 20, width: '55%', background: K.line, borderRadius: 6 }} />
        <div style={{ height: 13, width: '70%', background: K.surface, borderRadius: 6 }} />
        <div style={{ height: 11, width: '40%', background: K.surface, borderRadius: 6 }} />
      </div>
    </div>
  )
}

function ListingsDestacadosSection({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  const { data, isLoading } = useQuery<ApiListingsResponse>({
    queryKey: ['featured-listings'],
    queryFn: () => apiFetch(`${API_ENDPOINTS.allListings}?limit=24`),
    staleTime: 10 * 60_000,
  })
  const featured = useMemo(() => {
    const all = data?.listings ?? []
    const withPhoto   = all.filter(l => l.foto_principal)
    const candidates  = withPhoto.length >= 4 ? withPhoto : all
    return [...candidates].sort((a, b) => (b.buena_oferta ? 1 : 0) - (a.buena_oferta ? 1 : 0)).slice(0, 6)
  }, [data])

  return (
    <section data-tour="re-destacados" style={{ background: K.surface, borderTop: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}`, padding: isMobile ? '40px 16px' : '72px 26px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SecTitle link="/map" linkLabel={t('Ver todas →', 'See all →')}>{t('Propiedades destacadas', 'Featured properties')}</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20 }}>
          {isLoading ? [0,1,2,3,4,5].map(i => <ListingCardSkeleton key={i} />) : featured.map(l => <ListingCard key={l.id} listing={l} />)}
        </div>
      </div>
    </section>
  )
}

function HistoriaSection({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  const metrics = [
    { val: '54K+',  lbl: t('listings activos', 'active listings') },
    { val: '606',   lbl: t('barrios mapeados', 'mapped barrios') },
    { val: '12K+',  lbl: t('negocios locales', 'local businesses') },
    { val: t('reales', 'verified'), lbl: t('datos verificados', 'verified data') },
  ]
  return (
    <section data-tour="re-historia" style={{ padding: isMobile ? '44px 16px' : '80px 26px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 32 : 60, alignItems: 'center' }}>
        <div style={{ borderRadius: 18, overflow: 'hidden', aspectRatio: '4/3', minHeight: 260, position: 'relative', background: `linear-gradient(145deg, ${K.tealDeep} 0%, #1a6b50 100%)` }}>
          <img src="https://images.unsplash.com/photo-1697082390861-9f5186b44431?auto=format&fit=crop&w=900&q=80" alt="Medellín" loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} onError={e => { e.currentTarget.style.display = 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,32,29,.55) 0%, transparent 50%)' }} />
        </div>
        <div>
          <div style={{ fontFamily: K.manrope, fontSize: '.62rem', fontWeight: 800, color: K.rojo, textTransform: 'uppercase', letterSpacing: '1.6px', marginBottom: 16 }}>
            {t('Nuestra historia', 'Our story')}
          </div>
          <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)', color: K.ink, margin: '0 0 18px', letterSpacing: '-.6px', lineHeight: 1.15 }}>
            {t('Transparentamos el mercado más opaco de Colombia', 'Bringing transparency to Colombia’s most opaque market')}
          </h2>
          <p style={{ fontFamily: K.manrope, color: K.muted, fontSize: '.96rem', lineHeight: 1.75, margin: '0 0 28px' }}>
            {t('Centralizamos datos reales de 54.000+ propiedades en 10 municipios del Valle de Aburrá: precios verificados, análisis por barrio y agentes de confianza — en un solo lugar.', 'We centralize real data from 54,000+ properties across 10 municipalities of the Aburrá Valley: verified prices, barrio-level analysis and trusted agents — all in one place.')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{ borderTop: `3px solid ${K.ink}`, paddingTop: 12 }}>
                <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.6rem', color: K.tealDeep, lineHeight: 1, marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>{m.val}</div>
                <div style={{ fontFamily: K.manrope, fontSize: '.74rem', color: K.muted, fontWeight: 600 }}>{m.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function StatsSection({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ background: K.paper, borderTop: `1px solid ${K.line}`, padding: isMobile ? '40px 16px' : '64px 26px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SecTitle>{'El mercado en números'}</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 18 : 28 }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ borderTop: `3px solid ${K.rojo}`, paddingTop: 14 }}>
              <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', color: K.ink, lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{s.value}</div>
              <div style={{ fontFamily: K.manrope, fontSize: '.74rem', fontWeight: 800, color: K.ink, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: K.manrope, fontSize: '.74rem', color: K.muted }}>{s.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTASection({ isMobile }: { isMobile: boolean }) {
  const t = useT()
  return (
    <section style={{ padding: isMobile ? '12px 16px 40px' : '26px 26px 72px' }}>
      <div style={{
        position: 'relative', maxWidth: 1240, margin: '0 auto', borderRadius: 26, overflow: 'hidden',
        background: K.ink, color: '#fff', padding: isMobile ? '44px 22px' : '72px 56px', textAlign: 'center',
      }}>
        <div style={{ display: 'flex', height: 6, position: 'absolute', top: 0, left: 0, right: 0 }} aria-hidden>
          <div style={{ flex: 2, background: K.amarillo }} /><div style={{ flex: 1, background: K.azul }} /><div style={{ flex: 1, background: K.rojo }} />
        </div>
        <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.8rem, 4.5vw, 2.8rem)', margin: '0 0 16px', lineHeight: 1.08, letterSpacing: '-1px' }}>
          {t('¿Listo para encontrar tu propiedad?', 'Ready to find your property?')}
        </h2>
        <p style={{ fontFamily: K.manrope, color: 'rgba(255,255,255,.72)', fontSize: '1rem', lineHeight: 1.7, margin: '0 auto 32px', maxWidth: 520 }}>
          {t('Explorá 54.000+ propiedades con precios reales, análisis de barrios y agentes verificados.', 'Explore 54,000+ properties with real prices, barrio analysis and verified agents.')}
        </p>
        <a href="/map" style={{ display: 'inline-block', background: K.rojo, color: '#fff', fontFamily: K.manrope, fontWeight: 800, fontSize: '.95rem', padding: '15px 34px', borderRadius: 999, textDecoration: 'none' }}>
          {t('Ver el mapa de propiedades', 'See the property map')} →
        </a>
      </div>
    </section>
  )
}

function RealEstatePage() {
  const isMobile = useIsMobile()
  return (
    <>
      <RealEstateTourModal />
      <MapHero isMobile={isMobile} />
      <AccionesSection isMobile={isMobile} />
      <RealtorsSection isMobile={isMobile} />
      <ListingsDestacadosSection isMobile={isMobile} />
      <HistoriaSection isMobile={isMobile} />
      <StatsSection isMobile={isMobile} />
      <FinalCTASection isMobile={isMobile} />
    </>
  )
}
