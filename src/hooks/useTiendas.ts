import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/config/api'

export interface TiendaData {
  id: number
  google_place_id?: string | null
  nombre: string
  descripcion?: string | null
  categoria?: string | null
  barrio_id?: number | null
  barrio_nombre?: string | null
  direccion?: string | null
  telefono?: string | null
  whatsapp?: string | null
  website?: string | null
  foto_url?: string | null
  lat?: number | null
  lon?: number | null
  rating_google?: number | null
  precio_rango?: string | null
  horario?: Record<string, unknown> | null
  destacado: boolean
  verificado: boolean
}

export interface TiendasResp {
  barrio_id: number | null
  municipio?: string | null
  total: number
  tiendas: TiendaData[]
}

export interface TiendasParams {
  barrio_id?: number
  municipio_nombre?: string    // city-level query
  grupo?: string
  categoria?: string
  precio_rango?: string
  limit?: number
  offset?: number
}

export interface GrupoCounts { [grupo: string]: number }

export function useGrupoCounts(params: Pick<TiendasParams, 'barrio_id' | 'municipio_nombre'>) {
  return useQuery<GrupoCounts>({
    queryKey: ['tiendas-counts', params],
    queryFn: async () => {
      let url: string
      if (params.municipio_nombre) {
        url = `${API_BASE_URL}/comunidad/municipio/${encodeURIComponent(params.municipio_nombre)}/tiendas/counts`
      } else if (params.barrio_id) {
        url = `${API_BASE_URL}/comunidad/${params.barrio_id}/tiendas/counts`
      } else {
        return {}
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Error cargando counts')
      return res.json() as Promise<GrupoCounts>
    },
    enabled: !!(params.barrio_id || params.municipio_nombre),
    staleTime: 10 * 60 * 1000,
  })
}

export function useTiendas(params: TiendasParams) {
  return useQuery<TiendasResp | null>({
    queryKey: ['tiendas', params],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (params.grupo)        sp.set('grupo',        params.grupo)
      if (params.categoria)    sp.set('categoria',    params.categoria)
      if (params.precio_rango) sp.set('precio_rango', params.precio_rango)
      if (params.limit  != null) sp.set('limit',  String(params.limit))
      if (params.offset != null) sp.set('offset', String(params.offset))

      let url: string
      if (params.municipio_nombre) {
        url = `${API_BASE_URL}/comunidad/municipio/${encodeURIComponent(params.municipio_nombre)}/tiendas?${sp}`
      } else if (params.barrio_id) {
        url = `${API_BASE_URL}/comunidad/${params.barrio_id}/tiendas?${sp}`
      } else {
        return null
      }

      const res = await fetch(url)
      if (!res.ok) throw new Error('Error cargando tiendas')
      return res.json() as Promise<TiendasResp>
    },
    enabled: !!(params.barrio_id || params.municipio_nombre),
    staleTime: 30 * 60 * 1000,
  })
}
