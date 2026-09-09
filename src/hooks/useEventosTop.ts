import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'
import type { EventoData } from '@/components/comunidad/EventCard'

export function useEventosTop(barrioId: number | null, municipioNombre: string | undefined, limit = 3) {
  return useQuery<EventoData[]>({
    queryKey: ['eventos-top', barrioId, municipioNombre ?? null],
    queryFn: async () => {
      const url = barrioId
        ? `${API_BASE_URL}/comunidad/${barrioId}/eventos?limit=10`
        : municipioNombre
          ? `${API_BASE_URL}/comunidad/municipio/${encodeURIComponent(municipioNombre)}/eventos?limit=10`
          : `${API_BASE_URL}/comunidad/todos/eventos?limit=10`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      const eventos: EventoData[] = data.eventos ?? []
      return eventos.filter(e => e.destacado).slice(0, limit)
    },
    staleTime: 10 * 60 * 1000,
  })
}
