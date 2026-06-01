# Sistemas de Estrato en Medellin Social

Hay tres columnas llamadas "estrato" con fuentes y usos distintos.
No son intercambiables.

---

## 1. `estrato_real` — Por listing (raw)

**Tablas:** `raw.listings_fincaraiz.estrato_real`, `raw.listings_metrocuadrado.estrato_real`  
**Fuente:** Valor `stratum` scrapeado directamente de la página del listing  
**Escala:** 1–6 (o NULL si el portal no lo informa)  
**Cobertura:** ~95% de listings con coordenadas válidas  
**Uso:** Solo display en la tarjeta de un listing individual  
**Código:** `api/routers/listings.py` → `COALESCE(lm.estrato_real, lf.estrato_real) AS estrato_real`

---

## 2. `estrato_barrio` — Por barrio (analytics)

**Tabla:** `analytics.score_largo_plazo.estrato_barrio`  
**Fuente:** Moda de `estrato_real` de los listings dentro de cada barrio (calculado al correr el score largo plazo)  
**Escala:** 1–6 (NULL si el barrio no tiene listings suficientes)  
**Cobertura:** ~94% barrios Medellín; 0% Valle de Aburrá (scrapers no incluyen estrato confiable allá)  
**Uso:**
- Filtro de barrios por estrato en `/barrios?estrato=3`
- JOIN a proyecciones de valorización: `analytics.score_largo_plazo sl JOIN analytics.proyecciones_valorizacion pv ON sl.estrato_barrio = pv.estrato_sistema`
**Código:** `api/routers/barrios.py` → `sl.estrato_barrio AS estrato`

---

## 3. `estrato_sistema` — Para proyecciones (analytics)

**Tabla:** `analytics.proyecciones_valorizacion.estrato_sistema`  
**Fuente:** Igual que `estrato_barrio` — es la misma escala 1–6 usada como PK de la tabla de proyecciones  
**Escala:** 1–6 (siempre presente — la tabla tiene exactamente 6 filas, una por estrato)  
**Cobertura:** 100% (si `estrato_barrio` es NULL, el barrio no recibe proyección)  
**Uso:** Lookup de `var_anual_5anos_pct`, `proyeccion_3anos_pct`, `proyeccion_5anos_pct` para score largo plazo  
**Código:** `api/routers/barrios.py` → `LEFT JOIN analytics.proyecciones_valorizacion pv ON sl.estrato_barrio = pv.estrato_sistema`

---

## Cuándo usar cuál

| Contexto | Campo a usar | Razón |
|----------|-------------|-------|
| Mostrar estrato de un listing | `estrato_real` | Dato original del listing |
| Filtrar barrios por estrato | `estrato_barrio` | Representa el barrio como un todo |
| Proyecciones de valorización | `estrato_sistema` (vía JOIN) | Lookup de tabla de proyecciones |
| Fallback cuando falta barrio | `estrato = 0` (en aggregate.py) | Placeholder — no se debe mostrar al usuario |

---

## Nota sobre Valle de Aburrá

Los barrios de Bello, Envigado, Itagüí, Sabaneta y La Estrella NO tienen `estrato_barrio`
calculado (NULL). Sus proyecciones de valorización tampoco están disponibles. El frontend
maneja esto mostrando "Sin datos" en el panel de valorización.
