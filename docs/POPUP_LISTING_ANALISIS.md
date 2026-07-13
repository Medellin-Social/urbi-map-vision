# Análisis: datos disponibles para pop-up de listing estilo Zillow

> Read-only, 2026-07-11. Base local (`localhost:5433/urbidata`), 89,051 filas en
> `staging.stg_listings_unificado`. Fuentes: metrocuadrado 51.8%, fincaraiz 47.1%,
> renta media/premium ~1%.

## Arquitectura relevante (hallazgo clave)

El pop-up NO depende solo de `/viewport`. Ya existe un patrón de dos niveles:

- **`GET /api/v1/listings/viewport`** → tier "mapa/card": campos mínimos (`ViewportListing`, [listings.py:763](api/routers/listings.py#L763)).
- **`GET /api/v1/listings/{id}`** → tier "detalle": ya hace JOIN con raw (descripción, fotos, parqueaderos), historial de precio, y contexto de barrio (`ListingDetail`, [listings.py:116](api/routers/listings.py#L116), SQL en [listings.py:594](api/routers/listings.py#L594)).

El `id` es determinístico: `('x'||substr(md5(url),1,8))::bit(32)::int` — el pop-up puede fetch detail con el id que ya trae viewport. **La mayoría de la ficha Zillow ya está servida por el endpoint de detalle.**

## Paso 1 — Columnas de `staging.stg_listings_unificado`

| Columna | Tipo | % completitud | ¿Sale por /viewport? | Notas |
|---|---|---|---|---|
| listing_uid | text | 100% | ❌ (sí en detail) | |
| fuente | text | 100% | ✅ (+ `fuente_display` derivado) | |
| tier | text | 100% | ✅ | |
| tipo_operacion | text | 100% | ✅ | |
| tipo_inmueble | text | 100% | ✅ | |
| precio_cop | numeric | 100% | ✅ | |
| precio_usd | bigint | **0%** | ✅ (calculado en query, no de la columna) | columna muerta en tabla |
| precio_min_cluster | numeric | 100% | ❌ | rango de proyectos con precio variable |
| precio_max_cluster | numeric | 100% | ❌ | |
| precio_variable | boolean | 100% | ❌ | flag "desde $X" estilo proyecto |
| area_m2 | numeric | 99.0% | ✅ | |
| precio_m2 | numeric | 99.0% | ✅ | |
| habitaciones | integer | 74.6% (válidas, sin sentinela -1) | ✅ | |
| banos | numeric | 89.4% | ✅ | |
| barrio_raw | text | 93.5% | ❌ | texto crudo del portal |
| barrio_id | integer | **73.6%** | ✅ (+ nombre/municipio por JOIN) | ⚠️ 26.4% sin barrio → viewport los EXCLUYE (INNER JOIN raw.barrios) |
| direccion_raw | text | 94.6% | ✅ | |
| lat / lon / geom | float8 / geometry | 97.5% | ✅ (desde `listings_georef`, no de estas columnas) | |
| url | text | 100% | ✅ | enlace a fuente original |
| fotos | text[] | **89.3%** con ≥1 foto | Solo `fotos[1]` como `foto_principal` | **avg 11.4 fotos/listing, 88.6% con >1** → galería viable |
| fecha_scraping | timestamptz | 100% | ❌ (se usa para ORDER, no se expone) | |
| n_duplicados | bigint | 100% | ❌ | señal "publicado en N portales" |
| estrato_real | integer | 58.7% | ✅ (vía georef) | |
| amoblado | boolean | 48.2% | ❌ (solo como filtro) | |
| antiguedad | text | **8.3%** | ❌ | casi vacía; detail la saca mejor de raw MC |
| amenidades | text[] | 86.1% con ≥1 | ❌ (solo como filtro; sí en detail) | |

### En tabla pero NO en /viewport (candidatas al pop-up)

- `fotos` completo (hoy solo `fotos[1]`) — o mejor: fetch de detail al abrir.
- `precio_min_cluster` / `precio_max_cluster` / `precio_variable` — para mostrar "Desde $X" en proyectos.
- `n_duplicados` — badge "en N portales".
- `amoblado`, `amenidades`, `fecha_scraping` — hoy solo filtros / orden.

## Paso 2 — Datos satélite

### Historial de precio: `raw.listings_precio_historial`

| | |
|---|---|
| Estructura | `id, listing_url, fuente, precio_anterior, precio_nuevo, fecha_cambio (date), created_at` |
| Enlace | **por URL**: `listing_url = stg.url` (índice `idx_lph_url`) |
| Cobertura | 5,242 listings con historial; **2,955 cruzan con stg actual (3.3%)** — el resto son listings ya caídos |
| Densidad | promedio 8.8 puntos por listing, máx 145 |
| Ya servido | ✅ `/listings/{id}` devuelve `precio_historia[]` (`_PRECIO_HISTORIA_SQL`, [listings.py:744](api/routers/listings.py#L744)) con precio, fecha, delta_pct |

Suficiente para gráfico estilo Zillow, pero solo en ~3% de fichas → renderizar sección condicionalmente.

### Vecindario: tablas `analytics.barrios_*` (enlace por `barrio_id`)

Cobertura sobre listings: **73.6% tienen `barrio_id`** con contexto/medianas, 72.8% con POIs. El 26.4% restante no sale en viewport de todos modos → cobertura efectiva ~100% de lo visible.

| Tabla | Filas | Métricas clave |
|---|---|---|
| `barrios_contexto` | — | yield_bruto_pct, score_corto/mediano/largo, liquidez_score, indice_nomada, seguridad_score, var_anual_pct — **ya en `/listings/{id}`** |
| `barrios_score_consolidado` | 564 | scores + categorías + colores por horizonte, yields (airbnb/bruto/renta media), precio_m2_venta_p50, arriendo_p50, perfil_recomendado, tiempo_estimado_venta, índice verde, equipamiento |
| `barrios_liquidez` | 536 | dias_mercado_p25/p50, pct_frescos/antiguos, liquidez_score, tiempo_estimado_venta |
| `barrios_medianas` | 2,498 (barrio × tipo_inmueble) | m2 y arriendo: mediana + p25/p75 — **ya alimenta pct_bajo_mediana, yield_estimado y rango p25/p75 en detail** |
| `barrios_pois_distancia` | 606 | dist_metro/parque/mall km, n_universidades_2km, n_hospitales_3km, cafés/coworking/gym/restaurantes/bares cercanos, indice_nomada |
| `barrios_seguridad` | 269 | casos por 1000 hab, score residente/tránsito, tendencia, categoría |
| `barrios_verde` | 610 | n_parques, indice_verde_pct, categoría |

⚠️ No hay datos de **colegios** en POIs (sí universidades/hospitales).

### Fotos

**Sí hay array completo**: `stg_listings_unificado.fotos text[]`, 89.3% con ≥1 foto, promedio **11.4 fotos**, 88.6% con más de una. `/viewport` solo expone `fotos[1]`; `/listings/{id}` ya devuelve el array completo (`COALESCE(l.fotos, lp.fotos)`). **Galería viable hoy sin tocar datos.**

### Extras solo en RAW (no en stg)

`/listings/{id}` ya los saca por JOIN a raw por URL:

| Campo | Fuente | Completitud en raw | Nota |
|---|---|---|---|
| descripcion | MC 85.3% / FR 89.4% | alta | COALESCE(mc, fr, premium) en detail |
| dias_en_mercado | solo MC (`fecha_primera_vez` 100% en MC) | ~52% de stg | NULL para fincaraiz |
| parqueaderos | MC raw_data 14.8% / FR columna 1.9% | baja | detail solo lee raw_data de MC |
| piso | MC raw_data / FR 1.2% | baja | idem |
| antiguedad | MC 14.9% / FR 2.3% | baja | detail lee `raw_data->>'tiempoConstruido'` de MC |
| estado_inmueble | MC raw_data | baja | |
| administracion | MC/FR ~1.6% | casi vacía | no servida hoy; no vale la pena |

## Paso 3 — Checklist tengo / parcial / falta vs ficha Zillow

| Sección Zillow | Estado | Detalle |
|---|---|---|
| Galería de fotos | ✅ **DISPONIBLE** | `fotos[]` (89%, avg 11.4). Ya en `/listings/{id}`. Viewport solo trae la primera. |
| Precio | ✅ **DISPONIBLE** | `precio_cop` 100%, `precio_usd` calculado. Extra: `precio_variable` + min/max cluster para proyectos (no expuesto). |
| Beds / baths / área / precio-m² | ✅ **DISPONIBLE** (hab 74.6%) | `habitaciones` 74.6%, `banos` 89.4%, `area_m2`/`precio_m2` 99%. Todo ya en viewport. |
| Dirección / ubicación | 🟡 **PARCIAL** | `direccion_raw` 94.6% pero es texto crudo del portal (a veces vago); barrio+municipio vía JOIN. Sin dirección estructurada. |
| Tipo y características (año, parqueo, estrato) | 🟡 **PARCIAL** | tipo 100%, estrato 58.7%, amenidades 86%. Año/antigüedad 8-15%, parqueaderos ~15% (solo MC), piso bajo. Amoblado 48%. |
| Descripción | ✅ **DISPONIBLE** (vía detail) | 85-89% en raw; ya servida por `/listings/{id}`. No está en stg ni en viewport. |
| Historial de precio | 🟡 **PARCIAL** | Estructura y endpoint listos, pero solo **3.3%** de listings vigentes tienen historial. Sección condicional. |
| Vecindario (scoring, POIs) | ✅ **DISPONIBLE** | Scores/yield/seguridad/liquidez ya en detail; POIs (metro, parque, mall, universidades, hospitales, cafés) en `barrios_pois_distancia` — **no servidos en detail hoy**. ❌ Colegios: no hay dato. |
| Enlace a fuente original | ✅ **DISPONIBLE** | `url` 100%, ya en viewport y detail. |
| Mapa / geo | ✅ **DISPONIBLE** | lat/lon 97.5% (georef), ya en ambos endpoints. |

## Recomendaciones (NO aplicadas — solo lista)

1. **Pop-up = fetch `/listings/{id}` al abrir.** El patrón ya existe ("Full detail fetched per-id at drawer open"). Evita engordar /viewport.
2. Añadir a `/viewport` solo si el pop-up necesita render instantáneo sin segundo fetch:
   - `fotos` (o primeras 3) para carrusel inmediato.
   - `precio_variable` + `precio_min_cluster`/`precio_max_cluster` → "Desde $X".
   - `n_duplicados` → badge "en N portales".
   - `amoblado`.
3. Añadir a `/listings/{id}` (datos ya existen, no servidos):
   - POIs de `barrios_pois_distancia` (dist metro/parque/mall, conteos) para sección vecindario.
   - `barrios_seguridad` (categoría/tendencia) y `barrios_verde` si se quiere sección rica.
   - `parqueaderos` de fincaraiz (columna `lf.parqueaderos`) como fallback del COALESCE — hoy solo se lee de MC raw_data (aunque FR está 1.9% poblada, es gratis).
4. Gaps de datos reales (requieren scraping/ETL, no API):
   - Antigüedad/año: 8-15% → habría que extraer más de raw_data o re-scrapear.
   - Colegios cercanos: no existe la métrica.
   - Dirección estructurada: solo texto crudo.
   - Historial de precio: cobertura 3.3% — crece sola con el tiempo del scraper.
