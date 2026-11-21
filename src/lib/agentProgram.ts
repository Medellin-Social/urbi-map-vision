// Programa de agentes (docs/Medellin-Social-Programa-Inmobiliario-ES.md).
// Precios en USD (confirmados 2026-11-21). El backend es la fuente de verdad del
// estado; estos valores son solo para mostrar tarifas en páginas públicas.
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import { validateGhlUrl } from "@/config/ghl";

export const PRECIOS_USD = {
  registro: 25,
  anuncio: 5,
  cert_cuota: 99,
  cert_mensual: 25,
  cert_ilimitado: 99,
  cupos_incluidos: 5,
  umbral_ilimitado: 20,
} as const;

export const usd = (n: number) => `$${n} USD`;

export type Producto = "registro" | "cert_cuota" | "cert_mensual" | "cert_ilimitado" | "anuncio";
export type EstadoEval = "pendiente" | "enviado" | "aprobado" | "no_aprobado";

export type Representacion = {
  id: string; listing_url: string; estado: "solicitado" | "aprobado" | "rechazado";
  cobertura: "ninguna" | "incluido" | "pago" | "ilimitado"; motivo: string | null; created_at: string;
};

export type MiEstado = {
  id: string;
  estado: "pendiente" | "activo" | "rechazado" | "inactivo";
  registrado: boolean;
  registro_pagado_at: string | null;
  cert_cuota_pagada_at: string | null;
  cert_plan: "estandar" | "ilimitado" | null;
  cert_plan_vence: string | null;
  plan_vigente: boolean;
  certificado: boolean;
  es_realtor_casa: boolean;
  certificacion: null | {
    id: string; anios_experiencia: number; n_transacciones: number; descripcion: string | null;
    documentos: string[]; examen_evidencia_url: string | null;
    examen_estado: EstadoEval; revision_estado: Exclude<EstadoEval, never>; motivo: string | null;
    aprobado_at: string | null; created_at: string;
  };
  representaciones: Representacion[];
  cupos_incluidos: number;
  cupos_usados: number;
  anuncios_sin_cobertura: number;
  preferente: { zona_nivel: "barrio" | "comuna"; zona_codigo: string; fecha_fin: string | null }[];
  precios_usd: Record<Producto, number>;
  ease_exam_url: string | null;
  pagos_simulados: boolean;
};

type CheckoutOut = {
  modo: "ghl_stripe" | "simulado"; checkout_url?: string; mensaje?: string;
  producto: Producto; monto_usd: number; recurrente: boolean;
};

export type PagoResultado =
  | { tipo: "redirigiendo" }
  | { tipo: "simulado_aplicado" }
  | { tipo: "pendiente"; mensaje: string };

/** Inicia el pago de un producto. En PROD redirige al link GHL; en DEV (sin link y con
 *  pagos simulados) confirma en el acto; si no, informa que el pago abre pronto. */
export async function pagarProducto(producto: Producto, listingUrl?: string, simular = false): Promise<PagoResultado> {
  const body = JSON.stringify({ producto, ...(listingUrl ? { listing_url: listingUrl } : {}) });
  const r = await apiFetch<CheckoutOut>(API_ENDPOINTS.agentProgramCheckout, { method: "POST", body });
  if (r.modo === "ghl_stripe") {
    const url = validateGhlUrl(r.checkout_url);
    if (!url) throw new Error("Link de pago inválido. Escríbenos a hola@medellin.social.");
    window.location.href = url;
    return { tipo: "redirigiendo" };
  }
  if (simular) {
    await apiFetch(API_ENDPOINTS.agentProgramConfirmarSimulado, { method: "POST", body });
    return { tipo: "simulado_aplicado" };
  }
  return { tipo: "pendiente", mensaje: r.mensaje ?? "" };
}

export const TIPOS_LEAD = ["realtor_casa", "property_manager", "administracion"] as const;
export type TipoLead = typeof TIPOS_LEAD[number];
