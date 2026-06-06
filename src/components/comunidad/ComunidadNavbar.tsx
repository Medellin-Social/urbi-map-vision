import { useEffect, useMemo, useState } from 'react'
import { useBarrio } from './BarrioContext'
import { useTicker } from '../../hooks/useTicker'

const K = {
  ink:      '#14201d',
  teal:     '#1D9E75',
  amarillo: '#ffc928',
  rojo:     '#e63148',
  paper:    '#fbf9f3',
  line:     '#e9e4d8',
  muted:    '#62736d',
  coral:    '#D85A30',
  serif:    "'Fraunces', Georgia, serif" as const,
}

const CATEGORIA_EMOJI: Record<string, string> = {
  musica:       '🎵',
  cultura:      '🎨',
  gastronomia:  '🍽️',
  bienestar:    '🧘',
  deporte:      '🏃',
  social:       '✨',
}

function getNoticiaEmoji(titulo: string): string {
  const t = titulo.toLowerCase()
  if (t.includes('música') || t.includes('concierto') || t.includes('jazz') ||
      t.includes('tango') || t.includes('festival') || t.includes('rock') ||
      t.includes('cantante') || t.includes('canción') || t.includes('álbum'))
    return '🎵'
  if (t.includes('arte') || t.includes('exposición') || t.includes('museo') ||
      t.includes('pintura') || t.includes('escultura') || t.includes('galería') ||
      t.includes('fotografía') || t.includes('diseño'))
    return '🎨'
  if (t.includes('teatro') || t.includes('danza') || t.includes('ballet') ||
      t.includes('ópera') || t.includes('cine') || t.includes('película') ||
      t.includes('serie') || t.includes('premio'))
    return '🎭'
  if (t.includes('restaurante') || t.includes('chef') || t.includes('gastronom') ||
      t.includes('cocina') || t.includes('plato') || t.includes('comida') ||
      t.includes('cerveza') || t.includes('vino'))
    return '🍽️'
  if (t.includes('deport') || t.includes('atletis') || t.includes('ciclism') ||
      t.includes('fútbol') || t.includes('maratón') || t.includes('carrera') ||
      t.includes('campeón') || t.includes('medalla'))
    return '🏆'
  if (t.includes('libro') || t.includes('literatura') || t.includes('novela') ||
      t.includes('poesía') || t.includes('escritor') || t.includes('biblioteca') ||
      t.includes('lectura'))
    return '📚'
  if (t.includes('feria') || t.includes('flores') || t.includes('silletero') ||
      t.includes('desfile') || t.includes('tradición') || t.includes('folclor') ||
      t.includes('patrimonio') || t.includes('cultura'))
    return '🌸'
  if (t.includes('turismo') || t.includes('turista') || t.includes('viaje') ||
      t.includes('destino') || t.includes('visitar'))
    return '✈️'
  if (t.includes('parque') || t.includes('naturaleza') || t.includes('ambiental') ||
      t.includes('sostenible') || t.includes('ecológ'))
    return '🌿'
  if (t.includes('innovación') || t.includes('tecnología') || t.includes('startup') ||
      t.includes('emprendim') || t.includes('digital') || t.includes('videojuego'))
    return '💡'
  if (t.includes('barrio') || t.includes('comunidad') || t.includes('vecinos'))
    return '🏘️'
  if (t.includes('medellín') || t.includes('antioquia') || t.includes('ciudad'))
    return '🌆'
  return '📰'
}

const FALLBACK_ITEMS = [
  { tipo: 'noticia' as const, titulo: '🌸 Medellín Social · Tu ciudad, tu barrio, tu historia', link: '/', fecha: null },
]

export function ComunidadNavbar() {
  const { barrio, barrios, lang, setLang, setBarrioSlug } = useBarrio()
  const [today, setToday] = useState('')
  const [path,  setPath]  = useState('')

  const { data: apiItems = [] } = useTicker(1)

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  useEffect(() => {
    const d = new Date()
    const locale = lang === 'es' ? 'es-CO' : 'en-US'
    setToday(d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  }, [lang])

  const tickerItems = apiItems.length > 0 ? apiItems : FALLBACK_ITEMS

  const hasEventos = tickerItems.some(i => i.tipo === 'evento')

  const formattedItems = useMemo(() => tickerItems.map(item => {
    if (item.tipo === 'evento') {
      const emoji = CATEGORIA_EMOJI[item.categoria ?? ''] ?? getNoticiaEmoji(item.titulo)
      const fechaStr = item.fecha
        ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
        : ''
      return { ...item, texto: `${emoji} ${item.titulo}${fechaStr ? ` · ${fechaStr}` : ''}` }
    }
    const emoji = getNoticiaEmoji(item.titulo)
    return { ...item, texto: `${emoji} ${item.titulo}` }
  }), [tickerItems])

  const scrollItems = [...formattedItems, ...formattedItems]
  const duracion = Math.max(25, formattedItems.length * 3)

  function isActive(href: string) {
    if (href === '/') return path === '/'
    return path.startsWith(href.replace(/\/[^/]+$/, '/'))
  }

  function handleBarrioChange(newSlug: string) {
    const parts    = window.location.pathname.split('/').filter(Boolean)
    const sections = ['eventos', 'local-business']
    if (sections.includes(parts[0])) {
      window.location.href = `/${parts[0]}/${newSlug}`
    } else {
      setBarrioSlug(newSlug)
    }
  }

  const medellin   = barrios.filter(b => b.grupo === 'Medellín')
  const valleAbura = barrios.filter(b => b.grupo === 'Valle de Aburrá')

  const links = [
    { href: '/',                              label: 'HOME' },
    { href: `/eventos/${barrio.slug}`,         label: 'EVENTOS' },
    { href: `/local-business/${barrio.slug}`,  label: 'NEGOCIOS' },
    { href: '/map',                            label: 'INVERSIÓN' },
    { href: '#blog',                           label: 'BLOG' },
  ]

  return (
    <>
      <style>{`
        @keyframes kTick {
          0%   { transform: translateX(0) }
          100% { transform: translateX(-50%) }
        }
        .k-ticker-inner {
          display: inline-block;
          animation: kTick 36s linear infinite;
          white-space: nowrap;
          font-weight: 600;
        }
        .k-nav-link {
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          padding: 8px 14px;
          border-radius: 6px;
          text-decoration: none;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .k-nav-link:hover { background: rgba(255,255,255,0.1); }
      `}</style>

      {/* ── Masthead ─────────────────────────────────── */}
      <header style={{ borderBottom: `1px solid ${K.line}`, background: K.paper, textAlign: 'center', padding: '24px 26px 16px' }}>
        <a href="/" style={{ textDecoration: 'none', color: K.ink }}>
          <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(2.6rem,7.5vw,4.5rem)', letterSpacing: -2, lineHeight: .92 }}>
            Medellín <span style={{ color: K.teal }}>Social</span><span style={{ color: K.amarillo }}>.</span>
          </div>
        </a>
        <div style={{ marginTop: 10, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: K.muted, fontWeight: 600 }}>
          TU CIUDAD · TU BARRIO · TU HISTORIA
        </div>
      </header>

      {/* ── Single sticky navbar ──────────────────────── */}
      <nav style={{
        background: K.ink,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 26px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 52, gap: 8,
        }}>

          {/* LEFT: date + barrio selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontVariantCaps: 'all-small-caps', letterSpacing: '.5px' }}>
              {today}
            </span>
            <select
              value={barrio.slug}
              onChange={e => handleBarrioChange(e.target.value)}
              style={{
                background: 'transparent', color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6, padding: '4px 8px',
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <optgroup label="── Medellín ──" style={{ color: K.ink, background: '#fff' }}>
                {medellin.map(b => (
                  <option key={b.slug} value={b.slug} style={{ color: K.ink, background: '#fff' }}>
                    {b.nombre}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── Valle de Aburrá ──" style={{ color: K.ink, background: '#fff' }}>
                {valleAbura.map(b => (
                  <option key={b.slug} value={b.slug} style={{ color: K.ink, background: '#fff' }}>
                    {b.nombre}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* CENTER: nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {links.map(({ href, label }) => (
              <a
                key={label}
                href={href}
                className="k-nav-link"
                style={{ color: isActive(href) ? K.amarillo : 'rgba(255,255,255,0.85)' }}
              >
                {label}
              </a>
            ))}
          </div>

          {/* RIGHT: subscribe + ES/EN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <a
              href="#subscribe"
              style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none', letterSpacing: '.3px' }}
            >
              Suscríbete
            </a>
            <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
              {(['es', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    border: 'none',
                    background: lang === l ? K.amarillo : 'transparent',
                    color: lang === l ? K.ink : '#fff',
                    padding: '4px 10px', fontWeight: 700,
                    cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

        </div>
      </nav>

      {/* ── Ticker ───────────────────────────────────── */}
      <div style={{ background: K.rojo, color: '#fff', overflow: 'hidden', fontSize: '.82rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 0 0 26px', display: 'flex', alignItems: 'center', gap: 14, height: 38 }}>
          <span style={{
            background: '#fff', color: K.rojo, fontWeight: 900,
            padding: '3px 11px', borderRadius: 5,
            textTransform: 'uppercase', fontSize: '.7rem',
            flexShrink: 0, letterSpacing: '.8px',
          }}>
            {hasEventos
              ? (lang === 'es' ? 'Lo Próximo' : 'Coming Up')
              : (lang === 'es' ? 'Lo Último'  : 'Buzz')}
          </span>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div
              className="k-ticker-inner"
              style={{ animationDuration: `${duracion}s` }}
            >
              {scrollItems.map((item, i) => (
                <a
                  key={i}
                  href={item.link ?? '#'}
                  target={item.link?.startsWith('http') ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                  style={{
                    marginRight: 46,
                    fontWeight: 600,
                    color: '#fff',
                    textDecoration: 'none',
                    cursor: item.link ? 'pointer' : 'default',
                  }}
                >
                  {item.texto}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
