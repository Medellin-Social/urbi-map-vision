# Modelo de publicación unificado

**Estado:** documento de diseño. Fuente de verdad del modelo de producto (Parte 1) +
plan de ajuste de backend (Parte 2). **CERO cambios de código** — esto es el plan, no la
ejecución.
**Fecha:** 2026-07-12
**Antecede:** `docs/UNIFICACION_PUBLICACION.md` (análisis de las dos tablas).

---

# PARTE 1 — Modelo de producto (fuente de verdad)

## 1.1 Un solo flujo de publicación

Cualquiera —owner o realtor— publica su inmueble **gratis**, con **fotos y datos ricos**.
El listing sale al mapa **de inmediato**, marcado **"publicado · sin verificar"**. No hay
puerta de moderación previa: publicar es instantáneo.

## 1.2 Verificación en paralelo, sin bloquear

En paralelo y sin frenar la visibilidad, un proceso (admin o job) empuja el listing a la
**cola de asignación**. El **asignador** le da un realtor (por **zona patrocinada** o por
**pool**). El realtor hace **due diligence** y, al confirmar, el listing gana el sello
**"verificado"**.

## 1.3 Publicación y verificación son ejes ORTOGONALES

No es un estado más en una secuencia. Son dos dimensiones independientes:

| | **sin verificar** | **verificado** |
|---|---|---|
| **publicado** (visible en mapa) | estado normal al publicar | tras due diligence OK |
| **no publicado** (borrador/pausado/cerrado) | posible | posible (mantiene sello) |

Un listing publicado puede estar sin verificar **o** verificado. La verificación nunca
condiciona la visibilidad.

## 1.4 Dos fuentes de ingreso SEPARADAS

- **(a) Sponsorship de zona** — el realtor paga por patrocinar una zona (comuna/barrio).
  Ya existe (`0047_sponsorship`, tabla `zona_sponsorship`). Da prioridad de asignación en
  esa zona.
- **(b) Promoción de listing** — el owner paga por **destacar/recomendar** su listing.
  Opcional, **encima** del flujo gratis. No existe aún (a construir: `destacado` + capa de
  promo).

Son ejes de negocio distintos: (a) es del realtor sobre una zona; (b) es del owner sobre
su propio listing. No se mezclan.

## 1.5 Cuestionario legal: mínimo al publicar, resto en due diligence

- El owner **autoreporta lo mínimo** al publicar (p.ej. propiedad horizontal, escritura).
- El **resto lo recolecta y verifica el realtor** en la due diligence.
- Respeta lo que ya asume `0048_intake`: *"AUTOREPORTE — no verificado. El realtor lo
  confirma después en la due diligence"*. `intake.declaraciones` (JSONB) = autoreporte;
  `due_diligence_item` = verificación por el realtor.

## 1.6 Diagrama del flujo

```
  Owner/realtor publica (gratis, fotos, datos)
        │
        ▼
  listing: estado=publicado, verificado=FALSE   ──►  MAPA (badge "sin verificar")
        │
        │  (proceso admin/job, NO bloquea)
        ▼
  cola de asignación
        │
        ▼
  asignador → realtor (zona patrocinada | pool)
        │
        ▼
  realtor hace due diligence (due_diligence_item)
        │
        ▼
  confirma  ──►  listing: verificado=TRUE   ──►  MAPA (badge "verificado")

  (ortogonal) owner paga promo → listing.destacado=TRUE  (encima, opcional)
```

---

# PARTE 2 — Plan de ajuste del backend

Ordenado por dependencia. Para cada punto: **qué se toca · migración · riesgo ·
dependencias**. Nada aquí se ejecuta; es el plan.

## Grafo de dependencias (resumen)

```
P1 (FK nullable) ──┐
P2 (eje verificado)├─► P3 (transiciones) ──► P6 (mapa) ──► P7 (cola asignación)
P4 (enum tipo) ────┤                          ▲
P5 (campos ricos) ─┘                          │
                                    P8 (sunset lp) ──────────┘
```
- **P1, P2, P4, P5** son migraciones de esquema independientes → pueden ir en paralelo.
- **P3** depende de **P2** (necesita el flag para redefinir qué significa moderación).
  La decisión cerrada de las **dos guardias** (publicar laxa / verificar estricta) **NO
  cambia el orden de P3**: la guardia estricta reusa `datos_minimos_completos` tal cual y
  se invoca en la transición a `verificado` (que solo existe una vez P2 crea el flag) →
  sigue dependiendo solo de P2. Orden intacto.
- **P6** depende de **P3 + P5** (mapa lee `estado=publicado` y campos ricos + `verificado`).
- **P7** depende de **P6** (un listing visible es lo que entra a la cola) y de **P1**
  (listing sin realtor debe existir).
- **P8** depende de **P5, P6** (listing ya absorbe lo rico y está en el mapa antes de
  migrar datos de lp).

---

## P1 — `listing.agency_id` / `agent_id` → nullable

**Qué se toca:** `alembic/versions/0046_listing.py:56-57` (definición). Requiere nueva
migración `ALTER TABLE listing ALTER COLUMN agency_id DROP NOT NULL` (idem agent_id).
También revisar `aceptar_intake()` en `api/services/intake_service.py:135` que hoy los
inserta siempre.

**Por qué:** un listing existe **antes** de tener realtor (publica primero). Con NOT NULL
un owner solo no puede insertar. **Bloqueante #1 de "publica primero".**

**Migración:** sí (ALTER, no destructiva; `DROP NOT NULL` es reversible con `SET NOT NULL`
si no hay NULLs).

**Riesgo:** bajo. Revisar que ningún query asuma `agent_id` no-nulo (joins internos del
dashboard del realtor). El FK sigue con `ON DELETE RESTRICT`/`SET NULL` — sin cambio de
integridad.

**Dependencias:** ninguna (va primero, junto con P2/P4/P5).

---

## P2 — Eje de verificación separado del estado de publicación

**Qué se toca:** nueva migración `ALTER TABLE listing ADD COLUMN`.

**PROPUESTA: `verificado BOOLEAN NOT NULL DEFAULT FALSE`** + `verificado_at TIMESTAMPTZ` +
`verificado_por UUID REFERENCES agent(id)`.

**Por qué bool y no `estado_verificacion` ENUM:**
- El producto (1.3) define **dos** valores de resultado: sin verificar / verificado. Un
  bool los captura.
- El estado intermedio *"realtor trabajando la dd"* **ya está modelado** en
  `due_diligence_item.estado` (`pendiente/verificado/rechazado`, `0050`). Un enum de
  cabecera sería redundante — derivable de los ítems.
- Añadir valor a un ENUM de Postgres **no es reversible** (documentado en `0050`, no hay
  `DROP VALUE`). Un bool no tiene ese costo.

**Alternativa (si el dashboard exige el estado "en dd" explícito en cabecera):**
`estado_verificacion ENUM(sin_verificar, en_dd, verificado, rechazado_dd)`. Más expresivo,
pero dos enums a sincronizar y el costo de ALTER TYPE. **No recomendada** salvo que el
dashboard lo pida y no quiera derivarlo de `due_diligence_item`.

**Migración:** sí (ADD COLUMN con DEFAULT; barato en PG≥11, no reescribe tabla).

**Riesgo:** bajo. Es aditivo.

**Dependencias:** ninguna para crear la columna; **habilita P3**.

---

## P3 — Reescribir `TRANSICIONES_VALIDAS`: `borrador → publicado` directo

> **⭐ DECISIÓN CERRADA** (guardias de datos). El resto de P3 sigue como propuesta.

**Qué se toca:** `api/services/listing_service.py:5` (`TRANSICIONES_VALIDAS`),
`:75` (`transition()`), y `api/routers/moderacion.py` (reinterpretar la guardia).

**Hoy:**
```
borrador → en_revision → publicado   (moderación es la PUERTA de publicación)
```
**Propuesto:**
```
borrador   → publicado              (directo, sin en_revision como puerta)
publicado  → pausado / cerrado
pausado    → publicado / cerrado
```
`en_revision`/`rechazado` dejan de ser puerta de **publicación**. La moderación
(`moderacion.py`) pasa a **cerrar el eje `verificado`**: `aprobar` ⇒ `verificado=TRUE`
(+ timestamps), apoyada en que `due_diligence_item` esté completo. `rechazar` ⇒ deja
`verificado=FALSE` + registra motivo en `listing_moderacion` (reinterpretado como bitácora
de verificación).

**Guardia de datos — DOS guardias en ejes distintos · DECISIÓN CERRADA:**

Hay **dos** guardias, no una, y cada una vigila su propio eje:

**1. Guardia de PUBLICAR (laxa) — solo lo indispensable para un pin en el mapa:**
- Exige únicamente: `operacion`, `tipo_inmueble`, `geom` (ubicación).
- **Precio, área, fotos NO bloquean** la publicación.
- Baja fricción: el listing sale al mapa "publicado · sin verificar" con lo mínimo.
- Se aplica en la transición **`borrador → publicado`**. Es una guardia **nueva y
  laxa** (3 campos), NO `datos_minimos_completos`.

**2. Guardia de VERIFICAR (estricta) — los 8 mínimos completos + dd legal:**
- Exige los 8 mínimos: `precio > 0`, `area_m2`, foto de portada, `titulo`,
  `tipo_inmueble`, `operacion`, `geom`, `barrio/municipio`, + `habitaciones`/`banos`
  condicional (apartamento/casa).
- **Es la guardia que YA existe:** `datos_minimos_completos` (`listing_service.py:35`,
  Prompt 6). **Se reutiliza TAL CUAL** — no se reescribe.
- Lo que cambia es **CUÁNDO se invoca:** ya **NO** en la transición a `publicado`, sino
  al **otorgar el sello `verificado`** (junto con la due diligence legal completa).

**Consecuencia — el precio placeholder deja de ser deuda:**
- Un listing **nace sin precio**, publicado-sin-verificar de forma **legítima**. El
  precio es requisito del **SELLO**, no de la publicación.
- La validación **`precio <= 0`** (hoy dentro de `datos_minimos_completos`,
  `listing_service.py`) **se mueve del gate de publicación al gate de verificación**.
  El placeholder `precio = 0` de `aceptar_intake` (`intake_service.py:157`) ya no es
  un caso a esquivar: es un estado válido de un listing publicado-sin-verificar.

**Dónde se invoca cada una (resumen):**

| Transición | Guardia | Función |
|---|---|---|
| `borrador → publicado` | laxa (operacion, tipo_inmueble, geom) | **nueva**, 3 campos |
| `* → verificado=TRUE` | estricta (8 mínimos) + dd legal | `datos_minimos_completos()` **reusada** |

**Migración:** no (es lógica). Nota: el enum `listing_estado` conserva `en_revision`/
`rechazado` aunque dejen de usarse como puerta — quitarlos exige recrear el tipo (evitar).

**Riesgo:** medio. Cambia el contrato de moderación y de qué significa "publicado".
Auditar todo consumidor de `en_revision` (dashboard admin, tests). Riesgo de que algo
espere la puerta vieja.

**Dependencias:** **P2** (necesita el flag `verificado` para redefinir moderación).

---

## P4 — Ampliar enum `listing_tipo_inmueble`

**Qué se toca:** `alembic/versions/0046_listing.py:36-38`. Nueva migración
`ALTER TYPE listing_tipo_inmueble ADD VALUE`.

**Hoy:** `apartamento, casa, local, oficina, lote, finca`.
**Falta (de lp):** `apartaestudio`, `bodega`, `otro`. (lp usa VARCHAR libre —
`publicar.tsx` ofrece esos tres.)

**Opción alterna:** mapear `apartaestudio→apartamento`, `bodega→local`, `otro→otro`. Pero
`finca` no está en lp y `otro` sí falta en el enum → al menos `otro` hay que añadirlo.

**PROPUESTA:** añadir los tres (`apartaestudio, bodega, otro`) — fidelidad de datos sobre
mapeo con pérdida.

**Migración:** sí. ⚠️ `ALTER TYPE ADD VALUE` **no es reversible** (mismo caveat que 0050).
Idempotente con `IF NOT EXISTS`. No se puede usar el valor nuevo en la misma transacción.

**Riesgo:** bajo-medio. Irreversibilidad del enum. Alternativa de fondo: mover
`tipo_inmueble` a TEXT + CHECK (reversible, flexible) — decisión aparte.

**Dependencias:** ninguna. Debe ir **antes** del backfill de lp (P8), que necesita esos
valores.

---

## P5 — Absorber campos ricos de `listings_propios` a `listing`

**Qué se toca:** nueva migración `ALTER TABLE listing ADD COLUMN`. Fuente:
`alembic/versions/0005_nuevas_tablas.py:55` + `0031_...columns.py`.

**Columna por columna a añadir a `listing`:**

| Columna nueva en listing | Tipo propuesto | Origen lp | Nota |
|---|---|---|---|
| `amoblado` | BOOLEAN | `amoblado BOOLEAN` | falta en listing |
| `amenidades` | TEXT[] | `amenidades TEXT[]` | falta |
| `mascotas` | BOOLEAN | `mascotas BOOLEAN` | falta |
| `permite_airbnb` | BOOLEAN | `permite_airbnb BOOLEAN` | falta |
| `area_lote_m2` | NUMERIC | `area_lote_m2 DOUBLE` | falta (listing solo tiene area_m2) |
| `nombre_contacto` | TEXT | `nombre_contacto TEXT` | contacto del owner |
| `telefono` | TEXT | `telefono TEXT` | contacto |
| `email_contacto` | TEXT | `email_contacto TEXT` | contacto |
| `horario_contacto` | TEXT | `horario_contacto TEXT` | contacto |
| `destacado` | BOOLEAN DEFAULT FALSE | `destacado BOOLEAN` | **eje promo (1.4b)** |
| `vistas` | INTEGER DEFAULT 0 | `vistas INTEGER` | métrica |

**Fotos:** **NO** columna. `listing_media` (`0046`, `url/orden/es_portada`) **ya sirve** y
es más rica que `fotos TEXT[]`. Backfill: `fotos[i]` → fila `listing_media` con
`orden=i`, `es_portada=(i==0)`.

**Ya presentes en listing (no añadir):** `administracion`, `parqueaderos`, `estrato`,
`antiguedad_anios`, `descripcion`, `titulo`, `video_url`, `tour_url`, `mostrar_exacto`.

**Decisión de contacto:** ¿el listing unificado guarda contacto del owner, o siempre
enruta por el realtor asignado? Añadir las columnas no obliga a usarlas; permite el caso
"owner sin realtor todavía". **PROPUESTA:** añadirlas (owner solo necesita contacto antes
de tener realtor).

**Migración:** sí (ADD COLUMN aditivo, barato).

**Riesgo:** bajo. Aditivo.

**Dependencias:** ninguna para crear; **P6 y P8 dependen de esto** (mapa y backfill
necesitan las columnas).

---

## P6 — Conectar `listing` al mapa (hallazgo #1)

**Qué se toca:** `api/cache.py` — el UNION `todas_fuentes` (`:128`) hace UNION de
metrocuadrado, premium (`_pr`), renta_media (`_rm`) y **listings_propios (`_lp`, `:181`)**
pero **NUNCA de `listing`**. **El mundo realtor hoy es invisible en el mapa.**

**Cambio:** añadir un `UNION ALL` que lea `listing`:
- `WHERE estado = 'publicado'` (no `borrador/pausado/cerrado`).
- `geom` **nativo** (ya es `GEOMETRY(Point,4326)` — no hace falta `ST_MakePoint` como en
  lp).
- fotos desde `listing_media` (agregación a array o join a portada).
- **exponer `verificado`** en la proyección del viewport/detail → el front pinta el badge
  "sin verificar" vs "verificado".
- `fuente` nuevo (p.ej. `'listing'` o mantener `'propio'` si se unifica con lp en P8).
- `tier`/promo desde `destacado` + `zona_sponsorship`, no desde "tener realtor".

**Front:** el mapa ya filtra/pinta por `fuente` y `tier`; mantenerlos en la proyección
evita tocarlo. El **badge `verificado` es campo nuevo** → hay que exponerlo en el viewport
y en el detail (drawer).

**Migración:** no (es SQL del cache + regeneración de la materialización). Requiere
refrescar el cache tras el cambio.

**Riesgo:** medio. El cache es el corazón del mapa; un UNION mal formado rompe TODOS los
listings. Cuidar tipos (el UNION exige columnas alineadas) y `NULL::tipo` en los campos
que listing no tenga. Riesgo de doble-conteo con lp durante P8 (mitigar: ver P8).

**Dependencias:** **P3** (define `estado='publicado'` como visible) + **P5** (campos ricos
en la proyección) + **P2** (flag `verificado` a exponer).

---

## P7 — Un listing publicado entra a la cola de asignación (eslabón nuevo)

**El problema:** el asignador **hoy toma un `intake`, no un `listing`**. Evidencia:
`api/services/asignador_service.py:54` `asignar_intake(intake, ...)` y `:109`
`tomar_del_pool` operan sobre `intake` (`estado nuevo→asignado/en_pool`, `zona_codigo`).
`api/routers/asignador.py:35,74` idem. El `listing` no aparece en ningún punto del
asignador. En el modelo nuevo el listing nace primero (publicado) y **necesita** entrar a
esa cola.

**Opciones (no decido — marcadas):**

### Opción P7-A — El listing genera un `intake` "sombra" al publicarse
Al crear el listing publicado, se crea un `intake` (estado `nuevo`) enlazado
(`intake.listing_id` ya existe, `0048`). El asignador corre **sin cambios** sobre ese
intake; al asignar/tomar, el realtor trabaja el intake y su due diligence, y el resultado
sella `listing.verificado`.
- **Pros:** asignador y due diligence intactos (menor cambio). `intake.listing_id` ya está
  pensado para enlazar. Reusa `en_pool`/sponsorship tal cual.
- **Contras:** dos filas por inmueble (listing + intake sombra) → sincronía y posible
  divergencia de datos. Invierte la relación original (antes intake→listing; ahora
  listing→intake).

### Opción P7-B — El asignador aprende a tomar `listing` directamente
Generalizar `asignar_intake`/`tomar_del_pool` para operar sobre una "unidad asignable"
que puede ser listing. Añadir a `listing` los campos de cola (`agent_id` ya está;
`zona_codigo`/`zona_nivel` habría que resolver como en intake).
- **Pros:** una sola entidad, sin fila sombra. Modelo más limpio a largo plazo.
- **Contras:** reescribe el asignador (hoy acoplado a `intake`), `due_diligence_item.intake_id`
  pasa a necesitar `listing_id` (migración + FK), y `intake_estado` (`en_pool`, etc.) hay
  que replicar o mover a listing. Cambio grande y de mayor riesgo.

### Opción P7-C — Un job periódico crea intake desde listings publicados sin realtor
Job (cron) que barre `listing WHERE estado='publicado' AND agent_id IS NULL AND
verificado=FALSE` y les crea el intake de asignación (o llama al asignador).
- **Pros:** desacopla publicación de asignación (el producto pide "proceso admin/job, no
  bloquea"); reintentable; controlable el ritmo de reparto.
- **Contras:** latencia (no es en el acto); infra de job; idempotencia (no crear dos
  intakes por listing).

**PROPUESTA:** **P7-A + P7-C combinados** — el listing genera un intake sombra (A), pero
el disparo lo hace un **job/acción admin** (C), no el request de publicación. Encaja con
"en paralelo y sin bloquear" (1.2) y con el comentario ya presente en
`api/routers/asignador.py:33-34` ("auto-dispara al crear el intake… dejarlo manual da
control mientras se estabiliza"). P7-B queda como norte a largo plazo si la fila sombra
molesta.

**Migración:** A/C → poca o ninguna de esquema (reusa intake). B → migración grande
(mover cola a listing, FK de dd).

**Riesgo:** A: divergencia listing↔intake. B: alto (reescritura del asignador). C:
idempotencia del job.

**Dependencias:** **P6** (el listing ya visible/publicado es lo que entra a la cola) +
**P1** (listing sin realtar debe poder existir).

---

## P8 — Sunset de `listings_propios`

**Plan (D3 del análisis previo — sunset suave):**
1. `/publicar` nuevo **escribe a `listing`** (con fotos → `listing_media`), no a lp.
   Toca: `api/routers/listings_propios.py` (POST) y `src/routes/publicar.tsx`.
2. `listings_propios` **se congela** (deja de recibir escrituras). Filas viejas siguen
   visibles vía su UNION `_lp` (`cache.py:181`) hasta migrarlas.
3. **Backfill** en background: `listings_propios → listing` (+ `listing_media`).
4. Al terminar el backfill, **retirar el UNION `_lp`** del cache (queda solo el UNION de
   `listing`). Deprecar/dropear lp.

**Migración de datos — mapeo de backfill (por fila lp):**

| listing_propios | → listing | Transformación |
|---|---|---|
| `id SERIAL` | `id UUID` | **generar UUID**; guardar mapa `id_int→uuid` para consumidores |
| `lat`,`lon` | `geom` | `ST_SetSRID(ST_MakePoint(lon,lat),4326)` |
| `barrio_id` (FK) | `barrio`,`municipio` (texto) | resolver nombre desde `raw.barrios` |
| `precio_cop` | `precio` + `moneda='COP'` | directo |
| `tipo_operacion` | `operacion` (enum) | directo |
| `tipo_inmueble` (VARCHAR) | `tipo_inmueble` (enum) | requiere **P4** (apartaestudio/bodega/otro) |
| `fotos TEXT[]` | filas `listing_media` | `orden=i`, `es_portada=(i==0)` |
| ricos (amoblado, amenidades, mascotas, permite_airbnb, area_lote_m2, contacto, destacado, vistas) | columnas homónimas | requiere **P5** |
| `estado`(activo/vendido/…) | `estado`(publicado/cerrado…) | mapear: activo→publicado, vendido/arrendado→cerrado, pausado→pausado |
| — | `agency_id`,`agent_id` | NULL (lp no tiene realtor tras 0052) → requiere **P1** |
| — | `verificado` | FALSE (lp nunca fue verificado) |

**Bloqueante `id SERIAL → UUID`:** auditar consumidores del id int de lp **antes** de
migrar: `/listings-propios/{id}` (`config/api.ts:76`), drawer, favoritos si referencian
lp. Sin auditar, el backfill rompe enlaces vivos.

**Doble-conteo:** mientras P6 (listing en el mapa) y el UNION `_lp` coexisten, una fila
migrada aparecería dos veces. Mitigar: marcar lp migradas (`estado='migrado'` o flag) y
excluirlas del UNION `_lp`, o migrar+retirar `_lp` en una sola ventana.

**Migración:** sí (script de datos, no solo DDL). Grande.

**Riesgo:** alto. Es migración de datos productivos + reescritura del cache + ruptura de
ids. Hacer en background, idempotente, con verificación de conteos antes de retirar `_lp`.

**Dependencias:** **P4** (enum tipo), **P5** (columnas ricas), **P1** (FK nullable), **P6**
(listing ya en el mapa antes de mover lp).

---

## Resumen: orden de ejecución propuesto

| # | Paso | Migración | Riesgo | Depende de |
|---|---|---|---|---|
| P1 | FK agency/agent → nullable | ALTER | bajo | — |
| P2 | flag `verificado` + timestamps | ADD COL | bajo | — |
| P4 | enum tipo_inmueble +3 | ALTER TYPE (irrev.) | bajo-med | — |
| P5 | columnas ricas de lp | ADD COL | bajo | — |
| P3 ⭐ | transiciones + 2 guardias (publicar laxa / verificar estricta) | no (lógica) | medio | P2 |
| P6 | listing → UNION del cache + badge verificado | no (SQL cache) | medio | P3, P5, P2 |
| P7 | listing publicado → cola asignación | según opción | A/C bajo, B alto | P6, P1 |
| P8 | sunset + backfill de lp | script datos | alto | P4, P5, P1, P6 |

**Fase 1 (paralelo, esquema):** P1, P2, P4, P5.
**Fase 2 (lógica/mapa):** P3 → P6.
**Fase 3 (eslabón + migración):** P7 → P8.

---

## Recomendación *(PROPUESTA — decides tú)*

> Marcada como propuesta. No implementar sin OK.

- **Verificación:** `verificado BOOLEAN` (P2), no enum — el estado intermedio ya vive en
  `due_diligence_item`.
- **Publicación (⭐ DECISIÓN CERRADA):** `borrador → publicado` directo (P3) con **guardia
  laxa** (solo operacion + tipo_inmueble + geom). La **guardia estricta** (8 mínimos,
  `datos_minimos_completos` reusada) se mueve al gate de **verificado**, junto con la dd
  legal. El precio deja de ser deuda: `precio <= 0` se valida al verificar, no al publicar.
- **Cola de asignación:** **P7-A + P7-C** — listing genera intake sombra, disparado por
  job/admin (no por el request). P7-B (asignador toma listing) como norte lejano.
- **Sunset:** D3 suave (P8) — `/publicar` escribe a listing ya; lp se congela y migra en
  background; `_lp` se retira al cuadrar conteos.

### Bloqueantes duros (resolver antes de ejecutar)
1. **FK NOT NULL** de listing (P1) — sin esto no hay "publica primero".
2. **`id SERIAL` vs UUID** (P8) — auditar consumidores del id int de lp antes de migrar.
3. **listing fuera del cache** (P6) — sin el UNION, unificar deja el mapa sin listings
   nuevos.
4. **Irreversibilidad de enums** (P4, y `en_revision` residual en P3) — asumir o mover a
   TEXT+CHECK.

---

## Apéndice — evidencia (archivo:línea)

- listing + listing_media + enums + FK NOT NULL: `alembic/versions/0046_listing.py:56`
- intake + declaraciones + `listing_id`: `alembic/versions/0048_intake.py`
- due_diligence_item + listing_moderacion: `alembic/versions/0050_moderacion_dd_agent_inactivo.py`
- sponsorship de zona: `alembic/versions/0047_sponsorship.py`
- listings_propios esquema: `alembic/versions/0005_nuevas_tablas.py:55` + `0031_listings_propios_publicar_columns.py`
- FK lp→agentes dropeada: `alembic/versions/0052_drop_fk_listings_propios_agente.py`
- Máquina de estados + datos mínimos: `api/services/listing_service.py:5,35,75`
- Guardia de moderación: `api/routers/moderacion.py`
- Asignador (opera sobre INTAKE, no listing): `api/services/asignador_service.py:54,109` · `api/routers/asignador.py:35,74`
- Cache/mapa (UNION `_lp`, sin listing): `api/cache.py:128,181`
- Cuestionario legal: `api/schemas/intake_cuestionario.py`
</content>
</invoke>
