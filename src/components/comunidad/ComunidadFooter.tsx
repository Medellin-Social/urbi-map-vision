const K = {
  ink: '#14201d',
  teal: '#1D9E75',
  amarillo: '#ffc928',
  serif: "'Fraunces', Georgia, serif" as const,
}

export function ComunidadFooter({ lang }: { lang: 'es' | 'en' }) {
  const t = (es: string, en: string) => lang === 'es' ? es : en

  const secciones = [
    [t('Eventos', 'Events'), '/eventos/el-poblado'],
    [t('Negocios', 'Businesses'), '/local-business/el-poblado'],
    ['Real Estate', '/map'],
    ['Blog', '#'],
  ]

  const participa: [string, string][] = [
    [t('Suscribirte gratis', 'Subscribe free'), '/suscribirse'],
    [t('Lista tu negocio', 'List your business'), '/negocios/unirse'],
    [t('Sé Embajador del Barrio', 'Become an Ambassador'), '/embajador'],
    [t('Programa de Afiliados', 'Affiliate Program'), '/afiliado'],
  ]

  return (
    <footer style={{ background: K.ink, color: '#bccfc8', padding: '46px 26px 30px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
        gap: 34, maxWidth: 1200, margin: '0 auto',
      }}>
        <div>
          <div style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.8rem', color: '#fff', letterSpacing: -1 }}>
            Medellín <span style={{ color: K.teal }}>Social</span><span style={{ color: K.amarillo }}>.</span>
          </div>
          <p style={{ marginTop: 12, fontSize: '.9rem', lineHeight: 1.55, maxWidth: 300 }}>
            {t(
              'Tu ciudad, tu barrio, tu historia — la plaza digital de Medellín.',
              'Your city, your barrio, your story — the digital town square for Medellín.',
            )}
          </p>
        </div>
        <div>
          <h5 style={{ color: '#fff', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '1.8px', marginBottom: 14, margin: '0 0 14px' }}>
            {t('Secciones', 'Sections')}
          </h5>
          {secciones.map(([label, href]) => (
            <a key={label} href={href} style={{ display: 'block', padding: '5px 0', fontSize: '.9rem', color: '#bccfc8', textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
        <div>
          <h5 style={{ color: '#fff', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '1.8px', margin: '0 0 14px' }}>
            Barrios
          </h5>
          {['El Poblado', 'Laureles', 'Envigado', 'Sabaneta'].map(b => (
            <a key={b} href={`/eventos/${b.toLowerCase().replace(' ', '-')}`} style={{ display: 'block', padding: '5px 0', fontSize: '.9rem', color: '#bccfc8', textDecoration: 'none' }}>
              {b}
            </a>
          ))}
        </div>
        <div>
          <h5 style={{ color: '#fff', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '1.8px', margin: '0 0 14px' }}>
            {t('Participa', 'Get Involved')}
          </h5>
          {participa.map(([label, href]) => (
            <a key={label} href={href} style={{ display: 'block', padding: '5px 0', fontSize: '.9rem', color: '#bccfc8', textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
      </div>
      <div style={{
        maxWidth: 1200, margin: '30px auto 0', paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,.12)',
        fontSize: '.8rem', display: 'flex', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, opacity: .8,
      }}>
        <span>© 2026 Medellín Social · {t('una plataforma comunitaria', 'a community platform')}</span>
        <span>medellin.social</span>
      </div>
    </footer>
  )
}
