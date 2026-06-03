import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";

export type SimulacionRequest = {
  barrio_id: number;
  presupuesto_cop: number;
  tipo_inversion: "airbnb" | "renta_larga" | "renta_media";
  perfil_riesgo?: "conservador" | "moderado" | "agresivo";
  // Extended profile fields
  n_unidades?: string;
  tipo_gestion?: string;
  target_inquilino?: string;
  amoblado?: string;
  tipo_pago?: string;
  horizonte_inversion?: string;
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
    neto_pct: number | null;     // null when sample too small (FIX 2)
  };
  recupero: {
    bruto_anos: number;
    neto_anos: number | null;    // null when yield suppressed (FIX 2)
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
  // Profile desglose (optional)
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
