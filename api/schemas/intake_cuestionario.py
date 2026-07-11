"""Intake questionnaire schema — CONTENIDO DE PRODUCTO, no lógica dispersa.

Define qué se le pregunta al owner al captar un inmueble. Ramificado por
operacion: venta pide el set legal completo; arriendo uno más liviano.

⚠️ Sujeto a validación de un ABOGADO. No hardcodear estas preguntas en la lógica
de negocio — vive aquí, versionado, y cambia como un archivo de configuración.

Semántica de un item:
- id            clave de la respuesta en el payload
- texto         etiqueta mostrada al owner
- tipo          bool | opcion | numero | texto | geometria
- obligatoria   si True, la respuesta debe estar presente
- condicional_si  dict {clave: valor}: el item SOLO aplica si el payload cumple
                  TODAS las igualdades. Si aplica y es obligatoria → requerida;
                  si no aplica, se omite (aunque sea obligatoria).
"""
from __future__ import annotations

from typing import Any, Dict, List, TypedDict


class Pregunta(TypedDict, total=False):
    id: str
    texto: str
    tipo: str
    obligatoria: bool
    condicional_si: Dict[str, Any]


# ── Compartido (ambas operaciones) ─────────────────────────────────────────────

COMPARTIDO: List[Pregunta] = [
    {"id": "operacion",       "texto": "¿Es venta o arriendo?", "tipo": "opcion",     "obligatoria": True},
    {"id": "tipo_inmueble",   "texto": "Tipo de inmueble",      "tipo": "opcion",     "obligatoria": True},
    {"id": "geom",            "texto": "Ubicación (pin en mapa)", "tipo": "geometria", "obligatoria": True},
    {"id": "direccion_aprox", "texto": "Dirección aproximada",  "tipo": "texto",      "obligatoria": False},
    {"id": "area_m2",         "texto": "Área (m²)",             "tipo": "numero",     "obligatoria": False},
    {"id": "habitaciones",    "texto": "Habitaciones",          "tipo": "numero",     "obligatoria": False},
    {"id": "banos",           "texto": "Baños",                 "tipo": "numero",     "obligatoria": False},
]

# ── VENTA — set legal completo ─────────────────────────────────────────────────

VENTA: List[Pregunta] = COMPARTIDO + [
    {"id": "precio_esperado",         "texto": "Precio esperado (COP)",           "tipo": "numero", "obligatoria": False},
    {"id": "en_propiedad_horizontal", "texto": "¿Es propiedad horizontal (edificio/condominio)?", "tipo": "bool", "obligatoria": True},
    # Solo aplica —y es obligatoria— si el inmueble es propiedad horizontal.
    {"id": "al_dia_administracion",   "texto": "¿Al día con administración?",     "tipo": "bool",   "obligatoria": True,
     "condicional_si": {"en_propiedad_horizontal": True}},
    {"id": "al_dia_predial",          "texto": "¿Al día con impuesto predial?",   "tipo": "bool",   "obligatoria": True},
    {"id": "tiene_hipoteca",          "texto": "¿Tiene hipoteca?",                "tipo": "bool",   "obligatoria": True},
    {"id": "tiene_escritura",         "texto": "¿Tiene escritura pública?",       "tipo": "bool",   "obligatoria": True},
    {"id": "servicios_al_dia",        "texto": "¿Servicios al día (agua, luz, gas)?", "tipo": "bool", "obligatoria": True},
    {"id": "estado_civil",            "texto": "Estado civil del propietario",    "tipo": "texto",  "obligatoria": False},
    {"id": "es_persona_juridica",     "texto": "¿Es persona jurídica/empresa?",   "tipo": "bool",   "obligatoria": False},
    {"id": "notas_owner",             "texto": "Notas adicionales",               "tipo": "texto",  "obligatoria": False},
]

# ── ARRIENDO — set liviano ────────────────────────────────────────────────────

ARRIENDO: List[Pregunta] = COMPARTIDO + [
    {"id": "precio_esperado",  "texto": "Canon de arriendo esperado (COP/mes)", "tipo": "numero", "obligatoria": False},
    {"id": "servicios_al_dia", "texto": "¿Servicios al día?",                   "tipo": "bool",   "obligatoria": False},
    {"id": "notas_owner",      "texto": "Notas adicionales",                    "tipo": "texto",  "obligatoria": False},
]


def cuestionario_para(operacion: str) -> List[Pregunta]:
    """Return the questionnaire ramified by operacion."""
    if operacion == "venta":
        return VENTA
    if operacion == "arriendo":
        return ARRIENDO
    raise ValueError(f"Operación desconocida: {operacion}")


# Claves del cuestionario legal que van a intake.declaraciones (JSONB).
DECLARACIONES_KEYS = frozenset({
    "en_propiedad_horizontal", "al_dia_administracion", "al_dia_predial",
    "tiene_hipoteca", "tiene_escritura", "servicios_al_dia",
    "estado_civil", "es_persona_juridica",
})
