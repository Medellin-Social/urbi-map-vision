import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ComunidadLayout } from '@/components/comunidad/ComunidadLayout'
import { useBarrio } from '@/components/comunidad/BarrioContext'
import { BusinessCardDirectory, BusinessCardList } from '@/components/comunidad/BusinessCard'
import { useTiendas, useGrupoCounts } from '@/hooks/useTiendas'
import { useBarriosRaw } from '@/hooks/useBarrios'
import { GRUPOS_TIENDAS } from '@/lib/categorias_comunidad'
import { MAPBOX_TOKEN } from '@/lib/mapboxToken'
import { API_ENDPOINTS } from '@/config/api'
import { apiFetch } from '@/lib/apiClient'

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

// ── Mapa de zonas — mismo sistema visual y de niveles que MapView (/map): ──────
// comunas (relleno ámbar + burbuja de conteo) → click → barrios de esa comuna
// (mismos colores/paint que MapView) → click en un barrio → pines de sus
// negocios (mismo marker/popup que el mapa de pines anterior). Todo en el mapa,
// sin navegar de página — el selector de zona de la barra sigue siendo el <select>.
// ponytail: sin el pitch/terreno 3D del comuna-view de MapView — panel embebido
// y corto, el 3D solo restaría alto útil; drop si algún día se quiere igualar 1:1.

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const ZONAS_GEOJSON = [
  '/data/comunas_medellin.geojson',
  '/data/comunas_bello.geojson',
  '/data/comunas_envigado.geojson',
  '/data/comunas_itagui.geojson',
  '/data/comunas_la_estrella.geojson',
  '/data/comunas_sabaneta.geojson',
]

function ringsOf(geom: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geom.type === 'Polygon') return geom.coordinates
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat()
  return []
}

function boundsOf(geom: GeoJSON.Geometry): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds()
  ringsOf(geom).forEach(ring => ring.forEach(pos => bounds.extend(pos as [number, number])))
  return bounds
}

function NegociosMap() {
  const containerRef      = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<mapboxgl.Map | null>(null)
  const markersRef        = useRef<mapboxgl.Marker[]>([])
  const staticFeaturesRef = useRef<GeoJSON.Feature[]>([])
  const hoverComunaRef    = useRef<number | string | undefined>(undefined)
  const hoverBarrioRef    = useRef<number | string | undefined>(undefined)
  const selectedBarrioRef = useRef<number | string | undefined>(undefined)

  const [level, setLevel]               = useState<'comunas' | 'barrios'>('comunas')
  const [activeComuna, setActiveComuna] = useState<{ cd: number; nombre: string; municipio: string } | null>(null)
  const [activeBarrioId, setActiveBarrioId] = useState<number | null>(null)

  const { data: barriosRaw } = useBarriosRaw()
  const { data: barrioTiendas } = useTiendas({ barrio_id: activeBarrioId ?? undefined, limit: 500, offset: 0 })

  function goToComunas() {
    const map = mapRef.current
    if (!map) return
    const setVis = (id: string, v: 'visible' | 'none') => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v) }
    setVis('comunas-fill', 'visible'); setVis('comunas-line', 'visible'); setVis('comunas-label', 'visible')
    setVis('comunas-bubble-circle', 'visible'); setVis('comunas-bubble-count', 'visible')
    setVis('barrios-fill', 'none'); setVis('barrios-line', 'none'); setVis('barrios-label', 'none')
    const bounds = new mapboxgl.LngLatBounds()
    staticFeaturesRef.current.forEach(f => { const b = boundsOf(f.geometry); if (!b.isEmpty()) { bounds.extend(b.getSouthWest()); bounds.extend(b.getNorthEast()) } })
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 16, duration: 400 })
    setLevel('comunas')
    setActiveComuna(null)
    setActiveBarrioId(null)
  }

  // ── Init del mapa (una sola vez) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-75.5812, 6.2442],
      zoom: 10.4,
      minZoom: 9.3,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', async () => {
      // Base limpia — igual a MapView.tsx: POIs/carreteras ocultos, agua/edificios apagados.
      map.getStyle().layers.forEach((layer) => {
        const srcLayer = (layer as Record<string, unknown>)['source-layer'] as string | undefined
        if (layer.type === 'symbol') {
          const layout = (layer as mapboxgl.SymbolLayer).layout
          const lid = layer.id.toLowerCase()
          const hide = (layout && 'icon-image' in layout) ||
            ['road', 'street', 'transit', 'poi', 'airport', 'ferry', 'neighborhood', 'suburb', 'district', 'quarter']
              .some(k => lid.includes(k))
          if (hide) map.setLayoutProperty(layer.id, 'visibility', 'none')
        } else if (layer.type === 'fill' && srcLayer === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#C8DFE8')
        } else if (layer.type === 'line' && srcLayer === 'waterway') {
          map.setPaintProperty(layer.id, 'line-color', '#C8DFE8')
        } else if (layer.type === 'fill' && srcLayer === 'building') {
          map.setPaintProperty(layer.id, 'fill-color', '#EDE8E0')
          map.setPaintProperty(layer.id, 'fill-opacity', 0.45)
        } else if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#FAF7F2')
        }
      })

      try {
        const [fcs, counts] = await Promise.all([
          Promise.all(ZONAS_GEOJSON.map(f => fetch(f).then(r => r.json()).catch(() => EMPTY_FC))) as Promise<GeoJSON.FeatureCollection[]>,
          apiFetch<{ counts: Record<string, number> }>(API_ENDPOINTS.comunasTiendasCounts).then(r => r.counts).catch(() => ({} as Record<string, number>)),
        ])
        const features = fcs.flatMap(fc => fc.features ?? [])
        staticFeaturesRef.current = features

        // ── Comunas — mismo paint que MapView.tsx (comunas-fill/line/label) ──
        map.addSource('comunas', { type: 'geojson', data: { type: 'FeatureCollection', features }, generateId: true })
        map.addLayer({
          id: 'comunas-fill', type: 'fill', source: 'comunas',
          paint: { 'fill-color': '#DAB33C', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.45, 0.25] },
        })
        map.addLayer({
          id: 'comunas-line', type: 'line', source: 'comunas',
          paint: { 'line-color': '#002776', 'line-opacity': 0.6, 'line-width': 2 },
        })
        map.addLayer({
          id: 'comunas-label', type: 'symbol', source: 'comunas',
          layout: { 'text-field': ['get', 'nombre'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.06 },
          paint: { 'text-color': '#1A1208', 'text-halo-color': '#FAF7F2', 'text-halo-width': 2 },
        })

        // Burbuja de conteo por comuna — mismo esquema que listings-mls-clusters.
        const bubbles: GeoJSON.Feature[] = features
          .map(f => {
            const cd = f.properties?.cd_comuna as number | undefined
            const count = cd != null ? counts[String(cd)] ?? 0 : 0
            const c = boundsOf(f.geometry).getCenter()
            return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] }, properties: { count } }
          })
          .filter(f => f.properties.count > 0)
        map.addSource('comunas-bubble', { type: 'geojson', data: { type: 'FeatureCollection', features: bubbles } })
        map.addLayer({
          id: 'comunas-bubble-circle', type: 'circle', source: 'comunas-bubble',
          paint: {
            'circle-color': ['step', ['get', 'count'], '#1D9E75', 500, '#085041', 2000, '#1A1208'],
            'circle-radius': ['step', ['get', 'count'], 13, 500, 18, 2000, 24],
            'circle-opacity': 0.88, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(29,158,117,0.3)',
          },
        })
        map.addLayer({
          id: 'comunas-bubble-count', type: 'symbol', source: 'comunas-bubble',
          layout: { 'text-field': ['get', 'count'], 'text-size': 11, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'] },
          paint: { 'text-color': '#ffffff' },
        })

        // ── Barrios — mismo paint que MapView.tsx (barrios-mls-fill/line/label) ──
        map.addSource('barrios', { type: 'geojson', data: EMPTY_FC })
        map.addLayer({
          id: 'barrios-fill', type: 'fill', source: 'barrios', layout: { visibility: 'none' },
          paint: { 'fill-color': '#002776', 'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.10, 0] },
        })
        map.addLayer({
          id: 'barrios-line', type: 'line', source: 'barrios', layout: { visibility: 'none' },
          paint: {
            'line-color': '#002776',
            'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.7, 0.4],
            'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1],
          },
        })
        map.addLayer({
          id: 'barrios-label', type: 'symbol', source: 'barrios', layout: {
            visibility: 'none', 'text-field': ['get', 'nombre'], 'text-size': 10,
            'text-transform': 'uppercase', 'text-letter-spacing': 0.05,
          },
          paint: { 'text-color': '#1A1208', 'text-halo-color': '#FAF7F2', 'text-halo-width': 1.5 },
        })

        const bounds = new mapboxgl.LngLatBounds()
        features.forEach(f => { const b = boundsOf(f.geometry); if (!b.isEmpty()) { bounds.extend(b.getSouthWest()); bounds.extend(b.getNorthEast()) } })
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 16, duration: 0 })
      } catch (err) {
        console.error('[NegociosMap] failed to load zonas', err)
      }
    })

    // Hover comuna
    map.on('mousemove', 'comunas-fill', (e) => {
      if (!e.features?.length) return
      if (hoverComunaRef.current !== undefined) map.setFeatureState({ source: 'comunas', id: hoverComunaRef.current }, { hover: false })
      hoverComunaRef.current = e.features[0].id as number | string
      map.setFeatureState({ source: 'comunas', id: hoverComunaRef.current }, { hover: true })
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'comunas-fill', () => {
      if (hoverComunaRef.current !== undefined) map.setFeatureState({ source: 'comunas', id: hoverComunaRef.current }, { hover: false })
      hoverComunaRef.current = undefined
      map.getCanvas().style.cursor = ''
    })
    map.on('click', 'comunas-fill', (e) => {
      const f = e.features?.[0]
      if (!f) return
      const cd = f.properties?.cd_comuna as number
      const nombre = (f.properties?.nombre ?? '') as string
      const municipio = (f.properties?.municipio ?? '') as string
      const full = staticFeaturesRef.current.find(sf => sf.properties?.nombre === nombre) ?? f
      const setVis = (id: string, v: 'visible' | 'none') => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v) }
      setVis('comunas-fill', 'none'); setVis('comunas-line', 'none'); setVis('comunas-label', 'none')
      setVis('comunas-bubble-circle', 'none'); setVis('comunas-bubble-count', 'none')
      setVis('barrios-fill', 'visible'); setVis('barrios-line', 'visible'); setVis('barrios-label', 'visible')
      map.fitBounds(boundsOf(full.geometry), { padding: 40, duration: 450 })
      setLevel('barrios')
      setActiveComuna({ cd, nombre, municipio })
      setActiveBarrioId(null)
    })

    // Hover + click barrio
    map.on('mousemove', 'barrios-fill', (e) => {
      if (!e.features?.length) return
      map.getCanvas().style.cursor = 'pointer'
      const id = e.features[0].id as number
      if (hoverBarrioRef.current !== undefined && hoverBarrioRef.current !== id) {
        map.setFeatureState({ source: 'barrios', id: hoverBarrioRef.current }, { hover: false })
      }
      hoverBarrioRef.current = id
      map.setFeatureState({ source: 'barrios', id }, { hover: true })
    })
    map.on('mouseleave', 'barrios-fill', () => {
      map.getCanvas().style.cursor = ''
      if (hoverBarrioRef.current !== undefined) map.setFeatureState({ source: 'barrios', id: hoverBarrioRef.current }, { hover: false })
      hoverBarrioRef.current = undefined
    })
    map.on('click', 'barrios-fill', (e) => {
      const f = e.features?.[0]
      if (!f) return
      if (selectedBarrioRef.current !== undefined) map.setFeatureState({ source: 'barrios', id: selectedBarrioRef.current }, { selected: false })
      selectedBarrioRef.current = f.id as number
      map.setFeatureState({ source: 'barrios', id: selectedBarrioRef.current }, { selected: true })
      map.fitBounds(boundsOf(f.geometry), { padding: 60, maxZoom: 15, duration: 400 })
      setActiveBarrioId(f.properties?.barrio_id as number)
    })

    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poblar polígonos de barrio de la comuna/municipio activo (mismo criterio que
  // useBarriosRaw: Medellín filtra por cd_comuna, municipios por nombre).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeComuna || !barriosRaw) return
    const src = map.getSource('barrios') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    const isMedellin = activeComuna.municipio.toUpperCase() === 'MEDELLIN'
    const feats = barriosRaw
      .filter(b => b.geometry && (b.municipio ?? '').toUpperCase() === activeComuna.municipio.toUpperCase()
        && (!isMedellin || b.cd_comuna === activeComuna.cd))
      .map(b => ({
        type: 'Feature' as const, id: b.barrio_id, geometry: b.geometry as GeoJSON.Geometry,
        properties: { barrio_id: b.barrio_id, nombre: b.nombre ?? '' },
      }))
    src.setData({ type: 'FeatureCollection', features: feats })
  }, [activeComuna, barriosRaw])

  // Pines de negocios del barrio elegido — mismo marker/popup que el mapa de pines anterior.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    const list = (barrioTiendas?.tiendas ?? []).filter(t => t.lat && t.lon)

    const place = () => {
      list.forEach(t => {
        const el = document.createElement('div')
        el.style.cssText = `width:26px;height:26px;border-radius:50%;background:${K.coral};
          border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;`
        el.title = t.nombre
        const mapsUrl = t.google_place_id
          ? `https://www.google.com/maps/place/?q=place_id:${t.google_place_id}`
          : `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}`
        const wa = t.whatsapp || t.telefono
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: false, maxWidth: '240px' })
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
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([t.lon!, t.lat!]).setPopup(popup).addTo(map)
        markersRef.current.push(marker)
      })
    }
    if (map.isStyleLoaded()) place(); else map.once('load', place)
  }, [barrioTiendas])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${K.line}` }} />
      {level === 'barrios' && (
        <button onClick={goToComunas} style={{
          position: 'absolute', top: 10, left: 10, zIndex: 5,
          background: '#fff', border: `1px solid ${K.line}`, borderRadius: 8,
          padding: '7px 12px', fontSize: 12, fontWeight: 700, color: K.ink,
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        }}>
          ← {activeComuna?.nombre ?? 'Comunas'}
        </button>
      )}
    </div>
  )
}

// ── Filtros — pills reutilizables (mismo lenguaje visual que /eventos) ─────────

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: ReactNode }) {
  return (
    <button onClick={onClick} style={{
      border: active ? `1.5px solid ${K.teal}` : `1.5px solid ${K.line}`,
      background: active ? K.teal : '#fff',
      color: active ? '#fff' : K.muted,
      fontWeight: 600, fontSize: 13, padding: '7px 14px',
      borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
      whiteSpace: 'nowrap', flexShrink: 0, transition: 'border-color .12s, background .12s, color .12s',
    }}>{label}</button>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: K.tealDeep,
      textTransform: 'uppercase', letterSpacing: '.07em',
      marginBottom: 8, display: 'block',
    }}>{children}</span>
  )
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
  const anyFilterActive = !!grupo || soloTop || conWhatsapp
  const clearAllFilters = () => {
    setGrupo(null); setCategoria(undefined); setSoloTop(false); setConWhatsapp(false); reset()
  }

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

  const tiendas    = data?.tiendas ?? []
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
          <div style={{
            background: '#fff', border: `1px solid ${K.line}`, borderRadius: 14,
            padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {/* Categoría — grupos + subcategorías */}
            <div>
              <GroupLabel>{t('Categoría', 'Category')}</GroupLabel>
              <div className="filtros-tabs" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                <Pill active={!grupo} onClick={() => { setGrupo(null); setCategoria(undefined); reset() }} label={<>
                  {t('Todos', 'All')}
                  {counts && <span style={{ marginLeft: 5, opacity: .75 }}>{Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()}</span>}
                </>} />
                {GRUPOS_TIENDAS.map(g => (
                  <Pill key={g.key} active={grupo === g.key} onClick={() => { setGrupo(g.key); setCategoria(undefined); reset() }} label={<>
                    {g.emoji} {lang === 'es' ? g.label : g.labelEn}
                    {counts?.[g.key] != null && <span style={{ marginLeft: 5, opacity: .75 }}>{counts[g.key].toLocaleString()}</span>}
                  </>} />
                ))}
              </div>

              {grupoActual && (
                <div className="filtros-tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {[{ key: undefined as string | undefined, label: t('Todos', 'All') },
                    ...grupoActual.categorias.map(c => ({ key: c.key, label: `${c.emoji} ${lang === 'es' ? c.label : c.labelEn}` }))
                  ].map(({ key, label }) => (
                    <button key={key ?? '__all'} onClick={() => { setCategoria(key); reset() }} style={{
                      background: categoria === key ? K.tealDeep : '#F5F0E8', color: categoria === key ? '#fff' : K.muted,
                      border: `1px solid ${categoria === key ? K.tealDeep : K.line}`, borderRadius: 999,
                      padding: '4px 12px', fontSize: 12, fontWeight: categoria === key ? 600 : 400,
                      cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Extra + limpiar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
              paddingTop: 14, borderTop: `1px solid ${K.line}`,
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => { setSoloTop(v => !v); reset() }} style={{
                  background: soloTop ? K.amarillo : '#fff', color: soloTop ? '#1A1208' : K.muted,
                  border: `1.5px solid ${soloTop ? K.amarillo : K.line}`, borderRadius: 999,
                  padding: '7px 14px', fontSize: 13, fontWeight: soloTop ? 700 : 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>
                  ⭐ {t('Solo 5 estrellas', '5-star only')}
                </button>
                <button onClick={() => { setConWhatsapp(v => !v); reset() }} style={{
                  background: conWhatsapp ? '#25D366' : '#fff', color: conWhatsapp ? '#fff' : K.muted,
                  border: `1.5px solid ${conWhatsapp ? '#25D366' : K.line}`, borderRadius: 999,
                  padding: '7px 14px', fontSize: 13, fontWeight: conWhatsapp ? 700 : 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>
                  💬 {t('Con WhatsApp', 'Has WhatsApp')}
                </button>
              </div>
              {anyFilterActive && (
                <button onClick={clearAllFilters} style={{
                  border: 'none', background: 'none', color: K.coral,
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 2px',
                }}>
                  {t('Limpiar filtros ✕', 'Clear filters ✕')}
                </button>
              )}
            </div>
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
          <NegociosMap />
        </div>

      </div>
    </>
  )
}
