import { seo } from "@/lib/seo";
import { createFileRoute } from '@tanstack/react-router'
import { formatMoney } from "@/lib/format";
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
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

const CATEGORIAS = [
  {
    label:    'Comprar',
    sub:      'Apartamentos y casas en venta',
    href:     '/map?tipo_operacion=venta',
    bg:       `linear-gradient(145deg, ${K.tealDeep} 0%, ${K.teal} 100%)`,
    fg:       '#fff',
    emoji:    '🏡',
  },
  {
    label:    'Arrendar',
    sub:      'Arriendos en toda el área metropolitana',
    href:     '/map?tipo_operacion=arriendo',
    bg:       `linear-gradient(145deg, #00286B 0%, ${K.azul} 100%)`,
    fg:       '#fff',
    emoji:    '🔑',
  },
  {
    label:    'Vender',
    sub:      'Publica tu propiedad en minutos',
    href:     '/vender',
    bg:       `linear-gradient(145deg, #9E0D1D 0%, ${K.rojo} 100%)`,
    fg:       '#fff',
    emoji:    '📋',
  },
  {
    label:    'Invertir',
    sub:      'Analiza barrios con datos reales',
    href:     '/map',
    bg:       `linear-gradient(145deg, #F2B807 0%, ${K.amarillo} 100%)`,
    fg:       K.ink,
    emoji:    '📈',
  },
]

// ── Icons ──────────────────────────────────────────────────────────────────────

// ── Section 1: Hero ────────────────────────────────────────────────────────────

function HeroSection() {
  const [modo, setModo] = useState<'comprar' | 'arrendar' | 'invertir'>('comprar')

  const modoHref = {
    comprar:  '/map?tipo_operacion=venta',
    arrendar: '/map?tipo_operacion=arriendo',
    invertir: '/map',
  }

  const tabs: { key: typeof modo; label: string }[] = [
    { key: 'comprar',  label: 'Comprar'  },
    { key: 'arrendar', label: 'Arrendar' },
    { key: 'invertir', label: 'Invertir' },
  ]

  return (
    <section style={{
      background: `linear-gradient(160deg, ${K.paper} 52%, ${K.coralLight} 100%)`,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(64px, 12vw, 112px) 24px clamp(56px, 10vw, 88px)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: K.coralLight, color: K.coral,
          fontFamily: K.manrope,
          fontSize: '.62rem', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '1.6px',
          padding: '5px 16px', borderRadius: 999, marginBottom: 32,
        }}>
          Medellín Social · Real Estate
        </div>

        <h1 style={{
          fontFamily: K.serif,
          fontWeight: 900,
          fontSize: 'clamp(2.4rem, 7vw, 4rem)',
          color: K.ink,
          lineHeight: 1.05,
          letterSpacing: -2,
          margin: '0 0 24px',
        }}>
          El mercado inmobiliario<br />
          del Valle de Aburrá,<br />
          <span style={{ color: K.coral }}>en tus manos.</span>
        </h1>

        <p style={{
          fontFamily: K.manrope,
          fontSize: 'clamp(.92rem, 2vw, 1.05rem)',
          color: K.muted,
          lineHeight: 1.7,
          maxWidth: 460,
          margin: '0 auto 44px',
        }}>
          54,000+ propiedades. Datos reales.<br />
          Inversores locales y extranjeros.
        </p>

        {/* Filter tabs */}
        <div style={{
          display: 'inline-flex',
          gap: 0,
          background: K.surface,
          border: `1px solid ${K.line}`,
          borderRadius: 999,
          padding: 4,
          marginBottom: 28,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setModo(t.key)}
              style={{
                padding: '9px 24px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontFamily: K.manrope,
                fontWeight: 700,
                fontSize: '.84rem',
                letterSpacing: '.2px',
                transition: 'background .15s, color .15s, box-shadow .15s',
                background: modo === t.key ? K.ink : 'transparent',
                color:      modo === t.key ? '#fff' : K.muted,
                boxShadow:  modo === t.key ? '0 2px 8px rgba(20,32,29,0.22)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <br />

        <a
          href={modoHref[modo]}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: K.coral, color: '#fff',
            fontFamily: K.manrope, fontWeight: 800, fontSize: '.92rem',
            padding: '14px 32px', borderRadius: 999,
            textDecoration: 'none', letterSpacing: '.2px',
            boxShadow: '0 4px 20px rgba(216,90,48,0.28)',
          }}
        >
          Ver propiedades →
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

// ── Section 4: Categorías visuales ────────────────────────────────────────────

function CategoriasSection() {
  return (
    <section style={{
      background: K.paper,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(48px, 8vw, 80px) 24px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: K.serif, fontWeight: 800,
          fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
          color: K.ink, margin: '0 0 32px', letterSpacing: -.5,
          textAlign: 'center',
        }}>
          ¿Qué estás buscando?
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {CATEGORIAS.map(cat => (
            <a
              key={cat.label}
              href={cat.href}
              style={{
                background: cat.bg,
                borderRadius: 16,
                padding: '36px 24px 28px',
                display: 'flex', flexDirection: 'column',
                textDecoration: 'none',
                color: cat.fg,
                transition: 'transform .15s, box-shadow .15s',
                minHeight: 180,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = '0 12px 40px rgba(0,0,0,0.2)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.transform = 'none'
                el.style.boxShadow = 'none'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>{cat.emoji}</div>
              <div style={{
                fontFamily: K.serif, fontWeight: 800,
                fontSize: '1.3rem', marginBottom: 6,
              }}>
                {cat.label}
              </div>
              <div style={{
                fontFamily: K.manrope,
                fontSize: '.85rem', color: cat.fg, opacity: .78,
                lineHeight: 1.5, flex: 1,
              }}>
                {cat.sub}
              </div>
              <div style={{
                fontFamily: K.manrope,
                marginTop: 20, fontSize: '.78rem',
                fontWeight: 700, color: cat.fg, opacity: .9,
                letterSpacing: '.2px',
              }}>
                Explorar →
              </div>
            </a>
          ))}
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
      <ListingsDestacadosSection />
      <HistoriaSection />
      <CategoriasSection />
      <StatsSection />
      <FinalCTASection />
    </>
  )
}
