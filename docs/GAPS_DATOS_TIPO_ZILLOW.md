# Datos tipo Zillow: qué tenemos y qué falta

*25 de agosto de 2026*

## En una frase

Comparamos el mapa contra los features de datos que más mueven decisión de compra en portales como Zillow. Varios ya están construidos y solo falta exponerlos; el resto no existe todavía.

## Lo que ya tenemos

| Feature | Dónde vive en el código | Estado |
|---|---|---|
| Colegios y jardines infantiles | `load_pois_overpass.py` — OSM `amenity=school`+`kindergarten` | ✅ Cargado |
| Metro, malls, parques, hospitales, clínicas, universidades, coworking, gym, restaurantes, bares, cafés | mismo pipeline Overpass, 14 categorías | ✅ Cargado |
| Estrato | `raw.estratos_manzana` (geojson POT) | ✅ Cargado |
| Avalúo catastral / uso de suelo | `raw.catastro_medellin` | ✅ Cargado |
| Valor de administración | campo `administracion` en `listing` + cuestionario intake | ✅ Cargado |
| Impuesto predial | calculadora.py estima 0.5% anual si no viene del catastro | ✅ Estimado |
| Yield bruto/neto/cash-on-cash | calculadora.py, snapshot actual | ✅ Calculado (sin histórico aún) |
| Antigüedad del inmueble | `antiguedad_anios` en `listing` — años de antigüedad, no año exacto de construcción | ✅ Cargado |
| Días en mercado | `dias_en_mercado`/`fecha_publicacion` — **solo fuente metrocuadrado**, resto NULL | ⚠️ Parcial, 1 fuente |
| Histórico de precio | `raw.listings_precio_historial` (migración 0018), trigger autogenerado en cada cambio de precio del scraping | ✅ Generándose, no consumido por calculadora todavía |

## Lo que falta (cero implementación, verificado por grep)

| Feature | Por qué importa | Fuente de dato sugerida |
|---|---|---|
| Riesgo de deslizamiento/inundación | Ciudad de ladera — dato de seguro y de banco, ningún portal colombiano lo muestra | DAGRD |
| Calidad de aire | Diferencias reales entre barrios | SIATA |
| Ruido (proximidad rumba/avenidas/bares) | Crítico cerca de Parque Lleras / Av. El Poblado, "Noise Score" en Zillow | SIATA (ruido urbano) |
| Permisos de construcción activos cerca | Señal de valorización o de molestia — torre nueva al lado | Curaduría Urbana |
| Supermercados y farmacias | Los POI más consultados día a día | OSM Overpass — trivial, misma regla que colegios |
| Paraderos de bus / Metroplús | Sistema de superficie, hoy solo tenemos metro | OSM Overpass — trivial |
| Obras públicas planificadas | Metro Línea 2, extensiones de Tranvía — valorización anticipada | Fuente pública a definir |
| Sale-to-list ratio (precio cierre vs pedido) | No hay campo `precio_cierre`, solo precio publicado | — |
| Fibra óptica / velocidad de internet | Relevante para mercado de nómadas digitales | ETB/UNE, Ookla |
| Ratio arrendatario/propietario, densidad extranjeros, velocidad de cambio del barrio | Señales de gentrificación temprana | — |
| Calidad de colegio (ICFES) | Tenemos ubicación, no ranking | ICFES |

## Más rápido de sumar

Supermercado + farmacia + paradero de bus: una regla más en `load_pois_overpass.py`, mismo patrón que colegios, sin pipeline nuevo.

## El más diferenciador

Riesgo DAGRD: ningún portal inmobiliario colombiano lo muestra hoy.
