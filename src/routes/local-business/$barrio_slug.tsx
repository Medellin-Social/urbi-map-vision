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

type ViewMode = 'grid' | 'list' | 'mapa'

// ── Mapa de negocios ──────────────────────────────────────────────────────────

function TiendasMap({ tiendas, centerLng, centerLat }: { tiendas: TiendaData[]; centerLng: number; centerLat: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

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

    tiendas.filter(t => t.lat && t.lon).forEach(tienda => {
      const el = document.createElement('div')
      el.style.cssText = `
        width:28px;height:28px;border-radius:50%;
        background:${K.coral};border:2.5px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;
      `
      el.title = tienda.nombre

      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false, maxWidth: '240px' })
        .setHTML(`
          <div style="font-family:system-ui;padding:4px 2px">
            ${tienda.foto_url ? `<img src="${tienda.foto_url}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:8px" />` : ''}
            <strong style="font-size:.9rem;color:${K.ink}">${tienda.nombre}</strong>
            ${tienda.categoria ? `<div style="font-size:.68rem;color:${K.tealDeep};font-weight:700;text-transform:uppercase;margin:2px 0">${tienda.categoria}</div>` : ''}
            ${tienda.rating_google ? `<div style="color:${K.amarillo};font-size:.82rem">★ ${tienda.rating_google.toFixed(1)}</div>` : ''}
            ${tienda.direccion ? `<div style="font-size:.72rem;color:${K.muted};margin-top:4px">${tienda.direccion}</div>` : ''}
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              ${tienda.whatsapp || tienda.telefono ? `<a href="https://wa.me/57${(tienda.whatsapp || tienda.telefono || '').replace(/\D/g,'')}" target="_blank" style="background:#25D366;color:#fff;padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">💬 WA</a>` : ''}
              <a href="https://www.google.com/maps/search/?api=1&query=${tienda.lat},${tienda.lon}" target="_blank" style="background:#4285F4;color:#fff;padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">📍 Maps</a>
              ${tienda.website ? `<a href="${tienda.website}" target="_blank" style="background:${K.coralLight};color:${K.coral};padding:4px 10px;border-radius:999px;text-decoration:none;font-size:.7rem;font-weight:700">🌐 Web</a>` : ''}
            </div>
          </div>
        `)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([tienda.lon!, tienda.lat!])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [tiendas])

  return (
    <div ref={containerRef} style={{ width: '100%', height: 520, borderRadius: 16, overflow: 'hidden', border: `1px solid ${K.line}` }} />
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

function LocalBusinessPage() {
  const { barrio, lang } = useBarrio()
  const t = (es: string, en: string) => lang === 'es' ? es : en

  const [grupo,     setGrupo]     = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string | undefined>(undefined)
  const [view,      setView]      = useState<ViewMode>('grid')
  const [page,      setPage]      = useState(0)

  const PAGE_SIZE   = 20
  const grupoActual = grupo ? (GRUPOS_TIENDAS.find(g => g.key === grupo) ?? null) : null

  const countsParams = { barrio_id: barrio.barrio_id ?? undefined, municipio_nombre: barrio.municipio_nombre }
  const { data: counts } = useGrupoCounts(countsParams)

  const { data, isLoading } = useTiendas({
    barrio_id:        barrio.barrio_id ?? undefined,
    municipio_nombre: barrio.municipio_nombre,
    grupo:            grupo ?? undefined,
    categoria,
    limit:  PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const tiendas = data?.tiendas ?? []
  const total   = data?.total ?? 0
  const pages   = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      {/* Header */}
      <div style={{ background: K.surface, borderBottom: `1px solid ${K.line}`, padding: '36px 26px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: K.teal, fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 8px' }}>
            Local Business
          </p>
          <h1 style={{ fontFamily: K.serif, fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', letterSpacing: '-.5px', color: K.ink, margin: '0 0 6px' }}>
            {t(`En ${barrio.nombre}`, `In ${barrio.nombre}`)}
          </h1>
          <p style={{ color: K.muted, fontSize: '1rem', margin: 0 }}>
            {t('Directorio local curado por la comunidad.', 'Local directory curated by the community.')}
            {total > 0 && <span style={{ marginLeft: 8, fontWeight: 700, color: K.teal }}>{total} {t('negocios', 'businesses')}</span>}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 26px' }}>
        {/* Grupo tabs */}
        <div style={{ display: 'flex', borderBottom: `2px solid ${K.line}`, marginBottom: grupoActual ? 16 : 28, overflowX: 'auto', gap: 0 }}>
          {/* Tab "Todos" */}
          <button onClick={() => { setGrupo(null); setCategoria(undefined); setPage(0) }} style={{
            border: 'none', background: 'transparent',
            borderBottom: grupo === null ? `3px solid ${K.coral}` : '3px solid transparent',
            color: grupo === null ? K.coral : K.muted,
            fontWeight: 700, fontSize: '.88rem', padding: '10px 18px',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginBottom: -2,
          }}>
            {t('Todos', 'All')}
            {counts && <span style={{ marginLeft: 5, fontSize: '.72rem', opacity: .7 }}>
              {Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()}
            </span>}
          </button>
          {GRUPOS_TIENDAS.map(g => (
            <button key={g.key} onClick={() => { setGrupo(g.key); setCategoria(undefined); setPage(0) }} style={{
              border: 'none', background: 'transparent',
              borderBottom: grupo === g.key ? `3px solid ${K.coral}` : '3px solid transparent',
              color: grupo === g.key ? K.coral : K.muted,
              fontWeight: 700, fontSize: '.88rem', padding: '10px 18px',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginBottom: -2,
            }}>
              {g.emoji} {lang === 'es' ? g.label : g.key}
              {counts?.[g.key] != null && (
                <span style={{ marginLeft: 5, fontSize: '.72rem', opacity: .7 }}>
                  {counts[g.key].toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Subcategorías — solo cuando hay grupo activo */}
        {grupoActual && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
            {[{ key: undefined, label: t('Todos', 'All') }, ...grupoActual.categorias.map(c => ({ key: c.key, label: `${c.emoji} ${lang === 'es' ? c.label : c.key}` }))].map(({ key, label }) => (
              <button key={key ?? '__all'} onClick={() => { setCategoria(key); setPage(0) }} style={{
                border: categoria === key ? `2px solid ${K.teal}` : `2px solid ${K.line}`,
                background: categoria === key ? K.tealDeep + '18' : 'transparent',
                color: categoria === key ? K.tealDeep : K.muted,
                fontWeight: 700, fontSize: '.78rem', padding: '5px 14px', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ color: K.muted, fontSize: '.88rem' }}>
            {isLoading ? '…' : `${tiendas.length} de ${total}`}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['grid', 'list', 'mapa'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setView(m)} style={{
                border: `2px solid ${K.line}`,
                background: view === m ? K.ink : 'transparent',
                color: view === m ? '#fff' : K.muted,
                fontWeight: 700, fontSize: '.78rem', padding: '5px 12px', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {m === 'grid' ? '▦' : m === 'list' ? '☰' : '🗺'}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p style={{ color: K.muted }}>{t('Cargando…', 'Loading…')}</p>}

        {!isLoading && !barrio.barrio_id && !barrio.municipio_nombre && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: K.serif, fontSize: '1.3rem', color: K.muted }}>
              {t(`Próximamente en ${barrio.nombre}.`, `Coming soon to ${barrio.nombre}.`)}
            </p>
          </div>
        )}

        {!isLoading && (barrio.barrio_id || barrio.municipio_nombre) && (
          tiendas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <a href="#" style={{ color: K.coral, fontWeight: 700, textDecoration: 'none', fontSize: '1.05rem' }}>
                {t('Sé el primero en listar tu negocio →', 'Be the first to list your business →')}
              </a>
            </div>
          ) : view === 'mapa' ? (
            <TiendasMap tiendas={tiendas} centerLng={barrio.lon ?? -75.5636} centerLat={barrio.lat ?? 6.2087} />
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 18 }}>
              {tiendas.map(t => <BusinessCardDirectory key={t.id} tienda={t} />)}
            </div>
          ) : (
            <div>{tiendas.map(t => <BusinessCardList key={t.id} tienda={t} />)}</div>
          )
        )}

        {pages > 1 && view !== 'mapa' && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 40 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ border: `2px solid ${K.line}`, background: 'transparent', color: K.muted, padding: '8px 18px', borderRadius: 999, cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: page === 0 ? .4 : 1 }}>
              ← {t('Anterior', 'Previous')}
            </button>
            <span style={{ padding: '8px 14px', color: K.muted, fontSize: '.9rem' }}>{page + 1} / {pages}</span>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} style={{ border: `2px solid ${K.line}`, background: 'transparent', color: K.muted, padding: '8px 18px', borderRadius: 999, cursor: page >= pages - 1 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: page >= pages - 1 ? .4 : 1 }}>
              {t('Siguiente', 'Next')} →
            </button>
          </div>
        )}
      </div>
    </>
  )
}
