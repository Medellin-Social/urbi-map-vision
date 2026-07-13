# AUDITORÍA — Flujo de realtors: estado real en código

> 100% READ-ONLY. Fecha: 2026-07-12. Cero cambios aplicados.
> Contexto: migraciones 0045–0051 aplicadas; borrado portal viejo Fases A–D hechas, Fase E pendiente.
> Clasificación FE: **CABLEADA** (pantalla → endpoint real) / **MOCK** (pantalla con datos falsos) / **SIN UI** (backend sin pantalla) / **AUTOMÁTICO** (server-side, no necesita UI).

---

## Tabla resumen

| # | Paso | Backend (evidencia) | Frontend | Estado real |
|---|------|---------------------|----------|-------------|
| 1 | Owner sube inmueble (intake + cuestionario) | ✅ `POST /api/v1/intake` ([intake.py:43](../api/routers/intake.py#L43)), `GET /cuestionario` ([intake.py:147](../api/routers/intake.py#L147)), `GET /intake/mias` (l.92), `GET /intake/{id}` (l.108); servicio [intake_service.crear_intake:45](../api/services/intake_service.py#L45). Registrado en [main.py:140](../api/main.py#L140) | **SIN UI** — ninguna página POSTea `/intake` ni consume `/cuestionario`. `/publicar` sigue posteando a `listings-propios` ([publicar.tsx:1299](../src/routes/publicar.tsx#L1299)). Ni `config/api.ts` tiene entradas intake | Backend completo pero **inalcanzable para un owner real**; además tiene bug de identidad (D1) que lo rompería al primer uso |
| 2 | Asignador resuelve zona (PostGIS) | ✅ [zona_service.resolver_zona:16](../api/services/zona_service.py#L16) — `ST_Contains(raw.barrios.geometry, punto)`; lo llaman `crear_intake` ([intake_service.py:15](../api/services/intake_service.py#L15)) y `asignar_intake` ([asignador_service.py:66-68](../api/services/asignador_service.py#L66)) | **AUTOMÁTICO** (ok sin UI) | Hecho y con doble uso (al crear intake y como fallback al asignar). Solo resuelve `barrio_id`; comuna/municipio sin código canónico (ponytail declarado en el servicio) |
| 3 | Asigna a realtor (patrocinador de zona, o pool) | ✅ `POST /api/v1/intake/{id}/asignar` (admin) ([asignador.py:35](../api/routers/asignador.py#L35)), `GET /api/v1/pool` (l.51), `POST /api/v1/pool/{id}/tomar` (l.74); lógica en [asignador_service.asignar_intake:54](../api/services/asignador_service.py#L54) (sponsorship por antigüedad → owner activo de la agency → si no, `en_pool`) y [tomar_del_pool:109](../api/services/asignador_service.py#L109) (UPDATE atómico). Registrado [main.py:143](../api/main.py#L143) | **MOCK** — el pool del dashboard lee `mockApi.getPool()` ([realtorApi.ts:240](../src/lib/realtorApi.ts#L240)). El `httpApi` apunta a `/realtor/pool` que **no existe** (real: `/pool`) — ver D3 | Backend hecho (asignación manual admin, no auto al crear intake — decisión comentada en [asignador.py:32-34](../api/routers/asignador.py#L32)). UI en mock y con paths desalineados |
| 4 | Due diligence (realtor verifica lo declarado) | ⚠️ Parcial: `GET /intake/{id}/due-diligence` ([intake.py:126](../api/routers/intake.py#L126)) es **solo lectura**. El servicio tiene [generar_checklist:31](../api/services/due_diligence_service.py#L31) y [verificar_item:45](../api/services/due_diligence_service.py#L45) pero **ningún router los llama** (solo tests: [test_moderacion_flow.py:13](../api/tests/test_moderacion_flow.py#L13)). El checklist nunca se genera ni se puede marcar verificado vía API | **SIN UI** (y el GET devolvería siempre `items: []`, `completo: false`) | Servicio escrito, **flujo desconectado**: falta hook que genere el checklist (al asignar/aceptar) y endpoint PATCH para verificar items |
| 5 | Realtor arma listing (nace en borrador) | ⚠️ Parcial: [intake_service.aceptar_intake:104](../api/services/intake_service.py#L104) crea `listing` en `'borrador'` (INSERT [l.132](../api/services/intake_service.py#L132)) y enlaza el intake — pero **ningún endpoint lo llama** (solo tests). Tampoco existe endpoint para editar el borrador ni para pasarlo `borrador → en_revision` ([listing_service.transition:75](../api/services/listing_service.py#L75) define la máquina de estados; `datos_minimos_completos` l.37 valida precio/fotos) | **MOCK** — botón "publicar" del dashboard llama `mockApi.publicarAsignado` = no-op ([realtorApi.ts:261-263](../src/lib/realtorApi.ts#L261): "ponytail: mock no-op; real impl POSTs intake → listing borrador → en_revision") | Servicios y máquina de estados hechos; **falta toda la capa de endpoints del realtor** (aceptar intake, editar listing, enviar a revisión) |
| 6 | Moderación (aprobar / rechazar) | ✅ `POST /api/v1/admin/listings/{id}/aprobar` ([moderacion.py:31](../api/routers/moderacion.py#L31)), `POST .../rechazar` (l.41); servicio [moderacion_service](../api/services/moderacion_service.py) con bitácora `listing_moderacion` y validación de transición. Registrado [main.py:141](../api/main.py#L141) | **SIN UI** — no hay pantalla ni entrada en `config/api.ts` para `/admin/listings/*`. (No confundir con [admin/agentes.tsx](../src/routes/admin/agentes.tsx), que es aprobación de **agentes**, no de listings — esa sí está CABLEADA, ver "extra" abajo) | Backend completo; falta la cola de moderación de listings en el admin |
| 7 | Publicado (visible en mapa) | ❌ **No conectado.** `moderacion_service.aprobar` deja `listing.estado='publicado'` ([moderacion_service.py:20](../api/services/moderacion_service.py#L20)), pero ni el viewport ni el cache leen la tabla `listing`: `/viewport` lee `staging.stg_listings_unificado` ([listings.py:899](../api/routers/listings.py#L899)) y el rebuild del cache UNIONa solo `raw.listings_metrocuadrado + fincaraiz + premium + renta_media + public.listings_propios` ([cache.py:122-208](../api/cache.py#L122)). El `FROM listing l` de [listings.py:736](../api/routers/listings.py#L736) es un **CTE** local sobre staging, no la tabla 0046 | **CABLEADA para lo viejo** — el mapa funciona, pero con fuentes scrapeadas + `listings_propios`; un listing de realtor publicado **jamás aparece** | El último eslabón no existe: falta UNION de `listing WHERE estado='publicado'` en `_REFRESH_STG_LISTINGS` (o equivalente) |

---

## Verificaciones específicas pedidas

**Paso 1 — ¿form que POSTee /intake?** No. Búsqueda de `intake`/`cuestionario` en `src/` solo da `realtorApi.ts`, `useRealtorDashboard.ts`, `realtor/dashboard.tsx` (tipos y mock). El único form de captación vivo es `/publicar` → `POST /listings-propios` ([publicar.tsx:1299](../src/routes/publicar.tsx#L1299)). Endpoint sin pantalla.

**Pasos 3–5 — ¿dashboard en mock?** Sí. Cadena: [dashboard.tsx](../src/routes/realtor/dashboard.tsx) → [useRealtorDashboard.ts:2](../src/hooks/useRealtorDashboard.ts#L2) → [realtorApi.ts:292-293](../src/lib/realtorApi.ts#L292):

```ts
export const realtorApi: RealtorDashboardApi =
  import.meta.env.VITE_REALTOR_USE_MOCK !== "false" ? mockApi : httpApi;
```

`VITE_REALTOR_USE_MOCK` **no está definido** en `.env` ni `.env.local` (verificado) → `undefined !== "false"` → **mockApi activo**. Y aunque se pusiera en `false`, el `httpApi` ([realtorApi.ts:282-288](../src/lib/realtorApi.ts#L282)) apunta a 7 rutas de las cuales **5 no existen** en backend (ver D3).

**Paso 6 — ¿pantalla de moderación admin?** Para **listings no existe**. Existe [admin/agentes.tsx](../src/routes/admin/agentes.tsx) CABLEADA a `/admin/agentes` + `aprobar/rechazar/suspender` reales ([agentes.tsx:79-95](../src/routes/admin/agentes.tsx#L79), backend [admin_agentes.py:32-65](../api/routers/admin_agentes.py#L32)) — pero eso modera el **registro del realtor** (paso previo al flujo), no la publicación del listing.

**Paso 7 — fuentes del mapa (evidencia):** `_REFRESH_STG_LISTINGS` ([cache.py:122](../api/cache.py#L122)) UNIONa exactamente 5 fuentes: `raw.listings_metrocuadrado` (l.143), `raw.listings_fincaraiz` (l.160), `raw.listings_premium` (l.172), `raw.listings_renta_media` (l.182), `public.listings_propios WHERE estado='activo'` (l.204-208). La tabla `listing` (0046) **no está**. `/viewport` ([listings.py:980](../api/routers/listings.py#L980)) y el detalle (l.630) leen solo `staging.stg_listings_unificado`.

---

## Discrepancias

**D1 — 🔴 `POST /intake` está roto por identidad owner (bug latente).** `intake.owner_id` es **UUID NOT NULL FK → owner(id)** ([0048_intake.py:57](../alembic/versions/0048_intake.py#L57)), pero el endpoint pasa `user.get("id")` = `usuarios.id` **INT** ([intake.py:51](../api/routers/intake.py#L51), l.80). El primer POST real fallaría (tipo/FK). Falta el eslabón usuario→owner (crear/resolver fila `owner` a partir del usuario autenticado). Mismo problema en `GET /intake/mias` (l.98-104) y en `GET /intake/{id}` l.120-122, que compara `str(usuarios.id)` contra `owner_id`/`agent_id` UUID → nunca matchea → 403 incluso para el dueño legítimo o el realtor asignado.

**D2 — 🔴 Pasos 4 y 5 sin capa HTTP.** `generar_checklist`, `verificar_item` y `aceptar_intake` solo se llaman desde tests. No hay endpoint para: generar checklist DD, marcar item verificado, aceptar intake (crear borrador), editar borrador, ni `borrador → en_revision`. La máquina de estados ([listing_service.transition](../api/services/listing_service.py#L75)) existe pero nadie la conduce.

**D3 — 🟠 `httpApi` del dashboard desalineado con el backend real.** De sus 7 rutas ([realtorApi.ts:282-288](../src/lib/realtorApi.ts#L282)): `/realtor/me`, `/realtor/asignados`, `/realtor/listings`, `/realtor/asignados/{id}/publicar`, `/barrios/{code}/inteligencia` → **no existen**. `/realtor/pool` y `/realtor/pool/{id}/tomar` existen pero en `/api/v1/pool[...]` (asignador montado sin prefijo `realtor`, [main.py:143](../api/main.py#L143)). Poner `VITE_REALTOR_USE_MOCK=false` hoy = dashboard 404 en todo. (Coincide con memoria del proyecto: dashboard esperaba 7 endpoints `/realtor/*` que nunca se crearon.)

**D4 — 🔴 Listing publicado invisible en el mapa.** Paso 7 sin implementar (ver tabla). El flujo entero, aunque se cableara, hoy termina en una fila `listing.estado='publicado'` que ninguna query de mapa/detalle lee.

**D5 — 🟠 Asignación no es automática.** El flujo esperado dice "asignador resuelve" tras el intake, pero `asignar` es endpoint **admin-only manual** ([asignador.py:32-36](../api/routers/asignador.py#L32), comentario explícito: "Idealmente se auto-dispara al crear el intake (paso 4) — dejarlo manual da control"). Decisión deliberada, pero es un humano en el loop que el flujo de 7 pasos no menciona.

**D6 — 🟡 Cruce con Fase E (borrado portal viejo).** El tier `agente_premium` del cache viene de `listings_propios.agente_id IS NOT NULL` ([cache.py:186-187](../api/cache.py#L186)) — columna del portal viejo, FK ya suelta (0052), y que el sub-plan Fase E deja de poblar (`agente_id=NULL`). Tras Fase E ese CASE queda muerto (siempre `'standard'`); inofensivo pero es código zombi. Nada del flujo nuevo (0045–0051) depende de tablas por borrar: `intake/listing/agent/agency/sponsorship` son independientes de `agentes` ✅.

**D7 — 🟡 Construido pero fuera de la lista de 7 pasos.** (a) Aprobación de **agentes** (registro realtor): backend [admin_agentes.py](../api/routers/admin_agentes.py) + UI [admin/agentes.tsx](../src/routes/admin/agentes.tsx) CABLEADA — paso 0 real del flujo. (b) `sponsorship`: tabla (0047) + [sponsorship_service](../api/services/sponsorship_service.py) consultados por el asignador, pero **sin CRUD**: no hay endpoint ni UI para crear/vender un patrocinio de zona — hoy solo por SQL manual. (c) No existe registro self-service del realtor (nada crea filas `agent` salvo SQL manual; el form viejo de 6 pasos se borró en Fase D).

---

## Lectura ejecutiva

- **Hecho de verdad (backend):** zona PostGIS, asignador sponsorship→pool con toma atómica, moderación de listings con bitácora, moderación de agentes (con UI), esquema completo 0045–0051.
- **Escrito pero desconectado:** intake (bug identidad owner), due diligence (sin generación ni verificación vía API), aceptar-intake/borrador (sin endpoints).
- **Sin construir:** UI de intake del owner, endpoints `/realtor/*` del dashboard, UI moderación de listings, CRUD de sponsorship, registro de realtor, y la inserción de `listing` publicado en el pipeline del mapa.
- **En mock:** todo el dashboard del realtor (flag `VITE_REALTOR_USE_MOCK` ausente → mock por defecto).

El "COMPLETO" de la memoria del proyecto aplica a **migraciones + servicios de dominio**, no al flujo end-to-end: hoy ningún owner puede iniciar el paso 1 desde la UI, y ningún listing de realtor puede llegar al mapa.
