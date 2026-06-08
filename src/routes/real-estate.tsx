import { createFileRoute } from '@tanstack/react-router'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'

export const Route = createFileRoute('/real-estate')({
  component: RealEstateRoot,
  head: () => ({
    meta: [
      { title: 'Real Estate · Medellín Social' },
      { name: 'description', content: 'Expertos inmobiliarios en Medellín y el Valle de Aburrá. Compra, vende e invierte con los mejores agentes locales.' },
    ],
  }),
})

function RealEstateRoot() {
  return (
    <ComunidadLayout>
      <RealEstatePage />
    </ComunidadLayout>
  )
}

const K = {
  paper:      '#fbf9f3',
  surface:    '#f5f0e8',
  line:       '#e9e4d8',
  ink:        '#14201d',
  muted:      '#62736d',
  teal:       '#1D9E75',
  tealDeep:   '#085041',
  coral:      '#D85A30',
  coralLight: '#FAECE7',
  amarillo:   '#ffc928',
  serif:      "'Fraunces', Georgia, serif" as const,
}

// ── Data (future: fetch from /api/v1/agentes) ──────────────────────────────────

type Expert = {
  name:      string
  role:      string
  company:   string
  initials:  string
  avatarBg:  string
  linkedin?: string
  instagram?: string
  whatsapp?: string
}

const EXPERTS: Expert[] = [
  {
    name:      'Ken Munro',
    role:      'Fundador',
    company:   'Medellín Social',
    initials:  'KM',
    avatarBg:  K.teal,
    linkedin:  '#',
    instagram: '#',
    whatsapp:  '#',
  },
  {
    name:      'Kathy',
    role:      'Agente Independiente',
    company:   'Corredor El Poblado → La Estrella',
    initials:  'K',
    avatarBg:  K.coral,
    linkedin:  '#',
    instagram: '#',
    whatsapp:  '#',
  },
]

// ── Data (future: fetch from /api/v1/blog) ─────────────────────────────────────

type Article = {
  title:  string
  date:   string
  author: string
  tag:    string
  tagBg:  string
  imgBg:  string
}

const ARTICLES: Article[] = [
  {
    title:  '¿Por qué El Poblado sigue siendo el barrio más codiciado de Medellín?',
    date:   '5 jun 2026',
    author: 'Ken Munro',
    tag:    'Análisis',
    tagBg:  K.teal,
    imgBg:  `linear-gradient(135deg, ${K.teal} 0%, ${K.tealDeep} 100%)`,
  },
  {
    title:  'Laureles vs Envigado: Dónde invertir en 2026 según el mercado',
    date:   '28 may 2026',
    author: 'Redacción',
    tag:    'Comparativa',
    tagBg:  K.coral,
    imgBg:  `linear-gradient(135deg, ${K.coral} 0%, #a03018 100%)`,
  },
  {
    title:  'IED en Medellín creció 378%: lo que significa para el mercado inmobiliario',
    date:   '15 may 2026',
    author: 'Redacción',
    tag:    'Tendencias',
    tagBg:  K.tealDeep,
    imgBg:  `linear-gradient(135deg, ${K.amarillo} 0%, #d4a000 100%)`,
  },
]

const STATS = [
  { value: '+378%',        label: 'IED Medellín 2025',         note: 'Inversión extranjera directa' },
  { value: '$1.5k–$2.5k', label: 'USD precio/m² El Poblado',  note: 'Rango promedio 2025' },
  { value: '659,097',      label: 'Visitantes internacionales', note: 'Llegadas aéreas 2023' },
  { value: '15–20%',       label: 'Compradores extranjeros',    note: 'Del mercado nacional' },
]

// ── Social icons ───────────────────────────────────────────────────────────────

function IcoLinkedIn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function IcoInstagram() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function IcoWhatsApp() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  )
}

// ── Expert Card ────────────────────────────────────────────────────────────────

function ExpertCard({ expert }: { expert: Expert }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${K.line}`,
      borderRadius: 16,
      padding: '36px 24px 28px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: expert.avatarBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: K.serif,
        fontWeight: 900,
        fontSize: '2.1rem',
        color: '#fff',
        letterSpacing: -1,
        marginBottom: 18,
        boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
        flexShrink: 0,
      }}>
        {expert.initials}
      </div>

      <div style={{
        fontFamily: K.serif,
        fontWeight: 700,
        fontSize: '1.2rem',
        color: K.ink,
        lineHeight: 1.2,
      }}>
        {expert.name}
      </div>

      <div style={{
        marginTop: 5,
        fontSize: '.75rem',
        fontWeight: 700,
        color: K.teal,
        textTransform: 'uppercase',
        letterSpacing: '.6px',
      }}>
        {expert.role}
      </div>

      <div style={{
        marginTop: 5,
        fontSize: '.85rem',
        color: K.muted,
        lineHeight: 1.4,
      }}>
        {expert.company}
      </div>

      <div style={{
        marginTop: 22,
        display: 'flex',
        gap: 10,
        justifyContent: 'center',
      }}>
        {expert.linkedin && (
          <a
            href={expert.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${expert.name} en LinkedIn`}
            style={{
              width: 36, height: 36, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: K.surface, color: K.ink, textDecoration: 'none',
            }}
          >
            <IcoLinkedIn />
          </a>
        )}
        {expert.instagram && (
          <a
            href={expert.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${expert.name} en Instagram`}
            style={{
              width: 36, height: 36, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: K.surface, color: K.ink, textDecoration: 'none',
            }}
          >
            <IcoInstagram />
          </a>
        )}
        {expert.whatsapp && (
          <a
            href={expert.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp de ${expert.name}`}
            style={{
              width: 36, height: 36, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#e8fdf3', color: '#25D366', textDecoration: 'none',
            }}
          >
            <IcoWhatsApp />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Article Card ───────────────────────────────────────────────────────────────

function ArticleCard({ article }: { article: Article }) {
  return (
    <article style={{
      background: '#fff',
      border: `1px solid ${K.line}`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        height: 156,
        background: article.imgBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2.8rem',
      }}>
        🏙️
      </div>

      <div style={{ padding: '20px 20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{
          display: 'inline-block',
          background: article.tagBg,
          color: '#fff',
          fontSize: '.62rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          padding: '3px 10px',
          borderRadius: 999,
          marginBottom: 12,
          alignSelf: 'flex-start',
        }}>
          {article.tag}
        </span>

        <div style={{
          fontFamily: K.serif,
          fontWeight: 700,
          fontSize: '1rem',
          color: K.ink,
          lineHeight: 1.38,
          marginBottom: 'auto',
          paddingBottom: 14,
        }}>
          {article.title}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '.73rem',
          color: K.muted,
          paddingTop: 14,
          borderTop: `1px solid ${K.line}`,
        }}>
          <span>{article.date}</span>
          <span style={{ color: K.line }}>·</span>
          <span>{article.author}</span>
        </div>
      </div>
    </article>
  )
}

// ── Sections ───────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section style={{
      background: `linear-gradient(160deg, ${K.paper} 55%, rgba(29,158,117,0.07) 100%)`,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(56px, 10vw, 96px) 24px clamp(48px, 8vw, 80px)',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: K.teal,
          color: '#fff',
          fontSize: '.62rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1.8px',
          padding: '5px 14px',
          borderRadius: 999,
          marginBottom: 28,
        }}>
          🏡 Real Estate · Medellín Social
        </div>

        <h1 style={{
          fontFamily: K.serif,
          fontWeight: 900,
          fontSize: 'clamp(2.2rem, 6vw, 3.6rem)',
          color: K.ink,
          lineHeight: 1.06,
          letterSpacing: -2,
          margin: '0 0 22px',
        }}>
          Expertos Inmobiliarios<br />
          <span style={{ color: K.teal }}>en Medellín</span>
        </h1>

        <p style={{
          fontSize: 'clamp(.95rem, 2vw, 1.08rem)',
          color: K.muted,
          lineHeight: 1.65,
          maxWidth: 500,
          margin: '0 auto',
        }}>
          El equipo que te ayuda a comprar, vender e invertir en el Valle de Aburrá.
        </p>
      </div>
    </section>
  )
}

function ExpertosSection() {
  return (
    <section style={{
      background: K.paper,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(48px, 8vw, 80px) 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{
            fontFamily: K.serif,
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
            color: K.ink,
            margin: '0 0 10px',
            letterSpacing: -.5,
          }}>
            Expertos del Equipo
          </h2>
          <p style={{ color: K.muted, fontSize: '.9rem', margin: 0 }}>
            Profesionales con experiencia local en el mercado del Valle de Aburrá.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 320px))',
          gap: 24,
          justifyContent: 'center',
        }}>
          {EXPERTS.map(e => <ExpertCard key={e.name} expert={e} />)}
        </div>
      </div>
    </section>
  )
}

function ArticulosSection() {
  return (
    <section style={{
      background: K.surface,
      borderBottom: `1px solid ${K.line}`,
      padding: 'clamp(48px, 8vw, 80px) 24px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <h2 style={{
            fontFamily: K.serif,
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
            color: K.ink,
            margin: '0 0 8px',
            letterSpacing: -.5,
          }}>
            Tendencias del Mercado Medellín
          </h2>
          <p style={{ color: K.muted, fontSize: '.9rem', margin: 0 }}>
            Análisis editorial sobre el mercado inmobiliario del Valle de Aburrá.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {ARTICLES.map(a => <ArticleCard key={a.title} article={a} />)}
        </div>
      </div>
    </section>
  )
}

function MLSBanner() {
  return (
    <section style={{
      background: K.tealDeep,
      padding: 'clamp(48px, 8vw, 72px) 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          fontSize: '.62rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 14,
        }}>
          Mapa de Inversión · Medellín Social
        </div>

        <h2 style={{
          fontFamily: K.serif,
          fontWeight: 900,
          fontSize: 'clamp(1.7rem, 4vw, 2.5rem)',
          color: '#fff',
          margin: '0 0 16px',
          lineHeight: 1.12,
          letterSpacing: -1,
        }}>
          Analiza el mercado<br />antes de invertir
        </h2>

        <p style={{
          color: 'rgba(255,255,255,0.68)',
          fontSize: '.95rem',
          lineHeight: 1.6,
          margin: '0 0 36px',
        }}>
          Explora 606 barrios del Valle de Aburrá con scores de potencial, precios promedio y tendencias de mercado.
        </p>

        <a
          href="/map"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: K.amarillo,
            color: K.ink,
            fontWeight: 800,
            fontSize: '.9rem',
            padding: '14px 30px',
            borderRadius: 10,
            textDecoration: 'none',
            letterSpacing: '.2px',
          }}
        >
          🗺️ Ver mapa de inversión
        </a>
      </div>
    </section>
  )
}

function StatsSection() {
  return (
    <section style={{
      background: K.paper,
      borderTop: `1px solid ${K.line}`,
      padding: 'clamp(48px, 8vw, 80px) 24px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{
            fontFamily: K.serif,
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
            color: K.ink,
            margin: 0,
            letterSpacing: -.5,
          }}>
            Tendencias en Números
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          border: `1px solid ${K.line}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '36px 24px',
                background: i % 2 === 0 ? '#fff' : K.surface,
                borderRight: i < STATS.length - 1 ? `1px solid ${K.line}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{
                fontFamily: K.serif,
                fontWeight: 900,
                fontSize: 'clamp(1.7rem, 3vw, 2.3rem)',
                color: K.teal,
                lineHeight: 1,
                marginBottom: 10,
              }}>
                {s.value}
              </div>
              <div style={{
                fontSize: '.72rem',
                fontWeight: 700,
                color: K.ink,
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                marginBottom: 6,
              }}>
                {s.label}
              </div>
              <div style={{ fontSize: '.72rem', color: K.muted }}>
                {s.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

function RealEstatePage() {
  return (
    <>
      <HeroSection />
      <ExpertosSection />
      <ArticulosSection />
      <MLSBanner />
      <StatsSection />
    </>
  )
}
