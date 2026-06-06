import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'

export interface DealData {
  id: number
  tipo_deal: string
  descripcion: string
  categoria: string | null
  tienda_nombre: string
  foto_url: string | null
  lat: number | null
  lon: number | null
  barrio_nombre: string | null
}

export function useDeals(ciudad_id = 1, barrio_id?: number | null) {
  return useQuery<DealData[]>({
    queryKey: ['deals', ciudad_id, barrio_id ?? null],
    queryFn: async () => {
      const sp = new URLSearchParams({ ciudad_id: String(ciudad_id) })
      if (barrio_id) sp.set('barrio_id', String(barrio_id))
      const res = await fetch(`${API_BASE_URL}/business/deals?${sp}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.deals ?? []
    },
    staleTime: 30 * 60 * 1000,
  })
}
