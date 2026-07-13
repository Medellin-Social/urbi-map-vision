# FASE E — Sub-plan: desacoplar `listings_propios.py` de `agentes` antes del DROP

> 100% READ-ONLY. Análisis y propuesta. CERO cambios aplicados.
> Fecha: 2026-07-12. Pre-requisito del DROP final (`agentes` + satélites).
> Contexto: Fases A–D ya commiteadas (es_agente→agent, FK suelta 0052, router viejo borrado, FE viejo borrado). `listings_propios.py` es lo último que lee `agentes`.

---

## Estado de partida

- `api/routers/listings_propios.py` lee `public.agentes` en 4 puntos: líneas **25, 353, 382, 483**.
- FK `listings_propios.agente_id → agentes` ya suelta (migración 0052). La columna `agente_id INT` sigue existiendo.
- `agent` (nuevo, 0045) es UUID con columnas `id, usuario_id, email, nombre, telefono, foto_url, estado`. **No tiene** `nombre_completo, foto_perfil, whatsapp, zonas_opera, slug` del viejo.
- `get_current_user` (dependencies.py:40) **ya devuelve `es_agente`** derivado de `agent` (Fase A). Esto es la palanca principal: la mitad de los usos de `agentes` en este router se resuelven leyendo `current_user["es_agente"]` en vez de consultar tabla.
- Incompatibilidad de tipos clave: `agent.id` es **UUID**, `listings_propios.agente_id` es **INT**. No hay reapunte directo posible de esa columna sin migración de tipo; el diseño nuevo no la necesita (el listing del realtor vive en la tabla `listing` de 0046, no en `listings_propios`).

---

## Análisis query por query

### Q1 — Línea 25: helper `_get_agente_id(pool, user_id)`

```sql
SELECT id FROM agentes WHERE usuario_id = $1 AND estado = 'aprobado'
```

**Qué hace:** resuelve el `agentes.id` (INT) del usuario autenticado si es agente aprobado del portal viejo. Lo usan **4 endpoints**:

| Consumidor | Para qué |
|---|---|
| `GET /me` (l.60) | flag `es_agente` + `agente_id` para el form de publicar |
| `POST /` `crear_listing` (l.114) | si es agente: `estado='activo'`, `destacado=true`, guarda `agente_id` |
| `GET /solicitudes/pendientes` (l.407) | gate "solo agentes verificados" del inbox de solicitudes |
| `PATCH /solicitudes/{id}` (l.439) | gate + identifica al agente que acepta/rechaza |

**Clasificación: MIXTA — se parte en dos.**

- **`/me` y `crear_listing` → REAPUNTAR (sin query nueva).** El front ([publicar.tsx:1227](../src/routes/publicar.tsx#L1227)) solo consume `es_agente`, `nombre`, `email` del `/me` — **nunca usa `agente_id`**. Reapunte propuesto:
  - `/me`: devolver `current_user["es_agente"]` (ya viene de `agent` vía auth). Eliminar `agente_id` de la respuesta (o devolver `None`; el front no lo lee).
  - `crear_listing`: `es_agente = current_user["es_agente"]`; insertar `agente_id = NULL` siempre. El comportamiento visible (agente publica → activo + destacado; propietario → pendiente + email a admin) se conserva idéntico.
  - **Pérdida:** se deja de poblar `listings_propios.agente_id`. Correcto por diseño: es INT del mundo viejo, la FK ya no existe, y el listing "de realtor" del mundo nuevo vive en `listing` (0046) con su propio `agent_id` UUID. Si a futuro se quiere atribuir un listing_propio a un agent, eso es una columna nueva `agent_id UUID` — decisión aparte, no bloquea el DROP.
- **Los 2 usos de solicitudes → ELIMINAR** (caen con la feature, ver Q3/Q4).
- El helper `_get_agente_id` desaparece del archivo.

---

### Q2 — Línea 353: `GET /agentes-para-contactar`

```sql
SELECT id, nombre_completo, foto_perfil, whatsapp, zonas_opera, email, telefono
FROM public.agentes WHERE estado = 'aprobado' ORDER BY nombre_completo
```

**Qué hace:** lista pública de agentes aprobados del portal viejo. Único consumidor: [conectar-agente.tsx:53](../src/routes/conectar-agente.tsx#L53), que pinta tarjetas de agente para que el propietario elija a quién enviar solicitud de gestión.

**Clasificación: ELIMINAR** (con toda la feature conectar-agente/solicitudes — ver veredicto abajo).

- Reapunte hipotético existiría (`SELECT id, nombre, foto_url, email, telefono FROM agent WHERE estado='activo'`) pero perdería `whatsapp` y `zonas_opera` (no existen en `agent`; zonas en el mundo nuevo son `sponsorship`, no un array en el perfil) y devolvería UUIDs que el resto del flujo (solicitudes INT) no puede consumir. No tiene sentido: la feature que lo consume muere.
- **Qué se cae:** endpoint `GET /listings-propios/agentes-para-contactar` y la página `/conectar-agente`.

---

### Q3 — Línea 382: dentro de `POST /solicitudes` (`crear_solicitud`)

```sql
SELECT id, nombre_completo, email, whatsapp
FROM public.agentes WHERE id = $1 AND estado = 'aprobado'
```

**Qué hace:** valida que el `agente_id` (INT) elegido por el propietario existe y está aprobado; usa `nombre_completo`/`email` para el correo "Nueva solicitud de gestión" al agente. Inserta en `agente_solicitudes`.

**Clasificación: ELIMINAR.** `agente_solicitudes` está en la lista de DROP de Fase E (satélite exclusivo del portal viejo). Sin tabla no hay endpoint. Único consumidor front: [conectar-agente.tsx:73](../src/routes/conectar-agente.tsx#L73).

- **Qué se cae:** `POST /listings-propios/solicitudes` + email `_notify_agente_nueva_solicitud`.

---

### Q4 — Línea 483: dentro de `PATCH /solicitudes/{sol_id}` (`actualizar_solicitud`)

```sql
SELECT nombre_completo FROM public.agentes WHERE id = $1
```

**Qué hace:** obtiene el nombre del agente para el email al propietario ("el agente X aceptó/rechazó tu solicitud"). Es la cola del flujo de solicitudes: aceptar marca `listings_propios.agente_id`, activa y destaca el listing; rechazar manda al propietario de vuelta a `/conectar-agente` (link en el email, l.554).

**Clasificación: ELIMINAR.** Mismo destino que Q3: la tabla `agente_solicitudes` se dropea y el flujo entero muere. Consumidor front: [solicitudes.tsx:81](../src/routes/solicitudes.tsx#L81) (inbox del agente viejo).

- **Qué se cae:** `PATCH /solicitudes/{id}`, `GET /solicitudes/pendientes`, emails `_notify_propietario_respuesta`, y la página `/solicitudes`.

---

## Caso especial: `conectar-agente` — veredicto: **MUERE**

**Qué hace hoy:** el propietario, tras publicar en `/publicar` (o desde el OnboardingModal), va a `/conectar-agente?listing_id=N`, ve la lista de `agentes-para-contactar`, y **él elige manualmente** a qué agente enviar una solicitud de gestión. El agente la ve en `/solicitudes` y al aceptar el listing pasa a `activo + destacado` con su `agente_id`.

**Por qué no sobrevive reapuntada:**

1. **Contradice el modelo de negocio nuevo.** El pivot 2026-06-29 monetiza con agentes patrocinadores de zona: el contacto propietario→realtor pasa por **intake → asignador (zona → agent con sponsorship → pool con toma atómica)**, no por "el propietario escoge de una lista". Mantener la lista abierta canibaliza exactamente lo que se vende (la exclusividad de zona).
2. **La infraestructura de reemplazo ya existe y está aplicada** (migraciones 0045–0051, `api/routers/intake.py` + `asignador.py` + `moderacion.py`). El inbox del agente nuevo es `/realtor/dashboard` (pool + asignados), que reemplaza a `/solicitudes`.
3. **Técnicamente no reapunta limpio:** solicitudes usa IDs INT y tabla `agente_solicitudes` (a dropear); `agent` es UUID sin `whatsapp`/`zonas_opera`.

**Quién la llama hoy (todo se limpia en E1-FE):**

| Origen | Referencia |
|---|---|
| [publicar.tsx:1048](../src/routes/publicar.tsx#L1048) | CTA "Conectar con agente" en pantalla de éxito del propietario |
| [publicar.tsx:1097](../src/routes/publicar.tsx#L1097) | Card "Soy agente verificado" en pantalla NotLoggedIn |
| [vender.tsx:1230](../src/routes/vender.tsx#L1230) | CTA editorial |
| [OnboardingModal.tsx:120](../src/components/OnboardingModal.tsx#L120) | `navigate({ to: "/conectar-agente" })` |
| Email backend | `_notify_propietario_respuesta` linkea `/conectar-agente?listing_id=` (listings_propios.py:554) — muere con Q4 |

**Reemplazo funcional:** el CTA post-publicación del propietario debe apuntar al flujo intake (`POST /intake` → asignador) cuando ese front exista; mientras tanto, quitar el CTA (el listing del propietario ya queda `pendiente` → moderación, no pierde nada funcional).

---

## Tabla resumen

| # | Query / feature | Veredicto | Cómo | Front afectado |
|---|---|---|---|---|
| Q1a | l.25 vía `/me` + `crear_listing` | **REAPUNTAR** | Usar `current_user["es_agente"]` (ya derivado de `agent` en auth); `agente_id → NULL` en INSERT; borrar helper `_get_agente_id` | [publicar.tsx](../src/routes/publicar.tsx) — **cero cambios**, respuesta compatible |
| Q1b | l.25 vía gates de solicitudes | **ELIMINAR** | Cae con Q3/Q4 | [solicitudes.tsx](../src/routes/solicitudes.tsx) — se borra |
| Q2 | l.353 `GET /agentes-para-contactar` | **ELIMINAR** | Borrar endpoint | [conectar-agente.tsx](../src/routes/conectar-agente.tsx) — se borra |
| Q3 | l.382 `POST /solicitudes` | **ELIMINAR** | Borrar endpoint + email agente | [conectar-agente.tsx](../src/routes/conectar-agente.tsx) — se borra |
| Q4 | l.483 `PATCH /solicitudes/{id}` (+ `GET /solicitudes/pendientes`) | **ELIMINAR** | Borrar endpoints + email propietario | [solicitudes.tsx](../src/routes/solicitudes.tsx) — se borra |
| — | Feature `/conectar-agente` completa | **MUERE** | Reemplazo = intake + asignador (ya en backend); CTA propietario se quita o se reapunta a intake cuando haya front | publicar.tsx ×2, vender.tsx, OnboardingModal — quitar links |
| — | Bonus: `GET /agente/{agente_id}` (l.313) | **ELIMINAR (opcional)** | No lee `agentes` (lee `listings_propios.agente_id`), **no bloquea el DROP**, pero queda muerto: `listingsPropiosAgente` en config/api.ts no tiene ningún consumidor y con Q1a `agente_id` deja de poblarse | ninguno |

---

## Orden de ejecución Fase E (DROP al final)

**E1 — Backend `listings_propios.py` (un commit):**
1. Q1a: `/me` y `crear_listing` a `current_user["es_agente"]`; `agente_id=NULL` en INSERT; borrar `_get_agente_id`.
2. Q2/Q3/Q4: borrar `GET /agentes-para-contactar`, `POST /solicitudes`, `GET /solicitudes/pendientes`, `PATCH /solicitudes/{id}` y los helpers de email `_notify_agente_nueva_solicitud` / `_notify_propietario_respuesta`.
3. Opcional mismo commit: borrar `GET /agente/{agente_id}` (muerto).
4. Verificar: `grep -rn "agentes" api/` → cero referencias a la tabla vieja.

**E2 — Frontend (un commit, mismo deploy que E1 para no dejar 404s vivos):**
5. Borrar `routes/conectar-agente.tsx` y `routes/solicitudes.tsx`; regenerar `routeTree.gen.ts`.
6. Quitar links: publicar.tsx (1048, 1097 — la card "Soy agente verificado" completa), vender.tsx:1230, OnboardingModal.tsx:120.
7. Limpiar `config/api.ts`: `listingsPropiosAgentes`, `listingsPropiosSolicitudes`, `listingsPropiosSolicitudesPendientes`, `listingsPropiosSolicitudById` (+ `listingsPropiosAgente` si se hace E1.3). Limpiar strings i18n de conectar-agente en `lib/i18n.tsx`.

**E3 — DROP (migración alembic nueva, solo tras deploy de E1+E2 verificado):**
8. `DROP TABLE agente_reviews, agente_solicitudes, contactos_agente;` (satélites — `agente_solicitudes` ya sin lectores tras E1).
9. `DROP TABLE agentes;`
10. Opcional en la misma migración: `ALTER TABLE listings_propios DROP COLUMN agente_id;` — o conservarla como histórico muerto; con E1 nada la escribe ni la lee salvo el endpoint muerto de E1.3.

**Pre-condición vigente (del plan maestro):** correr `docs/censo_agentes.sql` en **prod** antes de E3; si `agentes_que_pagan > 0`, parar.

---

## Qué NO se toca (recordatorio)

- `listings_propios` tabla y el resto del router (barrios-form, mis-listings, PATCH/DELETE listing): publicación de **propietarios**, viva.
- `usuarios`, `suscripciones_usuario`, `listings`/cache.
- Flujo nuevo completo: `agent/agency/owner/intake/listing/sponsorship`, routers `intake.py`, `asignador.py`, `moderacion.py`, `admin_agentes.py`.
