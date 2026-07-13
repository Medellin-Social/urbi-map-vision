# ROUTES INVENTORY — Medellín Social API (FastAPI)

> Read-only analysis. Generado iterando `app.routes` sobre `api.main.app` (no lectura a ojo).
> Fecha: 2026-07-11. Rama: `main`. Cero cambios de código.

Prefijos registrados en [api/main.py](../api/main.py) líneas 119-144.
Auth: **público** (sin Depends o `get_optional_user`), **auth** (`get_current_user`), **admin** (`require_admin`).

---

## PASO 1 — Inventario por dominio

### auth — `/api/v1/auth` ([auth.py](../api/routers/auth.py))
| Método | Path | Función | Tablas | Auth | Qué hace |
|---|---|---|---|---|---|
| POST | /register | register | usuarios | público | Alta usuario |
| POST | /login | login | usuarios, token_blacklist | público | Login → JWT |
| POST | /logout | logout | token_blacklist | auth | Revoca token |
| POST | /refresh | refresh_token | usuarios | público | Renueva JWT |
| GET | /me | me | usuarios, **agentes** | auth | Perfil actual (calcula `es_agente` desde tabla vieja) |
| PATCH | /perfil | update_onboarding_perfil | usuarios | auth | Onboarding perfil |
| POST | /forgot-password | forgot_password | usuarios | público | Envía reset |
| POST | /reset-password | reset_password | usuarios | público | Aplica reset |

### usuario — `/api/v1/usuario` ([usuario.py](../api/routers/usuario.py))
| Método | Path | Función | Tablas | Auth |
|---|---|---|---|---|
| GET/PUT | /configuracion_mapa | get/update_map_config | usuarios | auth |
| POST | /onboarding | onboarding | usuarios | auth |
| GET/PUT | /perfil | get/update_perfil | usuarios | auth |
| POST | /suscribirse | suscribirse | usuarios | auth |

### barrios — `/api/v1/barrios` ([barrios.py](../api/routers/barrios.py)) — público (optional)
`GET /`, `/comparar`, `/comunas`, `/por-comuna/{key}`, `/{barrio_id}`, `/{barrio_id}/info`, `/{barrio_id}/listings`. Tablas: barrios, comunas, cache listings.

### listings — `/api/v1/listings` ([listings.py](../api/routers/listings.py)) — público (optional)
`GET /`, `/viewport`, `/{listing_id}`, `/{listing_id}/similares`, `POST /{listing_id}/vista`. Tabla: cache listings (scrapeados + propios).

### listings-propios — `/api/v1/listings-propios` ([listings_propios.py](../api/routers/listings_propios.py)) — auth
| Método | Path | Función | Tablas | Nota |
|---|---|---|---|---|
| POST | / | crear_listing | listings_propios, **agentes** | valida `agentes.usuario_id` aprobado |
| GET | /me | my_tipo | agentes | tipo del usuario |
| GET | /mis-listings | mis_listings | listings_propios | |
| GET | /agente/{agente_id} | listings_por_agente | listings_propios | id = **agentes** (SERIAL) |
| GET | /agentes-para-contactar | agentes_para_contactar | agentes | |
| GET | /barrios-form | barrios_form | barrios | |
| POST/GET | /solicitudes[/pendientes] | crear/solicitudes_pendientes | solicitudes | |
| PATCH | /solicitudes/{sol_id} | actualizar_solicitud | solicitudes | |
| PATCH/DELETE | /{listing_id} | actualizar/desactivar | listings_propios | |

### oportunidades — `/api/v1/oportunidades` — GET `/` público. Tabla: cache/scoring.

### favoritos — `/api/v1/favoritos` ([favoritos.py](../api/routers/favoritos.py)) — auth
`GET/POST /`, `DELETE /{barrio_id}`, `GET/POST/DELETE /listings`, `GET /listings/ids`. Tablas: favoritos, favoritos_listings.

### historial — `/api/v1/historial` — auth. `GET/POST /`. Tabla: historial.

### calculadora — `/api/v1/calculadora` ([calculadora.py](../api/routers/calculadora.py)) — mixto
`GET /alternativas`, `/listing-simulador-data`, `POST /simular` (optional/público); `GET/POST/DELETE /historial[/{sim_id}]` (auth). Tabla: simulaciones.

### comparador — `/api/v1/comparador` — auth (batch público). `GET /listings`, `GET/POST/DELETE/GET /historial[/{comp_id}]`. Tabla: comparaciones.

### comunas — `/api/v1/comunas` — público. `GET /geojson`, `/{nombre}/barrios`, `/cd/{cd_comuna}/barrios`.

### comunidad — `/api/v1/comunidad` — público. eventos/tiendas por municipio y barrio, noticias, ticker. Tablas: eventos, tiendas, categorias_comunidad.

### business — `/api/v1/business` — público. `POST /aplicar`, `GET /deals`, `/directorio`, `/planes`. Tabla: negocios.

### embajadores / afiliados — `POST /aplicar` público. Tablas: embajadores, afiliados.

### stats — `/api/v1/stats` — público. `GET /ciudad`, `/score-thresholds`.

### trm — `/api/v1/trm` — público. `GET /`. Tabla: trm.

### tracking — `/api/v1/track` — `POST /` (optional). Tabla: tracking/eventos.

### suscripciones — `/api/v1/suscripciones` ([suscripciones.py](../api/routers/suscripciones.py)) — auth + webhooks públicos
| Método | Path | Función | Tablas | Nota |
|---|---|---|---|---|
| GET | /planes | get_planes | — | público |
| GET | /mi-plan | mi_plan | usuarios, **agentes** | lee `agentes.usuario_id` |
| POST | /iniciar, /cancelar | iniciar/cancelar | suscripciones | auth |
| POST | /webhook/stripe, /webhook/wompi | webhook_* | suscripciones | público (firma) |

### alertas — `/api/v1/alertas` — auth. `POST /`, `GET /mis`, `DELETE /{alerta_id}`. Tabla: alertas.

---

### ⚠️ CONCEPTO "AGENTE" — DOS SISTEMAS PARALELOS

### agentes (VIEJO) — `/api/v1/agentes` ([agentes.py](../api/routers/agentes.py)) → tabla `agentes` (SERIAL)
| Método | Path | Función | Auth | Qué hace |
|---|---|---|---|---|
| POST | /registro | registro_agente | público | Alta agente (form 6 pasos) |
| GET | /admin | listar_agentes | admin | Cola/listado admin |
| GET | /admin/{agente_id} | detalle_agente | admin | Detalle |
| PATCH | /{agente_id}/aprobar | aprobar_agente | admin | Aprueba |
| PATCH | /{agente_id}/rechazar | rechazar_agente | admin | Rechaza |
| GET | /aprobados | agentes_aprobados_filtrado | público | Lista filtrada |
| GET | /aprobados/lista | agentes_aprobados | público | Lista |
| GET | /por-slug/{slug} | agente_por_slug | público | Perfil por slug |
| GET | /zona | agente_por_zona | público | Agente por zona |
| GET | /{agente_id}/perfil | perfil_agente | público | Perfil |
| GET | /{agente_id}/perfil-publico | perfil_publico_agente | público | Perfil público |
| POST | /{agente_id}/contacto | contactar_agente | público | Lead a agente (contactos_agente) |

Tablas: `agentes`, `contactos_agente`, `agente_reviews`, `listings_propios.agente_id`.

### agent (NUEVO 0045) — servido por intake/asignador/moderacion/admin_agentes → tabla `agent` (UUID)

**intake / cuestionario** — `/api/v1` ([intake.py](../api/routers/intake.py)) — auth
| Método | Path | Función | Tablas |
|---|---|---|---|
| POST | /intake | crear_intake_endpoint | intake |
| GET | /intake/mias | mis_intakes | intake |
| GET | /intake/{intake_id} | get_intake | intake |
| POST | /intake/{intake_id}/asignar | asignar | intake, agent (asignador_service) |
| GET | /intake/{intake_id}/due-diligence | get_due_diligence | due_diligence_item |
| GET | /cuestionario | get_cuestionario | — (estático) |

**asignador / pool** — `/api/v1` ([asignador.py](../api/routers/asignador.py)) — auth
| Método | Path | Función | Tablas |
|---|---|---|---|
| GET | /pool | ver_pool | intake, **agent** (`agent WHERE usuario_id`) |
| POST | /pool/{intake_id}/tomar | tomar | intake, **agent** (toma atómica) |

**admin_agentes** — `/api/v1/admin` ([admin_agentes.py](../api/routers/admin_agentes.py)) — admin, tabla `agent`
| Método | Path | Función |
|---|---|---|
| GET | /agentes | cola_agentes |
| POST | /agentes/{agent_id}/aprobar | aprobar |
| POST | /agentes/{agent_id}/rechazar | rechazar |
| POST | /agentes/{agent_id}/suspender | suspender |

**moderacion** — `/api/v1/admin` ([moderacion.py](../api/routers/moderacion.py)) — admin, tabla `listing`
`POST /listings/{listing_id}/aprobar`, `POST /listings/{listing_id}/rechazar`.

### admin (núcleo) — `/api/v1/admin` ([admin.py](../api/routers/admin.py)) — admin
`GET /dashboard`, `/usuarios`, `/usuarios/{id}`, `/actividad`, `/barrios/stats`, `/leads`, `PUT /leads/{lead_id}`. Tablas: usuarios, leads, barrios.

### Utilidad — `GET /`, `/health`, `/openapi.json`, `/docs`, `/redoc`, `/admin/{full_path}` (SPA admin estático).

---

## PASO 2 — Análisis del concepto agente (con evidencia)

### Veredicto: DOS ENTIDADES DISTINTAS que comparten nombre. NO son la misma. Sin FK ni JOIN entre ellas.

**Tabla vieja `agentes`** — [0005_nuevas_tablas.py:27](../alembic/versions/0005_nuevas_tablas.py) (base) y [0020_agentes.py:19](../alembic/versions/0020_agentes.py) (forma completa):
```
agentes ( id SERIAL PK, usuario_id INT REFERENCES usuarios(id), nombre_completo,
          cedula_numero UNIQUE, ...experiencia, zonas_opera INT[], estado ... )
```
- Origen: **sistema propio "Portal de Agentes"** (registro form 6 pasos), NO viene del scrape.
- Referenciada por: [agentes.py](../api/routers/agentes.py) (12 rutas), `listings_propios.agente_id` FK→`agentes(id)` ([0005:57](../alembic/versions/0005_nuevas_tablas.py)), `contactos_agente` ([0024](../alembic/versions/0024_agentes_contactos.py)), `agente_reviews`, y validaciones en [listings_propios.py:25](../api/routers/listings_propios.py), [suscripciones.py:71](../api/routers/suscripciones.py), [dependencies.py:40](../api/dependencies.py).

**Tabla nueva `agent`** — [0045_realtor_identity.py:63](../alembic/versions/0045_realtor_identity.py), modelo [realtors.py:58](../api/models/realtors.py):
```
agent ( id UUID PK, usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
        email UNIQUE, nombre, telefono, estado agent_estado, ...
        CHECK (estado <> 'activo' OR usuario_id IS NOT NULL) )
```
- Origen: flujo realtors nuevo (0045-0051). Se puebla vía asignador/intake.
- Referenciada por: [asignador.py:24](../api/routers/asignador.py), [asignador_service.py:43](../api/services/asignador_service.py), [agent_service.py](../api/services/agent_service.py), [admin_agentes.py](../api/routers/admin_agentes.py), `agency_member`, `listing`, `sponsorship`.

### ¿De dónde sale el `agentes` viejo?
No es scrape ni `usuarios`. Es un **sistema de registro de agentes previo** (Portal de Agentes, form 6 pasos → email admin → aprobar/rechazar → perfil público + slug + contacto lead). El scrape solo tiene categoría `"agente_inmobiliario"` como tipo de tienda ([0009](../alembic/versions/0009_tiendas_categoria_v2.py)), sin relación con estas tablas.

### El puente compartido: `usuarios.id`
Ambas tablas tienen `usuario_id INT → usuarios(id)`. **Ese es el único vínculo posible**, y no está materializado en ninguna query: nada hace `JOIN agent ... agentes`. Una persona podría existir como fila `agentes` Y como fila `agent` a la vez, sin que el sistema lo sepa.

### COLISIONES DE PATH
- **Sin shadowing real.** Tres routers montan en `/api/v1/admin` (admin, moderacion, admin_agentes) pero sus paths no se solapan: admin→dashboard/usuarios/leads/actividad/barrios; moderacion→`/listings/{id}/aprobar|rechazar`; admin_agentes→`/agentes[...]`. Ningún path duplicado ⇒ ningún handler tapa a otro.
- **Ambigüedad de NAMING (no de routing):** conviven dos familias:
  - `/api/v1/agentes/*` (viejo, tabla `agentes`) — incluye `/agentes/admin`, `/agentes/{id}/aprobar`.
  - `/api/v1/admin/agentes/*` (nuevo, tabla `agent`) — `/admin/agentes/{id}/aprobar`.
  - Dos endpoints "aprobar agente" que operan tablas distintas, con paths parecidos. Confusión garantizada para quien consuma la API.

---

## PASO 3 — Banderas y solapamientos

| # | Bandera | Evidencia | Severidad |
|---|---|---|---|
| F1 | **Doble sistema de identidad de agente** sin puente. `agentes` (SERIAL) vs `agent` (UUID), ambos `usuario_id→usuarios`, nunca unidos. | 0020 vs 0045; sin JOIN cruzado | 🔴 Alta |
| F2 | **`es_agente` solo mira la tabla vieja.** `get_current_user` calcula `es_agente` con `EXISTS(... FROM agentes ...)`. Un agente "activo" del flujo NUEVO no es reconocido como agente por auth. | [dependencies.py:40](../api/dependencies.py) | 🔴 Alta |
| F3 | **Aprobación duplicada.** Dos flujos aprobar/rechazar agente: `PATCH /agentes/{id}/aprobar` (viejo) y `POST /admin/agentes/{id}/aprobar` (nuevo). Mismo concepto, tablas distintas. | agentes.py vs admin_agentes.py | 🟠 Media |
| F4 | **Suscripción y listings-propios atados a la tabla vieja.** `mi_plan`, `crear_listing` validan contra `agentes.usuario_id`. El flujo nuevo `agent` no da acceso a publicar ni a plan. | [suscripciones.py:71](../api/routers/suscripciones.py), [listings_propios.py:25](../api/routers/listings_propios.py) | 🟠 Media |
| F5 | **`agent.email UNIQUE` vs `agentes` sin unificar.** Un mismo agente podría registrarse en ambos con emails/estados divergentes. | 0045 UNIQUE email | 🟡 Baja |
| F6 | **Prefijo `/api/v1` "desnudo" en intake y asignador.** `/intake`, `/pool`, `/cuestionario` sin subprefijo de dominio → riesgo de colisión futura con rutas nuevas a nivel raíz. | main.py:141,144 | 🟡 Baja |

### Dónde el flujo nuevo debería REUSAR lo viejo (o decidir migrar)
- **Identidad**: elegir UNA tabla canónica de agente. Hoy `agentes` concentra listings, suscripción, `es_agente`, perfil público; `agent` concentra asignador/sponsorship/listing nuevo. Están construyendo el modelo de negocio (agentes patrocinados por zona) sobre `agent`, pero publicar/plan/auth siguen en `agentes`.
- **`es_agente`**: si `agent` es el futuro, `get_current_user` debe mirar `agent` (o ambas) — hoy ignora el flujo nuevo.

---

## RECOMENDACIONES (priorizadas — NO aplicadas)

1. **[Alta] Decidir tabla canónica de agente** (`agent` UUID parece la dirección del pivot: sponsorship, asignador, agency). Documentar cuál es fuente de verdad antes de que ambas acumulen datos divergentes.
2. **[Alta] Unificar `es_agente`** en [dependencies.py:40](../api/dependencies.py): hoy solo `agentes`; debe reconocer también/solo `agent` según (1). Sin esto, agentes del flujo nuevo no tienen rol.
3. **[Media] Plan de convergencia de aprobación**: `PATCH /agentes/{id}/aprobar` vs `POST /admin/agentes/{id}/aprobar`. Deprecar uno o mapear estados.
4. **[Media] Repuntar publicar/suscripción** (`crear_listing`, `mi_plan`) a la tabla canónica una vez decidida (1).
5. **[Baja] Namespacing**: mover intake/asignador de `/api/v1` a `/api/v1/realtor` (o similar) para evitar rutas raíz sueltas y aclarar dominio.
6. **[Baja] Backfill/link `agent.usuario_id ↔ agentes.usuario_id`** si se migra, para no perder listings/reviews colgados de `agentes(id)` SERIAL.
