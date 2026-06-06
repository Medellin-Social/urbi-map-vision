import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'

export interface NoticiaData {
  id: number
  titulo: string
  url: string
  fuente: string | null
  fecha_publicacion: string | null
}

export function useNoticias(limit = 4) {
  return useQuery<NoticiaData[]>({
    queryKey: ['noticias', limit],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/comunidad/noticias?limit=${limit}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.noticias ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
}
