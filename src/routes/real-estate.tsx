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
import { K as TOKENS } from "@/design/tokens";

export const Route = createFileRoute('/real-estate')({
  component: RealEstateRoot,
  head: () => seo({ title: "Real estate en Medellín · Medellín Social", description: "Inteligencia inmobiliaria para invertir en Medellín y el Valle de Aburrá.", path: "/real-estate" }),
})

function RealEstateRoot() {
  return (
    <ComunidadLayout>
      <RealEstatePage />
    </ComunidadLayout>
  )
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const K = TOKENS;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return formatMoney(n, "COP", undefined, { suffix: false })
}

// ── Static data ───────────────────────────────────────

const STATS = [
  { value: '+378%',        label: 'IED Medellín 2025',          note: 'Inversión extranjera directa' },
  { value: '$1.5k–$2.5k', label: 'USD precio/m² El Poblado',   note: 'Rango promedio 2025' },
  { value: '+1.27M',        label: 'Visitantes internacionales',  note: 'Llegadas aéreas 2025' },
  { value: '15–20%',       label: 'Compradores extranjeros',     note: 'Del mercado nacional' },
]

// ── Icons ──────────────────────────────────────────────────────────────────────

// ── Section 1: Hero + 4 acciones (Ken, 21-nov) ────────────────────────────────

type Choice = { label: string; href: string }
type Action = { emoji: string; title: string; href?: string; choices?: Choice[]; bg: string; fg: string }

function ActionCard({ a }: { a: Action }) {
  const base: React.CSSProperties = {
    background: a.bg, color: a.fg, borderRadius: 16, padding: '28px 22px 22px', minHeight: 170,
    display: 'flex', flexDirection: 'column', textDecoration: 'none', textAlign: 'left',
  }
  const head = (
    <>
      <div style={{ fontSize: '2rem', marginBottom: 10 }} aria-hidden>{a.emoji}</div>
      <div style={{ fontFamily: K.serif, fontWeight: 800, fontSize: '1.3rem', flex: 1 }}>{a.title}</div>
    </>
  )
  if (!a.choices) {
    return (
      <a href={a.href} style={base}>
        {head}
        <div style={{ fontFamily: K.manrope, fontWeight: 700, fontSize: '.9rem', marginTop: 16 }} aria-hidden>→</div>
      </a>
    )
  }
  return (
    <div style={base}>
      {head}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {a.choices.map((c) => (
          <a key={c.href} href={c.href} style={{ fontFamily: K.manrope, fontWeight: 800, fontSize: '.82rem', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.45)', color: a.fg, textDecoration: 'none' }}>
            {c.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function HeroSection() {
  const t = useT()
  const actions: Action[] = [
    { emoji: '🔑', title: t('Arrendar mi casa', 'Rent my home'), bg: `linear-gradient(145deg, #00286B 0%, ${K.azul} 100%)`, fg: '#fff', choices: [
      { label: t('Largo plazo', 'Long term'), href: '/publicar?operacion=arriendo&plazo=largo' },
      { label: t('Corto plazo', 'Short term'), href: '/publicar?operacion=arriendo&plazo=corto' },
    ] },
    { emoji: '📋', title: t('Vender mi casa', 'Sell my home'), href: '/publicar?operacion=venta', bg: `linear-gradient(145deg, #9E0D1D 0%, ${K.rojo} 100%)`, fg: '#fff' },
    { emoji: '🏡', title: t('Buscar casa', 'Find a home'), bg: `linear-gradient(145deg, ${K.tealDeep} 0%, ${K.teal} 100%)`, fg: '#fff', choices: [
      { label: t('Comprar', 'Buy'), href: '/map?tipo_operacion=venta' },
      { label: t('Arrendar', 'Rent'), href: '/map?tipo_operacion=arriendo' },
    ] },
    { emoji: '🤝', title: t('Soy agente', "I'm an agent"), href: '#agentes', bg: `linear-gradient(145deg, #F2B807 0%, ${K.amarillo} 100%)`, fg: K.ink },
  ]
  return (
    <section style={{
      background: `linear-gradient(160deg, ${K.paper} 52%, ${K.coralLight} 100%)`,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(56px, 10vw, 96px) 24px clamp(48px, 8vw, 72px)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(2rem, 5.6vw, 3.4rem)', color: K.ink, lineHeight: 1.08, letterSpacing: -1.5, margin: '0 auto 20px', maxWidth: 900 }}>
          {t('Publicá o buscá inmuebles para comprar o arrendar, un barrio a la vez.', 'List or search for properties to buy or rent, one neighborhood at a time.')}
        </h1>
        <p style={{ fontFamily: K.manrope, fontSize: 'clamp(.95rem, 2vw, 1.1rem)', color: K.muted, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 40px' }}>
          {t('Publicá tu casa en venta o arriendo, o buscá en toda la ciudad, por comuna o hasta un barrio específico.', 'List homes for sale or rent, or search citywide, by comuna, or down to an individual barrio.')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {actions.map((a) => <ActionCard key={a.title} a={a} />)}
        </div>
      </div>
    </section>
  )
}

// Placeholder hasta que se grabe el video (spec 2.1).
function VideoPlaceholder({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} style={{
      aspectRatio: '16 / 9', width: '100%', borderRadius: 16, background: `linear-gradient(145deg, ${K.ink} 0%, #2A1A10 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#fff',
    }}>
      <div aria-hidden style={{ width: 64, height: 64, borderRadius: 999, background: K.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>▶</div>
      <div style={{ fontFamily: K.manrope, fontWeight: 700, fontSize: '.9rem', opacity: .8 }}>{label}</div>
    </div>
  )
}

function TutorialSection() {
  const t = useT()
  return (
    <section style={{ background: K.paper, padding: 'clamp(40px, 7vw, 72px) 24px', borderBottom: `1px solid ${K.line}` }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <VideoPlaceholder label={t('Video tutorial: muy pronto', 'Tutorial video: coming soon')} />
      </div>
    </section>
  )
}

function ValueSection() {
  const t = useT()
  const blocks = [
    { h: t('Todas las plataformas en una.', 'Every listing platform, consolidated.'), p: t('El único lugar donde tenés que buscar.', 'The only place you need to look.') },
    { h: t('Vendedores: todos los que buscan llegan acá.', 'Sellers: everyone who is looking comes here.'), p: '' },
    { h: t('¿Necesitás ayuda?', 'Need help?'), p: t('Trabajá con un realtor certificado preferido.', 'Work with a preferred certified realtor.') },
    { h: t('¿Sos realtor?', 'Are you a realtor?'), p: t('Registrate como realtor.', 'Become a registered realtor.') },
  ]
  return (
    <section style={{ background: K.surface, padding: 'clamp(40px, 7vw, 72px) 24px', borderBottom: `1px solid ${K.line}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28 }}>
        {blocks.map((x, n) => (
          <div key={x.h} style={{ borderTop: `3px solid ${K.ink}`, paddingTop: 16 }}>
            <div style={{ fontFamily: K.serif, fontWeight: 900, color: K.coral, marginBottom: 6 }}>{`0${n + 1}`}</div>
            <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.35rem', color: K.ink, margin: '0 0 8px', letterSpacing: -.4 }}>{x.h}</h2>
            {x.p && <p style={{ fontFamily: K.manrope, color: K.muted, lineHeight: 1.6, margin: 0 }}>{x.p}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function AgentesSection() {
  const t = useT()
  const tiers = [
    { h: t('Listing gratis', 'Free listing'), p: t('Tu inmueble aparece porque reunimos todos los listings.', 'Your listing shows up because we aggregate every listing.') },
    { h: t('Registrado', 'Registered'), p: t('Gratis. Tu perfil sale en tus listings y recibís tus leads directo.', 'Free. Your profile shows on your listings and you get your leads directly.') },
    { h: 'Barrio Preferred', p: t('4 cupos por barrio. Rotás en los listings sin agente de ese barrio.', '4 slots per barrio. You rotate on that barrio’s unregistered listings.') },
    { h: 'Comuna Preferred', p: t('8 cupos por comuna. Rotás en toda la comuna.', '8 slots per comuna. You rotate across the whole comuna.') },
  ]
  return (
    <section id="agentes" style={{ background: K.paper, padding: 'clamp(48px, 8vw, 88px) 24px', borderBottom: `1px solid ${K.line}`, scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: K.ink, margin: '0 0 28px', letterSpacing: -.8 }}>
          {t('Para realtors', 'For realtors')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 40 }}>
          {tiers.map((x) => (
            <div key={x.h} style={{ background: K.surface, border: `1px solid ${K.line}`, borderRadius: 14, padding: '20px 18px' }}>
              <div style={{ fontFamily: K.serif, fontWeight: 800, fontSize: '1.15rem', color: K.ink, marginBottom: 6 }}>{x.h}</div>
              <div style={{ fontFamily: K.manrope, fontSize: '.88rem', color: K.muted, lineHeight: 1.55 }}>{x.p}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'center', marginBottom: 36 }}>
          <div>
            <h3 style={{ fontFamily: K.serif, fontWeight: 800, fontSize: '1.3rem', color: K.ink, margin: '0 0 10px' }}>
              {t('Cómo funciona la rotación', 'How the rotation works')}
            </h3>
            <p style={{ fontFamily: K.manrope, color: K.muted, lineHeight: 1.6, margin: '0 0 16px' }}>
              {t('Los leads de los listings sin agente se reparten por turnos entre los realtors preferidos: 4 por barrio, 8 por comuna. Cada uno recibe su turno.', 'Leads from unregistered listings are shared in turns among preferred realtors: 4 per barrio, 8 per comuna. Each one takes a turn.')}
            </p>
            <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((n) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 999, background: n === 1 ? K.coral : K.surface, color: n === 1 ? '#fff' : K.ink, border: `1px solid ${K.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: K.manrope, fontWeight: 800 }}>{n}</span>
                  <span style={{ color: K.muted }}>{n < 4 ? '→' : '↺'}</span>
                </span>
              ))}
            </div>
          </div>
          <VideoPlaceholder label={t('Video para agentes: muy pronto', 'Agent video: coming soon')} />
        </div>
        <a href="/agentes/registro" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: K.coral, color: '#fff', fontFamily: K.manrope, fontWeight: 800, fontSize: '.95rem', padding: '15px 32px', borderRadius: 999, textDecoration: 'none' }}>
          {t('Registrate como realtor →', 'Become a registered realtor →')}
        </a>
      </div>
    </section>
  )
}

// ── Section 2: Listings destacados ────────────────────────────────────────────

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
      style={{
        background: K.paper,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 2px 10px rgba(20,32,29,.07)',
        transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.boxShadow = '0 8px 32px rgba(20,32,29,0.13)'
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.boxShadow = '0 2px 10px rgba(20,32,29,.07)'
        el.style.transform = 'none'
      }}
    >
      {/* Photo */}
      <div style={{
        height: 178,
        background: `linear-gradient(135deg, ${K.surface} 0%, ${K.line} 100%)`,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {listing.foto_principal ? (
          <img
            src={listing.foto_principal}
            alt={barrio}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.4rem', opacity: .28,
          }}>
            🏢
          </div>
        )}
        {/* gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,32,29,.65) 0%, rgba(20,32,29,.05) 50%, transparent 100%)' }} />
        {/* pills */}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          <span style={{
            fontFamily: K.manrope,
            background: opColor, color: '#fff',
            fontSize: '.58rem', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.8px',
            padding: '3px 9px', borderRadius: 999,
          }}>
            {op}
          </span>
          {listing.buena_oferta && (
            <span style={{
              fontFamily: K.manrope,
              background: K.amarillo, color: K.ink,
              fontSize: '.58rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '.8px',
              padding: '3px 9px', borderRadius: 999,
            }}>
              Buena oferta
            </span>
          )}
        </div>
        {/* price over gradient */}
        {precio && (
          <div style={{ position: 'absolute', bottom: 10, left: 12 }}>
            <div style={{
              fontFamily: K.serif, fontWeight: 900,
              fontSize: '1.2rem', color: '#fff', lineHeight: 1,
              textShadow: '0 1px 4px rgba(0,0,0,.3)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtCOP(precio)}
              {listing.tipo_operacion === 'arriendo' && (
                <span style={{ fontSize: '.7rem', fontWeight: 500, opacity: .8 }}> /mes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontFamily: K.manrope, fontSize: '.77rem', color: K.muted, fontWeight: 600 }}>
          📍 {barrio}
        </div>
        <div style={{
          display: 'flex', gap: 10,
          fontFamily: K.manrope, fontSize: '.72rem', color: K.muted,
        }}>
          {area && <span>{area} m²</span>}
          {hab  && <span>{hab} hab</span>}
        </div>
      </div>
    </a>
  )
}

function ListingCardSkeleton() {
  return (
    <div style={{
      background: K.paper,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(20,32,29,.07)',
    }}>
      <div style={{ height: 178, background: K.surface }} />
      <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 20, width: '55%', background: K.line, borderRadius: 6 }} />
        <div style={{ height: 13, width: '70%', background: K.surface, borderRadius: 6 }} />
        <div style={{ height: 11, width: '40%', background: K.surface, borderRadius: 6 }} />
      </div>
    </div>
  )
}

function ListingsDestacadosSection() {
  const { data, isLoading } = useQuery<ApiListingsResponse>({
    queryKey: ['featured-listings'],
    queryFn: () => apiFetch(`${API_ENDPOINTS.allListings}?limit=24`),
    staleTime: 10 * 60_000,
  })

  const featured = useMemo(() => {
    const all = data?.listings ?? []
    const withPhoto   = all.filter(l => l.foto_principal)
    const candidates  = withPhoto.length >= 4 ? withPhoto : all
    return [...candidates]
      .sort((a, b) => (b.buena_oferta ? 1 : 0) - (a.buena_oferta ? 1 : 0))
      .slice(0, 6)
  }, [data])

  return (
    <section style={{
      background: K.paper,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(48px, 8vw, 80px) 24px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 36,
        }}>
          <div>
            <h2 style={{
              fontFamily: K.serif, fontWeight: 800,
              fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
              color: K.ink, margin: '0 0 6px', letterSpacing: -.5,
            }}>
              Propiedades destacadas
            </h2>
            <p style={{ color: K.muted, fontSize: '.88rem', margin: 0 }}>
              Las mejores ofertas del mercado, actualizadas diariamente.
            </p>
          </div>
          <a
            href="/map"
            style={{
              color: K.teal, fontWeight: 700, fontSize: '.85rem',
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            Ver todas →
          </a>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: 20,
        }}>
          {isLoading
            ? [0,1,2,3,4,5].map(i => <ListingCardSkeleton key={i} />)
            : featured.map(l => <ListingCard key={l.id} listing={l} />)
          }
        </div>
      </div>
    </section>
  )
}

// ── Section 3: La historia ─────────────────────────────────────────────────────

function HistoriaSection() {
  const metrics = [
    { val: '54K+',  lbl: 'listings activos' },
    { val: '606',   lbl: 'barrios mapeados'  },
    { val: '12K+',  lbl: 'negocios locales'  },
    { val: 'reales', lbl: 'datos verificados' },
  ]

  return (
    <section style={{
      background: K.surface,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(56px, 9vw, 96px) 24px',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 'clamp(36px, 6vw, 72px)',
        alignItems: 'center',
      }}>
        {/* Left: editorial photo */}
        <div style={{
          borderRadius: 18,
          overflow: 'hidden',
          aspectRatio: '4/3',
          minHeight: 260,
          position: 'relative',
          background: `linear-gradient(145deg, ${K.tealDeep} 0%, #1a6b50 100%)`,
        }}>
          <img
            src="https://images.unsplash.com/photo-1697082390861-9f5186b44431?auto=format&fit=crop&w=900&q=80"
            alt="Medellín" loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,32,29,.55) 0%, transparent 50%)' }} />
          <div style={{ position: 'absolute', bottom: 18, left: 18 }}>
            <span style={{ fontFamily: K.manrope, fontSize: '.68rem', fontWeight: 700, color: 'rgba(255,255,255,.72)', textTransform: 'uppercase', letterSpacing: '1.4px', background: 'rgba(20,32,29,.4)', padding: '4px 10px', borderRadius: 999 }}>
              Valle de Aburrá
            </span>
          </div>
        </div>

        {/* Right: copy */}
        <div>
          <div style={{
            fontFamily: K.manrope, fontSize: '.62rem', fontWeight: 800,
            color: K.coral, textTransform: 'uppercase',
            letterSpacing: '1.6px', marginBottom: 18,
          }}>
            Nuestra historia
          </div>

          <h2 style={{
            fontFamily: K.serif, fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3.5vw, 2rem)',
            color: K.ink, margin: '0 0 20px', letterSpacing: -.5,
            lineHeight: 1.2,
          }}>
            Nacimos para hacer transparente el mercado más opaco de Colombia
          </h2>

          <p style={{
            fontFamily: K.manrope, color: K.muted, fontSize: '.94rem',
            lineHeight: 1.75, margin: '0 0 32px',
          }}>
            El mercado inmobiliario colombiano es fragmentado, costoso y difícil de navegar — especialmente para compradores extranjeros. Medellín Social centraliza datos reales de 54,000+ propiedades en 10 municipios del Valle de Aburrá, con precios verificados, análisis de barrios y agentes locales de confianza.
          </p>

          {/* Metrics row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}>
            {metrics.map(m => (
              <div key={m.lbl} style={{
                background: K.paper,
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 1px 6px rgba(20,32,29,.07)',
              }}>
                <div style={{
                  fontFamily: K.serif, fontWeight: 900,
                  fontSize: '1.5rem', color: K.tealDeep,
                  lineHeight: 1, marginBottom: 5,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {m.val}
                </div>
                <div style={{ fontFamily: K.manrope, fontSize: '.72rem', color: K.muted, fontWeight: 600 }}>
                  {m.lbl}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Section 5: Métricas del mercado ───────────────────────────────────────────

function StatsSection() {
  return (
    <section style={{
      background: K.ink,
      padding: 'clamp(40px, 6vw, 64px) 24px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 0,
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid rgba(255,255,255,0.08)`,
        }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: 'clamp(24px, 4vw, 36px) 28px',
                borderRight: i < STATS.length - 1 ? `1px solid rgba(255,255,255,0.08)` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{
                fontFamily: K.serif, fontWeight: 900,
                fontSize: 'clamp(1.7rem, 3vw, 2.4rem)',
                color: K.amarillo, lineHeight: 1, marginBottom: 8,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px',
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: K.manrope,
                fontSize: '.68rem', fontWeight: 700,
                color: '#fff', textTransform: 'uppercase',
                letterSpacing: '.9px', marginBottom: 5,
              }}>
                {s.label}
              </div>
              <div style={{ fontFamily: K.manrope, fontSize: '.68rem', color: 'rgba(255,255,255,0.38)' }}>
                {s.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 7: CTA final ───────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section style={{
      background: 'linear-gradient(145deg, #161A17 0%, #111418 55%, #2A1A10 100%)',
      padding: 'clamp(56px, 9vw, 88px) 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: K.serif, fontWeight: 900,
          fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)',
          color: '#fff', margin: '0 0 16px',
          lineHeight: 1.1, letterSpacing: -1,
        }}>
          ¿Listo para encontrar<br />tu propiedad?
        </h2>
        <p style={{
          fontFamily: K.manrope,
          color: 'rgba(255,255,255,0.58)',
          fontSize: '.94rem', lineHeight: 1.7, margin: '0 0 36px',
        }}>
          Explora 54,000+ propiedades con precios reales, análisis de barrios y agentes verificados.
        </p>
        <a
          href="/map"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: K.coral, color: '#fff',
            fontFamily: K.manrope, fontWeight: 800, fontSize: '.92rem',
            padding: '15px 34px', borderRadius: 999,
            textDecoration: 'none', letterSpacing: '.2px',
            boxShadow: '0 4px 24px rgba(216,90,48,0.35)',
          }}
        >
          🗺️ Ver mapa de propiedades →
        </a>
      </div>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

function RealEstatePage() {
  return (
    <>
      <HeroSection />
      <TutorialSection />
      <ValueSection />
      <AgentesSection />
      <ListingsDestacadosSection />
      <HistoriaSection />
      <StatsSection />
      <FinalCTASection />
    </>
  )
}
