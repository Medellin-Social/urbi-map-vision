import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'

export interface SocioListing {
  id: number
  url: string
  tipo_operacion: string | null
  tipo_inmueble: string | null
  precio_cop: number | null
  area_m2: number | null
  habitaciones: number | null
  banos: number | null
  barrio: string | null
  foto_principal: string | null
}

export function useSocioCasadolcecasa(limit = 6) {
  return useQuery<SocioListing[]>({
    queryKey: ['socio-casadolcecasa', limit],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/listings/socio-casadolcecasa?limit=${limit}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })
}
