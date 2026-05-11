import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";

export type SimulacionRequest = {
  barrio_id: number;
  presupuesto_cop: number;
  tipo_inversion: "airbnb" | "renta_larga" | "renta_media";
  perfil_riesgo?: "conservador" | "moderado" | "agresivo";
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
    neto_pct: number;
    vs_cdt: number;
    mensaje_cdt: string;
  };
  recupero: {
    bruto_anos: number;
    neto_anos: number;
  };
  valorizacion: {
    tasa_anual_pct: number;
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
