import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { useBarrio } from '@/components/comunidad/BarrioContext'
import { BusinessCardDirectory, BusinessCardList } from '@/components/comunidad/BusinessCard'
import { useTiendas, useGrupoCounts, type TiendaData } from '@/hooks/useTiendas'
import { GRUPOS_TIENDAS } from '@/lib/categorias_comunidad'
import { MAPBOX_TOKEN } from '@/lib/mapboxToken'

export const Route = createFileRoute('/local-business/$barrio_slug')({
  component: LocalBusinessRoot,
  head: ({ params }) => ({
    meta: [{ title: `Negocios en ${params.barrio_slug.replace(/-/g, ' ')} · Medellín Social` }],
  }),
})

function LocalBusinessRoot() {
  const { barrio_slug } = Route.useParams()
  return (
    <ComunidadLayout initialSlug={barrio_slug}>
      <LocalBusinessPage />
    </ComunidadLayout>
  )
}

const K = {
  surface: '#f5f0e8', line: '#e9e4d8', ink: '#14201d', muted: '#62736d',
  teal: '#1D9E75', tealDeep: '#085041', coral: '#D85A30', coralLight: '#FAECE7',
  amarillo: '#ffc928', serif: "'Fraunces', Georgia, serif" as const,
}

// ── Mapa ──────────────────────────────────────────────────────────────────────

function TiendasMap({ tiendas, centerLng, centerLat }: {
  tiendas: TiendaData[]; centerLng: number; centerLat: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markersRef   = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [centerLng, centerLat],
      zoom: 14,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    return () => { map.remove(); mapRef.current = null }
  }, [centerLng, centerLat])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const place = (t: TiendaData) => {
      const el = document.createElement('div')
      el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${K.coral};
        border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;
        display:flex;align-items:center;justify-content:center;font-size:13px;`
      el.title = t.nombre
      const mapsUrl = t.google_place_id
        ? `https://www.google.com/maps/place/?q=place_id:${t.google_place_id}`
        : `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}`
      const wa = t.whatsapp || t.telefono
      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false, maxWidth: '240px' })
        .setHTML(`<div style="font-family:system-ui;padding:4px 2px">
            ${t.foto_url ? `<img src="${t.foto_url}" alt="${t.nombre}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px" />` : ''}
            <strong style="font-size:.9rem;color:${K.ink}">${t.nombre}</strong>
            ${t.categoria ? `<div style="font-size:.68rem;color:${K.tealDeep};font-weight:700;text-transform:uppercase;margin:2px 0">${t.categoria}</div>` : ''}
            ${t.rating_google ? `<div style="color:${K.amarillo};font-size:.82rem">★ ${t.rating_google.toFixed(1)}</div>` : ''}
            ${t.direccion ? `<div style="font-size:.72rem;color:${K.muted};margin-top:4px">${t.direccion}</div>` : ''}
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              ${wa ? `<a href="https://wa.me/${wa.replace(/\D/g, '')}" target="_blank" style="background:#25D366;color:#fff;padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">💬 WA</a>` : ''}
              <a href="${mapsUrl}" target="_blank" style="background:#4285F4;color:#fff;padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">📍 Maps</a>
              ${t.website ? `<a href="${t.website}" target="_blank" style="background:${K.coralLight};color:${K.coral};padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">🌐 Web</a>` : ''}
            </div></div>`)
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([t.lon!, t.lat!])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    }

    if (map.isStyleLoaded()) {
      tiendas.filter(t => t.lat && t.lon).forEach(place)
    } else {
      map.once('load', () => tiendas.filter(t => t.lat && t.lon).forEach(place))
    }
  }, [tiendas])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${K.line}` }} />
}

// ── Página principal ──────────────────────────────────────────────────────────

const PANEL_H = 'calc(100vh - 210px)'

function LocalBusinessPage() {
  const { barrio, lang } = useBarrio()
  const t = (es: string, en: string) => lang === 'es' ? es : en

  const [grupo,       setGrupo]       = useState<string | null>(null)
  const [categoria,   setCategoria]   = useState<string | undefined>(undefined)
  const [soloTop,     setSoloTop]     = useState(false)
  const [conWhatsapp, setConWhatsapp] = useState(false)
  const [page,        setPage]        = useState(0)

  const reset = () => setPage(0)

  const PAGE_SIZE   = 20
  const grupoActual = grupo ? (GRUPOS_TIENDAS.find(g => g.key === grupo) ?? null) : null
  const barrioParms = { barrio_id: barrio.barrio_id ?? undefined, municipio_nombre: barrio.municipio_nombre }

  const { data: counts } = useGrupoCounts(barrioParms)

  // Destacados — un solo negocio por categoría
  const { data: featuredData } = useTiendas({ ...barrioParms, destacado: true, limit: 20, offset: 0 })
  const featured = (() => {
    const all = featuredData?.tiendas ?? []
    const seen = new Set<string>()
    return all.filter(t => {
      const key = t.categoria ?? '__none'
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  const filterParms = {
    ...barrioParms,
    grupo:        grupo ?? undefined,
    categoria,
    rating_min:   soloTop ? 4.8 : undefined,
    con_whatsapp: conWhatsapp || undefined,
  }

  // Lista paginada
  const { data, isLoading } = useTiendas({ ...filterParms, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  // Mapa — todos los resultados filtrados (sin paginación)
  const { data: mapData } = useTiendas({ ...filterParms, limit: 500, offset: 0 })

  const tiendas    = data?.tiendas ?? []
  const mapTiendas = mapData?.tiendas ?? []
  const total      = data?.total ?? 0
  const pages      = Math.ceil(total / PAGE_SIZE)
  const hasArea    = !!(barrio.barrio_id || barrio.municipio_nombre)

  return (
    <>
      {/* ── Header ── */}
      <div style={{ padding: '2rem 2rem 1.5rem', background: '#FAF7F2', borderBottom: '0.5px solid #E8E0D0' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9B8B75', margin: '0 0 4px' }}>
            {barrio.nombre} · Medellín
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: K.serif, fontSize: 28, fontWeight: 700, color: '#1A1208', margin: '0 0 4px' }}>
                {t('Negocios locales', 'Local Businesses')}
              </h1>
              <p style={{ fontSize: 13, color: '#6B5B45', margin: 0 }}>
                {isLoading ? '…' : `${total} ${t('negocios en', 'businesses in')} ${barrio.nombre}`}
              </p>
            </div>
            <a
              href="/negocios/unirse"
              style={{
                background: K.teal, color: '#fff', fontWeight: 700,
                fontSize: 13, padding: '9px 18px', borderRadius: 8,
                textDecoration: 'none', letterSpacing: '.3px', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(29,158,117,.25)',
              }}
            >
              {t('Ingresar mi negocio →', 'List my business →')}
            </a>
          </div>
        </div>
      </div>

      {/* ── Destacados — fila horizontal (negocios que pagan) ── */}
      {featured.length > 0 && (
        <section style={{ background: '#FAF7F2', borderBottom: '0.5px solid #E8E0D0', padding: '18px 2rem' }}>
          <div style={{ maxWidth: 1440, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontFamily: K.serif, fontSize: 17, fontWeight: 700, color: K.ink, margin: 0 }}>
                {t('Negocios Destacados', 'Featured Businesses')}
              </h2>
              <span style={{ fontSize: 10, color: '#9B8B75', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {t('Patrocinado', 'Sponsored')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {featured.map(neg => (
                <div key={neg.id} style={{ minWidth: 220, maxWidth: 220, flexShrink: 0 }}>
                  <BusinessCardDirectory tienda={neg} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Filtros ── */}
      <div style={{ padding: '1rem 2rem', borderBottom: '0.5px solid #E8E0D0', background: '#FAF7F2' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          {/* Grupos */}
          <div className="filtros-tabs" style={{ display: 'flex', gap: 8, marginBottom: grupoActual ? 10 : 0, flexWrap: 'wrap' }}>
            <button onClick={() => { setGrupo(null); setCategoria(undefined); reset() }} style={{
              background: !grupo ? '#1A1208' : 'transparent', color: !grupo ? '#FAF7F2' : '#6B5B45',
              border: '0.5px solid #E8E0D0', borderRadius: 20, padding: '6px 16px',
              fontSize: 13, fontWeight: !grupo ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              {t('Todos', 'All')}
              {counts && <span style={{ marginLeft: 5, fontSize: 11, opacity: .7 }}>
                {Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()}
              </span>}
            </button>
            {GRUPOS_TIENDAS.map(g => (
              <button key={g.key} onClick={() => { setGrupo(g.key); setCategoria(undefined); reset() }} style={{
                background: grupo === g.key ? '#1A1208' : 'transparent', color: grupo === g.key ? '#FAF7F2' : '#6B5B45',
                border: '0.5px solid #E8E0D0', borderRadius: 20, padding: '6px 16px',
                fontSize: 13, fontWeight: grupo === g.key ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>
                {g.emoji} {lang === 'es' ? g.label : g.labelEn}
                {counts?.[g.key] != null && (
                  <span style={{ marginLeft: 5, fontSize: 11, opacity: .7 }}>{counts[g.key].toLocaleString()}</span>
                )}
              </button>
            ))}
          </div>

          {/* Subcategorías */}
          {grupoActual && (
            <div className="filtros-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[{ key: undefined as string | undefined, label: t('Todos', 'All') },
                ...grupoActual.categorias.map(c => ({ key: c.key, label: `${c.emoji} ${lang === 'es' ? c.label : c.labelEn}` }))
              ].map(({ key, label }) => (
                <button key={key ?? '__all'} onClick={() => { setCategoria(key); reset() }} style={{
                  background: categoria === key ? K.amarillo : '#F5F0E8', color: categoria === key ? '#1A1208' : '#6B5B45',
                  border: '0.5px solid #E8E0D0', borderRadius: 16, padding: '4px 12px',
                  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Filtros adicionales */}
          <div className="filtros-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '0.5px solid #E8E0D0', paddingTop: 10 }}>
            <button onClick={() => { setSoloTop(v => !v); reset() }} style={{
              background: soloTop ? K.amarillo : 'transparent', color: soloTop ? '#1A1208' : '#6B5B45',
              border: `1.5px solid ${soloTop ? K.amarillo : '#E8E0D0'}`, borderRadius: 20,
              padding: '5px 14px', fontSize: 12, fontWeight: soloTop ? 700 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              ⭐ {t('Solo 5 estrellas', '5-star only')}
            </button>
            <button onClick={() => { setConWhatsapp(v => !v); reset() }} style={{
              background: conWhatsapp ? '#25D366' : 'transparent', color: conWhatsapp ? '#fff' : '#6B5B45',
              border: `1.5px solid ${conWhatsapp ? '#25D366' : '#E8E0D0'}`, borderRadius: 20,
              padding: '5px 14px', fontSize: 12, fontWeight: conWhatsapp ? 700 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              💬 {t('Con WhatsApp', 'Has WhatsApp')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Lista + Mapa ── */}
      <div className="negocios-panel" style={{ display: 'flex', height: PANEL_H, overflow: 'hidden' }}>

        {/* Lista — izquierda, scrollable */}
        <div className="negocios-lista" style={{ flex: '0 0 400px', overflowY: 'auto', borderRight: `0.5px solid ${K.line}`, background: '#fff' }}>
          {isLoading && (
            <p style={{ color: K.muted, padding: '2rem' }}>{t('Cargando…', 'Loading…')}</p>
          )}

          {!isLoading && !hasArea && (
            <div style={{ textAlign: 'center', padding: '60px 2rem' }}>
              <p style={{ fontFamily: K.serif, fontSize: '1.2rem', color: K.muted }}>
                {t(`Próximamente en ${barrio.nombre}.`, `Coming soon to ${barrio.nombre}.`)}
              </p>
            </div>
          )}

          {!isLoading && hasArea && tiendas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 2rem' }}>
              <p style={{ color: K.muted, marginBottom: 12 }}>{t('Sin resultados.', 'No results.')}</p>
              <a href="#" style={{ color: K.coral, fontWeight: 700, textDecoration: 'none' }}>
                {t('Publicar mi negocio →', 'List my business →')}
              </a>
            </div>
          )}

          {!isLoading && hasArea && tiendas.length > 0 && (
            <>
              <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${K.line}`, fontSize: 12, color: K.muted, background: '#FAF7F2' }}>
                {tiendas.length} {t('de', 'of')} {total} {t('negocios', 'businesses')}
              </div>
              {tiendas.map(neg => (
                <div key={neg.id} style={{ borderBottom: `0.5px solid ${K.line}`, padding: '0 14px' }}>
                  <BusinessCardList tienda={neg} />
                </div>
              ))}
              {pages > 1 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '1.25rem' }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
                    padding: '7px 16px', background: page === 0 ? '#F5F0E8' : K.ink,
                    color: page === 0 ? '#9B8B75' : '#FAF7F2',
                    border: 'none', borderRadius: 6, cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                    ← {t('Anterior', 'Prev')}
                  </button>
                  <span style={{ padding: '7px 12px', fontSize: 12, color: K.muted }}>{page + 1} / {pages}</span>
                  <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} style={{
                    padding: '7px 16px', background: page >= pages - 1 ? '#F5F0E8' : K.ink,
                    color: page >= pages - 1 ? '#9B8B75' : '#FAF7F2',
                    border: 'none', borderRadius: 6, cursor: page >= pages - 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                    {t('Siguiente', 'Next')} →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mapa — derecha */}
        <div className="negocios-mapa" style={{ flex: 1, padding: 12, background: K.surface }}>
          <TiendasMap
            tiendas={mapTiendas}
            centerLng={barrio.lon ?? -75.5636}
            centerLat={barrio.lat ?? 6.2087}
          />
        </div>

      </div>
    </>
  )
}
