import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Barrio {
  slug: string
  nombre: string
  barrio_id: number | null
  municipio_nombre?: string
  lat?: number
  lon?: number
  zoom?: number
  grupo?: 'Medellín' | 'Valle de Aburrá'
}

export const BARRIOS: Barrio[] = [
  // ── Medellín ──
  { slug: 'el-poblado',    nombre: 'El Poblado',    barrio_id: 236,  lat: 6.2087,    lon: -75.5636,  zoom: 13.5, grupo: 'Medellín' },
  { slug: 'laureles',      nombre: 'Laureles',      barrio_id: 190,  lat: 6.2376,    lon: -75.5904,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'belen',         nombre: 'Belén',         barrio_id: 101,  lat: 6.2200,    lon: -75.6050,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'robledo',       nombre: 'Robledo',       barrio_id: 45,   lat: 6.2830,    lon: -75.5930,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'aranjuez',      nombre: 'Aranjuez',      barrio_id: 148,  lat: 6.2870,    lon: -75.5590,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'castilla',      nombre: 'Castilla',      barrio_id: 21,   lat: 6.3000,    lon: -75.5760,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'manrique',      nombre: 'Manrique',      barrio_id: 168,  lat: 6.2790,    lon: -75.5460,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'buenos-aires',  nombre: 'Buenos Aires',  barrio_id: 213,  lat: 6.2400,    lon: -75.5490,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'la-candelaria', nombre: 'La Candelaria', barrio_id: 191,  lat: 6.2488,    lon: -75.5666,  zoom: 13.5, grupo: 'Medellín' },
  { slug: 'guayabal',      nombre: 'Guayabal',      barrio_id: 115,  lat: 6.2140,    lon: -75.5900,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'san-javier',    nombre: 'San Javier',    barrio_id: 120,  lat: 6.2518,    lon: -75.6100,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'popular',       nombre: 'Popular',       barrio_id: 124,  lat: 6.3100,    lon: -75.5500,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'santa-cruz',    nombre: 'Santa Cruz',    barrio_id: 137,  lat: 6.3000,    lon: -75.5600,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'doce-de-octubre', nombre: 'Doce de Octubre', barrio_id: 35, lat: 6.3050,  lon: -75.5700,  zoom: 13,   grupo: 'Medellín' },
  { slug: 'villa-hermosa', nombre: 'Villa Hermosa', barrio_id: 155,  lat: 6.2600,    lon: -75.5400,  zoom: 13,   grupo: 'Medellín' },
  // ── Valle de Aburrá ──
  { slug: 'todos',       nombre: 'Valle de Aburrá', barrio_id: null, municipio_nombre: 'VALLE DE ABURRÁ', lat: 6.2442, lon: -75.5812, zoom: 11, grupo: 'Valle de Aburrá' },
  { slug: 'envigado',    nombre: 'Envigado',    barrio_id: null, municipio_nombre: 'ENVIGADO',    lat: 6.168114, lon: -75.583401, zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'sabaneta',    nombre: 'Sabaneta',    barrio_id: null, municipio_nombre: 'SABANETA',    lat: 6.152341, lon: -75.614181, zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'itagui',      nombre: 'Itagüí',      barrio_id: null, municipio_nombre: 'ITAGUI',      lat: 6.175830, lon: -75.613499, zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'la-estrella', nombre: 'La Estrella', barrio_id: null, municipio_nombre: 'LA ESTRELLA', lat: 6.1567,   lon: -75.6433,  zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'bello',       nombre: 'Bello',       barrio_id: null, municipio_nombre: 'BELLO',       lat: 6.335248, lon: -75.557424, zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'caldas',      nombre: 'Caldas',      barrio_id: null, municipio_nombre: 'CALDAS',      lat: 6.0941,   lon: -75.6353,  zoom: 13, grupo: 'Valle de Aburrá' },
  { slug: 'copacabana',  nombre: 'Copacabana',  barrio_id: null, municipio_nombre: 'COPACABANA',  lat: 6.3500,   lon: -75.5100,  zoom: 13, grupo: 'Valle de Aburrá' },
]

interface BarrioCtx {
  barrio: Barrio
  barrios: Barrio[]
  lang: 'es' | 'en'
  setLang: (l: 'es' | 'en') => void
  setBarrioSlug: (slug: string) => void
}

const BarrioCtx = createContext<BarrioCtx | null>(null)

export function BarrioProvider({ children, initialSlug }: { children: ReactNode; initialSlug?: string }) {
  const initial = BARRIOS.find(b => b.slug === initialSlug) ?? BARRIOS[0]
  const [barrio, setBarrio] = useState<Barrio>(initial)
  const [lang, setLang] = useState<'es' | 'en'>('es')

  useEffect(() => {
    const found = BARRIOS.find(b => b.slug === initialSlug)
    if (found && found.slug !== barrio.slug) setBarrio(found)
  }, [initialSlug])  // eslint-disable-line react-hooks/exhaustive-deps

  function setBarrioSlug(slug: string) {
    const found = BARRIOS.find(b => b.slug === slug)
    if (found) setBarrio(found)
  }

  return (
    <BarrioCtx.Provider value={{ barrio, barrios: BARRIOS, lang, setLang, setBarrioSlug }}>
      {children}
    </BarrioCtx.Provider>
  )
}

export function useBarrio(): BarrioCtx {
  const ctx = useContext(BarrioCtx)
  if (!ctx) throw new Error('useBarrio outside BarrioProvider')
  return ctx
}
