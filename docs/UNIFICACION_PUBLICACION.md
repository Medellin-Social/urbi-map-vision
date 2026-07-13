# Unificación de publicación — análisis READ-ONLY

**Estado:** propuesta para decisión. CERO cambios de código en este documento.
**Fecha:** 2026-07-12
**Decisión de producto que motiva:** UN SOLO flujo. Owner/realtor publica con fotos
y datos ricos → sale al mapa de inmediato marcado **"sin verificar"** → después se
asigna un realtor que hace due diligence → sello **"verificado"**. Publicar gratis;
pago opcional por promoción.

---

## 0. Los dos mundos hoy

| | **listings_propios** (mundo viejo) | **listing** (mundo realtor, 0046) |
|---|---|---|
| Migración | 0005 + 0031 | 0046 (+ intake 0048, dd/moderación 0050) |
| PK | `SERIAL` (int) | `UUID` |
| Publica | `/listings-propios` (POST multipart, con fotos) | `aceptar_intake()` crea `borrador`; luego moderación |
| Verificación | **ninguna** — sale al mapa directo | **antes** de publicar (en_revision → publicado) |
| Fotos | `fotos TEXT[]` inline | tabla `listing_media` (url, orden, es_portada) |
| Entra al mapa | **SÍ** — `api/cache.py` UNION `fuente='propio'` sufijo `_lp` | **NO** — `listing` no está en ningún UNION del cache |
| Owner | `user_id` INT → usuarios | vía `intake.owner_id` UUID → owner |
| Realtor | `agente_id` INT (FK dropeada en 0052) | `agent_id`/`agency_id` UUID NOT NULL |

**Hallazgo clave #1:** hoy `listing` (0046) **nunca llega al mapa**. El cache
(`api/cache.py:128` `todas_fuentes`) hace UNION de metrocuadrado, premium (`_pr`),
renta_media (`_rm`) y **listings_propios (`_lp`)** — pero **no** de `listing`. El
mundo realtor está completo en backend pero desconectado del mapa.

**Hallazgo clave #2:** la máquina de estados de `listing` verifica **antes** de
publicar (`borrador → en_revision → publicado`). El modelo nuevo quiere lo contrario:
publicar primero, verificar después. Hay tensión directa con `listing_service.py`.

**Hallazgo clave #3:** ni `listing` ni `listings_propios` tienen columna de
verificación. `listings_propios` no tiene concepto de verificado; `listing` mezcla
"publicado" (visible) con el hecho de haber pasado moderación previa. No existe el eje
"verificado" separado hoy.

---

## A. Mapa columna-por-columna

Leyenda: **✓solape** (misma semántica) · **△exclusivo lp** · **▲exclusivo listing** · **✗falta**

### A.1 Comercial / características (solapan casi todo)

| Concepto | listings_propios | listing (0046) | Nota |
|---|---|---|---|
| PK | `id SERIAL` | `id UUID` | tipo distinto — migración necesita mapeo |
| operación | `tipo_operacion VARCHAR CHECK(venta,arriendo)` | `operacion listing_operacion ENUM` | ✓ mismos valores |
| tipo inmueble | `tipo_inmueble VARCHAR` (libre) | `tipo_inmueble ENUM(apartamento,casa,local,oficina,lote,finca)` | ✓ pero lp permite `apartaestudio`,`bodega`,`otro` → **no caben en el enum** |
| precio | `precio_cop DECIMAL`, `precio_usd DECIMAL` | `precio NUMERIC` + `moneda TEXT='COP'` | ✓ (usd derivable de TRM) |
| administración | `administracion_cop BIGINT` | `administracion NUMERIC` | ✓ |
| área | `area_m2 DOUBLE`, `area_lote_m2 DOUBLE` | `area_m2 NUMERIC` | △ `area_lote_m2` falta en listing |
| habitaciones | `habitaciones INTEGER` | `habitaciones SMALLINT` | ✓ |
| baños | `banos NUMERIC` | `banos SMALLINT` | ✓ (lp permite medio baño) |
| parqueaderos | `parqueaderos INTEGER` | `parqueaderos SMALLINT` | ✓ |
| estrato | `estrato INTEGER` | `estrato SMALLINT` | ✓ |
| antigüedad | `antiguedad INTEGER`, `ano_construccion INTEGER` | `antiguedad_anios SMALLINT` | ✓ |
| descripción | `descripcion TEXT` | `descripcion TEXT` + `titulo TEXT` | ✓ (listing añade `titulo`) |
| amoblado | `amoblado BOOLEAN` | ✗ | △ falta en listing |
| amenidades | `amenidades TEXT[]` | ✗ | △ falta en listing |
| mascotas | `mascotas BOOLEAN` | ✗ | △ falta en listing |
| permite airbnb | `permite_airbnb BOOLEAN` | ✗ | △ falta en listing |
| video/tour | ✗ | `video_url`, `tour_url` | ▲ exclusivo listing |

### A.2 Ubicación

| Concepto | listings_propios | listing (0046) | Nota |
|---|---|---|---|
| geometría | `lat`/`lon DOUBLE` sueltos | `geom GEOMETRY(Point,4326)` NOT NULL | listing es PostGIS nativo; lp arma geom en el cache con `ST_MakePoint` |
| barrio | `barrio_id INT` → raw.barrios | `barrio TEXT`, `municipio TEXT` (denormalizado) | modelos distintos: lp guarda FK, listing guarda texto |
| dirección | `direccion VARCHAR` | `direccion_aprox TEXT` + `mostrar_exacto BOOL` | listing tiene control de privacidad |

### A.3 Fotos — el gap grande

| | listings_propios | listing (0046) |
|---|---|---|
| Almacenamiento | `fotos TEXT[]` (array de URLs inline) | tabla **`listing_media`** (`id, listing_id, url, orden, es_portada`) |

**`listing_media` YA SIRVE** para absorber fotos. Es más rica que el array:
orden explícito + flag de portada. Migrar `fotos[]` → filas `listing_media`
(orden = índice, es_portada = índice 0) es directo.

### A.4 Contacto (exclusivo lp)

`nombre_contacto`, `telefono`, `email_contacto`, `horario_contacto` — ▲ exclusivos de
listings_propios, **faltan** en listing. En el mundo realtor el contacto lo resuelve
la relación agent/agency, no columnas. Decisión: ¿el listing unificado guarda contacto
del owner, o siempre enruta por el realtor asignado?

### A.5 Estado / meta

| Concepto | listings_propios | listing (0046) |
|---|---|---|
| estado | `estado VARCHAR CHECK(activo,vendido,arrendado,pausado)` | `estado listing_estado ENUM(borrador,en_revision,publicado,rechazado,pausado,cerrado)` |
| fuente | `fuente TEXT='propio'` | ✗ (implícito) |
| destacado/promo | `destacado BOOLEAN` | ✗ (promo pagada = a construir) |
| vistas | `vistas INTEGER` | ✗ |
| verificado | **✗ no existe** | **✗ no existe** |
| timestamps | `created_at`, `updated_at`, `fecha_publicacion` | `created_at`, `updated_at`, `published_at` |

### Resumen A: ¿se pueden unificar en UNA tabla?

**Sí, técnicamente.** `listing` es el mejor esqueleto base (PostGIS nativo,
`listing_media`, enums, FK realtor). Para absorber listings_propios hay que **añadir a
`listing`**:

- **Fotos:** ya cubierto por `listing_media` (no columna nueva).
- **Columnas nuevas:** `amoblado`, `amenidades TEXT[]`, `mascotas`, `permite_airbnb`,
  `area_lote_m2`, contacto (`nombre_contacto`/`telefono`/`email_contacto`/`horario_contacto`),
  `destacado`/promo, `vistas`.
- **Ampliar enum** `listing_tipo_inmueble` con `apartaestudio`, `bodega`, `otro`
  (o mapearlos a `otro`).
- **Resolver FK obligatorias:** `agency_id`/`agent_id` son **NOT NULL** en listing —
  un owner que publica solo (sin realtor asignado aún) **no puede insertarse hoy**.
  Bloqueante para "publica primero". Ver opción B/D.
- **Barrio:** decidir FK (`barrio_id`) vs texto denormalizado. listing usa texto;
  el cache y filtros de lp usan `barrio_id`.

---

## B. Eje de verificación — "publica primero, verifica después"

**Hoy** (`api/services/listing_service.py:5`):

```
borrador → en_revision → publicado   (verifica ANTES: moderación aprueba para publicar)
           en_revision → rechazado
```

`transition()` exige `datos_minimos_completos` para pasar a `en_revision`, y moderación
(`api/routers/moderacion.py`) es quien aprueba a `publicado`. Es decir: **la
verificación humana es requisito para ser visible.** El modelo nuevo lo invierte.

### Opción B1 — Flag `verificado BOOLEAN` separado del estado (recomendada)

Separar dos ejes ortogonales:
- **Publicación** (`estado`): visible en el mapa o no.
- **Verificación** (`verificado BOOL` + `verificado_at`/`verificado_por`): sello de
  due diligence completada.

Nueva máquina de publicación:
```
borrador → publicado (directo, sin moderación previa)  # sale al mapa "sin verificar"
publicado → pausado/cerrado
```
Verificación corre en paralelo, no bloquea visibilidad. El asignador toma el listing
`publicado & verificado=false`, el realtor hace dd, y al cerrar el checklist →
`verificado=true`.

- **Pros:** cambio mínimo de datos (1 columna); mapa muestra ambos con badge distinto;
  no rompe el concepto de estado; `due_diligence_item` ya modela el checklist.
- **Contras:** hay que reescribir `TRANSICIONES_VALIDAS` y la guardia de moderación;
  `en_revision`/`rechazado` cambian de significado o se retiran; los `datos_minimos`
  ahora se exigen para `borrador → publicado`.

### Opción B2 — Enum `estado_verificacion` aparte (`sin_verificar/en_dd/verificado/rechazado_dd`)

Como B1 pero el eje verificación es un ENUM propio, no un bool, para modelar el
"en due diligence" y el "rechazado en dd".

- **Pros:** captura el estado intermedio (realtor trabajando) y el rechazo de dd sin
  tocar el eje de publicación; más expresivo para el dashboard del realtor.
- **Contras:** dos enums que mantener sincronizados; más UI. `due_diligence_item.estado`
  ya da granularidad por-ítem → el enum de cabecera podría ser redundante (derivable de
  los ítems).

### Opción B3 — Reusar el estado actual, añadir `publicado_sin_verificar`

Meter un valor nuevo al enum `listing_estado`. **Descartada como primaria:** mezcla los
dos ejes en una sola dimensión, explota el número de estados (publicado×verificado =
combinatoria), y ALTER TYPE de enum no es reversible (mismo dolor documentado en 0050).

**Guardia de moderación:** en B1/B2 `moderacion.py` deja de ser puerta de publicación
y pasa a registrar el resultado de la **verificación** (dd), no del acceso al mapa.
`listing_moderacion` (bitácora aprobado/rechazado) se reinterpreta como bitácora de
verificación, o se funde con el cierre de `due_diligence_item`.

---

## C. Cuestionario legal (predial, hipoteca, escritura)

**Qué asume el código hoy:**
- `intake.declaraciones JSONB` guarda el AUTOREPORTE del owner
  (`api/schemas/intake_cuestionario.py`: `en_propiedad_horizontal`, `al_dia_predial`,
  `tiene_hipoteca`, `tiene_escritura`, `servicios_al_dia`…). La migración 0048 lo dice
  explícito: *"AUTOREPORTE — no verificado. El realtor lo confirma después en la due
  diligence."*
- `due_diligence_item` (0050) es el checklist del realtor: `clave`, `declarado JSONB`
  (lo que dijo el owner), `estado` (pendiente/verificado/rechazado), `verificado_por`.
- **El diseño actual ya asume las dos fases:** owner declara en intake → realtor
  verifica en dd. La declaración y la verificación son pasos distintos **by design**.

### Opción C1 — Owner declara al publicar; realtor verifica (mantiene el diseño actual)

El cuestionario legal se llena al publicar (autoreporte, `declaraciones`), el listing
sale "sin verificar", el realtor luego confirma cada `declaracion` en dd.

- **Pros:** cero rediseño conceptual; `intake.declaraciones` + `due_diligence_item` ya
  lo modelan; el badge "verificado" significa algo real (un humano confirmó).
- **Contras:** más fricción en el formulario de publicación (owner responde legal
  antes de ver su inmueble en el mapa). Mitigable haciendo el cuestionario legal
  opcional al publicar y obligatorio para obtener el sello.

### Opción C2 — Realtor recolecta todo lo legal en dd; owner solo publica lo básico

El owner publica sin tocar lo legal; el realtor recolecta predial/hipoteca/escritura
durante la dd.

- **Pros:** publicación mínima, máxima conversión.
- **Contras:** contradice `intake.declaraciones` (quedaría casi vacío); el realtor
  arranca la dd sin insumo del owner (más trabajo manual); se pierde el autoreporte
  como punto de partida verificable.

**Observación:** C1 es lo que el código ya espera. C2 exige vaciar de sentido
`intake.declaraciones` o moverlo a dd. Punto intermedio: **owner declara lo mínimo
(propiedad horizontal, escritura) al publicar; el resto lo levanta el realtor.**

---

## D. Qué pasa con listings_propios

### Opción D1 — Migrar listings_propios → listing y retirarla (unificación real)

Backfill de todas las filas `listings_propios` a `listing` (+ `listing_media` para
fotos), reapuntar el cache a `listing`, dropear/deprecar `listings_propios`.

- **Pros:** una sola tabla, un solo flujo, una sola lectura del mapa; fin de la deuda
  de dos mundos.
- **Contras / trabajo:**
  - Resolver `agency_id`/`agent_id` NOT NULL para listings sin realtor (owner solo) →
    **requiere B (publicar sin realtar)** o FKs nullable.
  - Reescribir el UNION `_lp` del cache para leer `listing` (nuevo `fuente='propio'` o
    `fuente='listing'`; geom ya nativo; fotos desde `listing_media`).
  - `id SERIAL → UUID`: romper cualquier front/endpoint que use el id int de lp
    (`/listings-propios/{id}`, drawer, favoritos si referencian lp).
  - Ampliar enums de tipo_inmueble; añadir columnas ricas (sección A).
  - Migrar `barrio_id` (FK) ↔ `barrio` (texto).

### Opción D2 — Dejar listings_propios como está; listing como tabla nueva paralela

No unificar tablas; conectar `listing` al mapa con su propio `fuente` y que convivan.

- **Pros:** cero migración de datos; sin romper ids; incremental.
- **Contras:** **no** cumple "UN SOLO flujo"; dos formularios, dos lecturas de mapa,
  dos definiciones de "verificado", la deuda persiste y crece.

### Opción D3 — listing absorbe el flujo nuevo; listings_propios se congela (sunset suave)

`listing` pasa a ser el destino de TODA publicación nueva (owner y realtor) con B
(publica primero). `listings_propios` deja de recibir escrituras (el `/publicar` nuevo
apunta a `listing`), pero las filas viejas siguen en el mapa vía su UNION `_lp` hasta
migrarlas en background.

- **Pros:** el flujo nuevo es único desde el día 1 sin bloquear en la migración de
  datos histórica; migración de filas viejas se hace después, sin prisa.
- **Contras:** durante el sunset conviven dos fuentes en el cache (más complejidad
  temporal); hay que evitar doble-conteo si una fila se migra.

### Impacto en el mapa (cache/viewport)

- Hoy: `api/cache.py:181` UNION `_lp` lee `listings_propios WHERE estado='activo' AND
  precio_cop>0`, arma geom con `ST_MakePoint(lon,lat)`, `tier` = agente_premium/standard
  según `agente_id`.
- Tras unificar: el UNION debe leer `listing` (geom nativo, `WHERE estado='publicado'`),
  traer fotos de `listing_media`, y exponer el **eje verificado** para que el front
  pinte el badge "sin verificar" vs "verificado". El `tier` (promo pagada) sale de
  `destacado`/sponsorship, no de tener realtor.
- El front del mapa filtra/pinta por `fuente` y `tier` hoy → mantener esos campos en la
  proyección del cache evita tocar el mapa. El **badge de verificación es nuevo**:
  requiere exponer `verificado` en la fila del cache.

---

## Recomendación de arquitectura *(PROPUESTA — decides tú)*

> Marcada como propuesta. No implementar sin tu OK.

1. **Tabla única: `listing`** como base (A). Añadir columnas ricas de lp
   (`amoblado, amenidades, mascotas, permite_airbnb, area_lote_m2, contacto*,
   destacado, vistas`), fotos vía **`listing_media`** (ya sirve), ampliar enum
   `tipo_inmueble`.

2. **Verificación = flag separado (B1):** `verificado BOOLEAN` + `verificado_at` +
   `verificado_por`, ortogonal a `estado`. Nueva máquina: `borrador → publicado`
   directo (con `datos_minimos_completos`), sin moderación previa. `moderacion.py` se
   reinterpreta como cierre de verificación, apoyado en `due_diligence_item`.
   Considerar B2 (enum) solo si el dashboard necesita el estado "en dd" explícito.

3. **FK realtor nullable:** `agency_id`/`agent_id` pasan a **NULL-ables** para permitir
   "owner publica sin realtor asignado". El asignador (paso 5) los llena después.
   *Este es el cambio que desbloquea "publica primero".*

4. **Cuestionario legal = C1 (mínimo al publicar, resto en dd):** owner autoreporta lo
   básico en `intake.declaraciones` al publicar; el realtor verifica en dd y eso
   levanta `verificado=true`. Respeta el diseño que el código ya asume.

5. **Migración = D3 (sunset suave):** `/publicar` nuevo escribe a `listing`;
   `listings_propios` se congela y sus filas viejas se migran a `listing`+`listing_media`
   en background; cache lee `listing` (`estado='publicado'`, geom nativo, fotos de media,
   expone `verificado`) y se retira el UNION `_lp` al terminar el backfill.

### Bloqueantes a resolver antes de tocar código

- **`agency_id`/`agent_id` NOT NULL** en `listing` (0046) → impide publicar sin realtor.
  Es el bloqueante #1 de "publica primero".
- **`id SERIAL` (lp) vs `UUID` (listing)** → cualquier consumidor del id int de lp
  (endpoints `/listings-propios/{id}`, drawer, favoritos) hay que auditarlo antes de
  migrar.
- **`listing` no está en el cache** → sin añadirlo al UNION, unificar deja el mapa vacío
  de listings nuevos.
- **Enum `tipo_inmueble`** de listing no cubre `apartaestudio/bodega/otro` de lp.

### Qué construir vs migrar (resumen)

| Trabajo | Tipo |
|---|---|
| Columnas ricas + enum ampliado en `listing` | migración (ALTER) |
| `verificado` flag + timestamps | migración (ALTER) |
| `agency_id`/`agent_id` → nullable | migración (ALTER) |
| Reescribir `TRANSICIONES_VALIDAS` + `transition()` | código (listing_service) |
| Reinterpretar `moderacion.py` como verificación | código |
| UNION del cache: `_lp` → `listing`, exponer `verificado` | código (cache.py) |
| `/publicar` frontend → POST a listing (con fotos → listing_media) | código (front + router) |
| Backfill `listings_propios` → `listing`+`listing_media` | script de migración de datos |
| Badge "sin verificar/verificado" en mapa/drawer | código (front) |

---

## Apéndice — evidencia (archivos)

- Esquema listings_propios: `alembic/versions/0005_nuevas_tablas.py:55` + `0031_listings_propios_publicar_columns.py`
- Esquema listing + listing_media: `alembic/versions/0046_listing.py`
- Esquema intake + declaraciones: `alembic/versions/0048_intake.py`
- due_diligence_item + listing_moderacion: `alembic/versions/0050_moderacion_dd_agent_inactivo.py`
- Cuestionario legal: `api/schemas/intake_cuestionario.py`
- Máquina de estados + datos mínimos: `api/services/listing_service.py`
- Guardia de moderación: `api/routers/moderacion.py`
- Cache/mapa (UNION `_lp`, fuente='propio'): `api/cache.py:181`
- FK lp→agentes dropeada: `alembic/versions/0052_drop_fk_listings_propios_agente.py`
</content>
</invoke>
