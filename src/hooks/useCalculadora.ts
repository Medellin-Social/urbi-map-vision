import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";

export type SimulacionRequest = {
  barrio_id: number;
  presupuesto_cop: number;
  tipo_inversion: "airbnb" | "renta_larga" | "renta_media";
  perfil_riesgo?: "conservador" | "moderado" | "agresivo";
  horizonte_anos?: number;
  // Legacy profile fields
  n_unidades?: string;
  tipo_gestion?: string;
  target_inquilino?: string;
  amoblado?: string;
  tipo_pago?: string;
  horizonte_inversion?: string;
  // Fine-grained expense overrides
  administracion_mes?: number | null;
  vacancia_pct?: number | null;
  mantenimiento_pct?: number | null;
  seguro_pct?: number | null;
  fee_plataforma_pct?: number | null;
  predial_anual?: number | null;
  retencion_fuente?: boolean;
  // Credit
  con_credito?: boolean;
  cuota_inicial_pct?: number;
  tasa_anual_pct?: number;
  plazo_anos?: number;
};

export type FlujoCajaDesglose = {
  ingreso_bruto: number;
  vacancia: number;
  ingreso_post_vacancia: number;
  fee_plataforma?: number | null;
  retencion?: number | null;
  administracion?: number | null;
  mantenimiento?: number | null;
  seguro?: number | null;
  predial?: number | null;
  ingreso_neto: number;
  cuota_credito?: number | null;
  flujo_real?: number | null;
};

export type ComparativoModalidad = {
  tipo: string;
  label: string;
  ingreso_mes?: number | null;
  yield_neto_pct?: number | null;
  recupero_anos?: number | null;
  riesgo: string;
  es_recomendada: boolean;
};

export type ProyeccionPunto = {
  año: number;
  valor_inmueble: number;
  ingresos_acumulados: number;
  roi_pct: number;
};

export type SimulacionResponse = {
  barrio: string;
  presupuesto_cop: number;
  presupuesto_usd: number;
  area_comprable_m2: number;
  tipo_inversion: string;
  ingresos: {
    mensual_cop: number;
    anual_cop: number;
    mensual_usd: number;
    anual_usd: number;
  };
  yields: {
    bruto_pct: number;
    neto_pct: number | null;
  };
  recupero: {
    bruto_anos: number;
    neto_anos: number | null;
  };
  valorizacion: {
    tasa_anual_pct: number;
    fuente_tasa: string;
    valor_3anos_cop: number;
    valor_5anos_cop: number;
    ganancia_5anos_cop: number;
    retorno_total_5anos_cop: number;
  };
  score_oportunidad: number;
  rating_oportunidad: string;
  estado_precio: string | null;
  resumen: string;
  alertas: string[];
  datos_insuficientes: boolean;
  zona_score?: number | null;
  zona_categoria?: string | null;
  ingreso_bruto_mensual?: number | null;
  costo_gestion_mensual?: number | null;
  ingreso_neto_gestion_mensual?: number | null;
  n_unidades_efectivo?: number | null;
  down_payment_cop?: number | null;
  monto_credito_cop?: number | null;
  cuota_mensual?: number | null;
  flujo_neto_mensual?: number | null;
  yield_coc_pct?: number | null;
  recupero_credito_anos?: number | null;
  nota_hipoteca?: string | null;
  costo_amoblado?: number | null;
  presupuesto_efectivo?: number | null;
  valor_20anos_cop?: number | null;
  // New fields
  flujo_caja_desglose?: FlujoCajaDesglose | null;
  comparativo_modalidades?: ComparativoModalidad[] | null;
  cuota_credito_mes?: number | null;
  flujo_con_credito?: number | null;
  recomendacion_modalidad?: string | null;
  proyeccion_anual?: ProyeccionPunto[] | null;
};

export type ListingSimuladorData = {
  id: number;
  precio: number;
  barrio_id: number;
  barrio_nombre: string | null;
  municipio: string | null;
  area_m2: number | null;
  administracion: number | null;
  tipo_inmueble: string | null;
  tipo_operacion: string | null;
};

export type AlternativaListing = {
  id: number;
  tipo_inmueble: string | null;
  precio: number;
  area_m2: number | null;
  habitaciones: number | null;
  banos: number | null;
  foto: string | null;
  barrio_id: number;
  barrio_nombre: string;
  municipio: string;
  yield_bruto_pct: number | null;
  yield_neto_pct: number | null;
  recupero_anos: number | null;
};

export function useSimular() {
  return useMutation({
    mutationFn: (req: SimulacionRequest) =>
      apiFetch<SimulacionResponse>(API_ENDPOINTS.calculadora, {
        method: "POST",
        body: JSON.stringify(req),
      }),
  });
}

export function useListingSimuladorData(listingId: number | null) {
  return useQuery<ListingSimuladorData>({
    queryKey: ["simulador-listing-data", listingId],
    queryFn: () => apiFetch(API_ENDPOINTS.simuladorListingData(listingId!)),
    enabled: listingId != null,
    staleTime: 300_000,
  });
}

export function useSimuladorAlternativas(params: {
  presupuesto_max: number;
  tipo_inversion: string;
  listing_id?: number | null;
  enabled: boolean;
}) {
  const qs = new URLSearchParams({
    presupuesto_max: String(params.presupuesto_max),
    tipo_inversion: params.tipo_inversion,
    ...(params.listing_id != null ? { listing_id: String(params.listing_id) } : {}),
  });
  return useQuery<AlternativaListing[]>({
    queryKey: ["simulador-alternativas", params.presupuesto_max, params.tipo_inversion, params.listing_id],
    queryFn: () => apiFetch(`${API_ENDPOINTS.simuladorAlternativas}?${qs}`),
    enabled: params.enabled && params.presupuesto_max > 0,
    staleTime: 120_000,
  });
}
