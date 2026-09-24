import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'

export interface HotspotData {
  id: number
  categoria_experiencia: string
  descripcion: string
  tienda_nombre: string
  foto_url: string | null
  lat: number | null
  lon: number | null
  barrio_nombre: string | null
}

export function useHotspots(ciudad_id = 1, barrio_id?: number | null, municipio?: string) {
  return useQuery<HotspotData[]>({
    queryKey: ['hotspots', ciudad_id, barrio_id ?? null, municipio ?? null],
    queryFn: async () => {
      const sp = new URLSearchParams({ ciudad_id: String(ciudad_id) })
      if (barrio_id) sp.set('barrio_id', String(barrio_id))
      else if (municipio) sp.set('municipio', municipio)
      const res = await fetch(`${API_BASE_URL}/business/hotspots?${sp}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.hotspots ?? []
    },
    staleTime: 30 * 60 * 1000,
  })
}
