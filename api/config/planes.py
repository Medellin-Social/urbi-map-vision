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
        "descripcion": "Para tomar decisiones con datos",
        "precio_cop": 79_000,
        "precio_usd": 29,
        "stripe_price_id_usd": os.getenv("STRIPE_PRICE_ID_PRO_USD"),
        "wompi_plan_id_cop": os.getenv("WOMPI_PLAN_ID_PRO_COP"),
        "requiere_verificacion": False,
        "features": [
            "Todo lo del plan Explorador",
            "Rango de precios del barrio (mínimo, típico y premium)",
            "Badge Buena oferta / Precio justo / Sobre precio",
            "Historial de bajadas de precio",
            "Rendimiento estimado si arriendas (Airbnb vs nómadas vs renta larga)",
            "Score de inversión desglosado (rentabilidad + valorización + riesgo)",
            "Proyecciones a 12 meses",
            "Recomendación personalizada por tu perfil (Comprador / Inversor / Arrendador)",
            "Alertas cuando una propiedad baja de precio",
            "Comparador de barrios ilimitado",
            "Tu listing destacado en morado en el mapa",
        ],
    },
    "agente": {
        "nombre": "MLS Agente",
        "descripcion": "Para profesionales inmobiliarios",
        "precio_cop": 199_000,
        "precio_usd": 59,
        "stripe_price_id_usd": os.getenv("STRIPE_PRICE_ID_AGENTE_USD"),
        "wompi_plan_id_cop": os.getenv("WOMPI_PLAN_ID_AGENTE_COP"),
        "requiere_verificacion": True,
        "features": [
            "Todo lo del plan Pro",
            'Publicar listings con badge "Agente Verificado"',
            "Tu listing destacado en amarillo en el mapa (máxima visibilidad)",
            "Perfil público en /agentes con tus propiedades activas",
            "CRM de leads — ve quién contactó tus listings",
            "Estadísticas de tus propiedades (vistas, favoritos, contactos)",
            "Reportes de mercado exportables en PDF para mostrar a clientes",
            "Acceso a red de inversores extranjeros de Ken Munro",
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
