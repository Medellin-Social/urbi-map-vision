import { useEffect, useMemo, useState } from 'react'
import { useBarrio } from './BarrioContext'
import { useTicker } from '../../hooks/useTicker'
import { useLang, FlagCO, FlagUS } from '../../lib/i18n'
import { Wordmark } from '../Wordmark'
import { auth } from '../../lib/auth'

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

const FALLBACK_ITEMS_ES = [
  { tipo: 'noticia' as const, titulo: '🌸 Medellín Social · Tu ciudad, tu barrio, tu historia', link: '/', fecha: null },
]
const FALLBACK_ITEMS_EN = [
  { tipo: 'noticia' as const, titulo: '🌸 Medellín Social · Your city, your barrio, your story', link: '/', fecha: null },
]

export function ComunidadNavbar({ compact = false }: { compact?: boolean }) {
  const { barrio, barrios, lang, setLang: setBarrioLang, setBarrioSlug } = useBarrio()
  const { setLang: setGlobalLang } = useLang()
  const [today,       setToday]       = useState('')
  const [path,        setPath]        = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const logged = !!auth.get()

  function setLang(l: 'es' | 'en') {
    setBarrioLang(l)
    setGlobalLang(l)
  }

  const t = (es: string, en: string) => lang === 'es' ? es : en

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuAbierto && !(e.target as Element).closest('nav')) {
        setMenuAbierto(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuAbierto])

  const { data: apiItems = [] } = useTicker(1)

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  useEffect(() => {
    const d = new Date()
    const locale = lang === 'es' ? 'es-CO' : 'en-US'
    setToday(d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  }, [lang])

  const tickerItems = apiItems.length > 0 ? apiItems : (lang === 'es' ? FALLBACK_ITEMS_ES : FALLBACK_ITEMS_EN)

  const hasEventos = tickerItems.some(i => i.tipo === 'evento')

  const formattedItems = useMemo(() => tickerItems.map(item => {
    if (item.tipo === 'evento') {
      const emoji = CATEGORIA_EMOJI[item.categoria ?? ''] ?? getNoticiaEmoji(item.titulo)
      const fechaStr = item.fecha
        ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'short' })
        : ''
      return { ...item, texto: `${emoji} ${item.titulo}${fechaStr ? ` · ${fechaStr}` : ''}` }
    }
    const emoji = getNoticiaEmoji(item.titulo)
    return { ...item, texto: `${emoji} ${item.titulo}` }
  }), [tickerItems, lang])

  const scrollItems = [...formattedItems, ...formattedItems]
  const duracion = Math.max(60, formattedItems.length * 8)

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
    { href: '/',                              label: t('HOME', 'HOME') },
    { href: `/eventos/${barrio.slug}`,         label: t('EVENTOS', 'EVENTS') },
    { href: `/local-business/${barrio.slug}`,  label: t('NEGOCIOS', 'BUSINESSES') },
    { href: '/real-estate',                    label: 'REAL ESTATE' },
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
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; align-items: center; justify-content: center; }
          .desktop-nav-links { display: none !important; }
          .desktop-only { display: none !important; }
          .desktop-nav-right { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
          .mobile-only { display: none !important; }
        }
      `}</style>

      {/* ── Masthead (hidden in compact mode) ───────── */}
      {!compact && (
        <header style={{ borderBottom: `1px solid ${K.line}`, background: K.paper, textAlign: 'center', padding: '24px 26px 16px' }}>
          <a href="/" style={{ textDecoration: 'none', color: K.ink }}>
            <div className="masthead-logo" style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(2.6rem,7.5vw,4.5rem)', letterSpacing: -2, lineHeight: .92 }}>
              <Wordmark teal={K.teal} coral={K.coral} amarillo={K.amarillo} />
            </div>
          </a>
          <div style={{ marginTop: 10, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: K.muted, fontWeight: 600 }}>
            {t('TU CIUDAD · TU BARRIO · TU HISTORIA', 'YOUR CITY · YOUR BARRIO · YOUR STORY')}
          </div>
        </header>
      )}

      {/* ── Single sticky navbar ──────────────────────── */}
      <nav style={{
        background: K.ink,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 52, gap: 8,
        }}>

          {/* LEFT: logo (compact always) or date+barrio (desktop only — masthead has logo on mobile) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {compact ? (
              <a href="/" style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.25rem', color: '#fff', textDecoration: 'none', letterSpacing: -0.5, lineHeight: 1 }}>
                <Wordmark teal={K.teal} coral={K.coral} amarillo={K.amarillo} />
              </a>
            ) : (
              <>
                <span className="desktop-only" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontVariantCaps: 'all-small-caps', letterSpacing: '.5px' }}>
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
                    flex: 1, minWidth: 0, maxWidth: 220,
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
              </>
            )}
          </div>

          {/* CENTER: nav links — desktop only */}
          <div className="desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

          {/* RIGHT: login/account + subscribe + ES/EN — desktop only */}
          <div className="desktop-nav-right" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <a
              href={logged ? '/mis-propiedades' : '/login'}
              style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none', letterSpacing: '.3px' }}
            >
              {logged ? t('Mi cuenta', 'My account') : t('Iniciar sesión', 'Log in')}
            </a>
            <a
              href="/suscribirse"
              style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none', letterSpacing: '.3px' }}
            >
              {t('Suscríbete', 'Subscribe')}
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
                    padding: '4px 10px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >
                  {l === 'es' ? <FlagCO /> : <FlagUS />}
                </button>
              ))}
            </div>
          </div>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuAbierto(prev => !prev)}
            className="mobile-menu-btn"
            aria-label="Menú"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {menuAbierto ? '✕' : '☰'}
          </button>

        </div>

        {/* Mobile dropdown */}
        {menuAbierto && (
          <div style={{
            background: '#14201d',
            padding: '12px 16px 16px',
            borderTop: '0.5px solid rgba(255,255,255,0.1)',
          }}>
            {!compact && (
              <select
                value={barrio.slug}
                onChange={e => { handleBarrioChange(e.target.value); setMenuAbierto(false) }}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '0.5px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 12,
                  fontSize: 14,
                  fontFamily: 'inherit',
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
            )}

            {links.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuAbierto(false)}
                style={{
                  display: 'block',
                  color: isActive(link.href) ? K.amarillo : 'rgba(255,255,255,0.85)',
                  padding: '10px 0',
                  fontSize: 15,
                  fontWeight: isActive(link.href) ? 700 : 500,
                  textDecoration: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                }}
              >
                {link.label}
              </a>
            ))}

            <a
              href={logged ? '/mis-propiedades' : '/login'}
              onClick={() => setMenuAbierto(false)}
              style={{
                display: 'block', color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 500,
                textDecoration: 'none', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
              }}
            >
              {logged ? t('Mi cuenta', 'My account') : t('Iniciar sesión', 'Log in')}
            </a>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <a
                href="/suscribirse"
                onClick={() => setMenuAbierto(false)}
                style={{ color: K.amarillo, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                {t('Suscríbete →', 'Subscribe →')}
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
                      padding: '4px 10px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}
                  >
                    {l === 'es' ? <FlagCO /> : <FlagUS />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
