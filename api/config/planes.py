"""Plan definitions — prices, features, and payment IDs.

To activate payments:
  1. Create products/prices in Stripe Dashboard → paste IDs below
  2. Create plans in Wompi Dashboard → paste IDs below
  3. Set env vars STRIPE_SECRET_KEY, WOMPI_PUBLIC_KEY, etc.
"""
import os

PLANES: dict = {
    "pro": {
        "nombre": "MLS Pro",
        "descripcion": "Análisis completo + IA + datos históricos",
        "precio_cop": 79_000,
        "precio_usd": 29,
        "stripe_price_id_usd": os.getenv("STRIPE_PRICE_ID_PRO_USD"),
        "wompi_plan_id_cop": os.getenv("WOMPI_PLAN_ID_PRO_COP"),
        "requiere_verificacion": False,
        "features": [
            "p25/p50/p75 por barrio",
            "Badge buena oferta / sobre precio",
            "Score de inversión desglosado",
            "Yield por modalidad (Airbnb / renta / venta)",
            "Simulador de inversión",
            "Recomendación IA por perfil",
            "Datos históricos de precios",
            "Proyecciones a 12 meses",
            "Alertas de precio",
            "Comparador hasta 3 barrios",
        ],
    },
    "agente": {
        "nombre": "MLS Agente",
        "descripcion": "Todo Pro + herramientas para cerrar ventas",
        "precio_cop": 199_000,
        "precio_usd": 59,
        "stripe_price_id_usd": os.getenv("STRIPE_PRICE_ID_AGENTE_USD"),
        "wompi_plan_id_cop": os.getenv("WOMPI_PLAN_ID_AGENTE_COP"),
        "requiere_verificacion": True,
        "features": [
            "Todo lo de Pro",
            "Publicar listings propios",
            "CRM de leads",
            "Perfil público en /real-estate",
            "Badge Agente Verificado",
            "Reportes exportables PDF",
            "Comparador ilimitado",
            "Acceso a red de inversores",
            "Estadísticas de listings",
        ],
    },
}

_ORDEN = ["free", "pro", "agente"]


def plan_gte(plan_usuario: str, plan_minimo: str) -> bool:
    """Returns True if plan_usuario meets or exceeds plan_minimo."""
    try:
        return _ORDEN.index(plan_usuario) >= _ORDEN.index(plan_minimo)
    except ValueError:
        return False
