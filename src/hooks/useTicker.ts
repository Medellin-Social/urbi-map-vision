import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../config/api'

export interface TickerItem {
  tipo: 'noticia' | 'evento'
  titulo: string
  link: string | null
  fecha: string | null
  categoria?: string | null
}

interface TickerResponse {
  ciudad_id: number | null
  total: number
  items: TickerItem[]
}

export function useTicker(ciudadId = 1) {
  return useQuery<TickerItem[]>({
    queryKey: ['ticker', ciudadId],
    queryFn: async () => {
      const res = await fetch(API_ENDPOINTS.ticker(ciudadId))
      if (!res.ok) return []
      const data: TickerResponse = await res.json()
      return data.items ?? []
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  })
}
