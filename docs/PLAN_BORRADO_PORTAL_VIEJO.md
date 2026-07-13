# PLAN DE BORRADO SEGURO — Portal de Agentes viejo (`agentes` SERIAL)

> 100% READ-ONLY. Análisis de impacto. CERO cambios aplicados.
> Fecha: 2026-07-12. Canónico: `agent` (UUID, 0045). A eliminar: portal viejo `agentes`.
> Premisa confirmada en censo: `agentes` sin datos reales (local 1 fila dev, prod pendiente pero decisión ya tomada).

---

## PASO 1 — Inventario de todo lo que toca `agentes` viejo

### Tablas (DB)
| Tabla | Rol | FK inbound |
|---|---|---|
| `agentes` | Identidad agente viejo (SERIAL) | — |
| `agente_reviews` | Reseñas de agente viejo | `agente_id → agentes` |
| `agente_solicitudes` | Solicitudes ligadas a agente viejo | `agente_id → agentes` |
| `contactos_agente` | Leads al agente viejo (0024) | `agente_id → agentes` |
| `listings_propios` | **COMPARTIDA** — publicación de agentes **y propietarios** | `agente_id → agentes` (nullable) |

FKs que apuntan a `agentes` (verificado en DB): `listings_propios.agente_id`, `agente_reviews.agente_id`, `agente_solicitudes.agente_id`.

### Backend — routers/servicios/deps que referencian `agentes`
| Archivo | Líneas | Qué hace | Clasif. |
|---|---|---|---|
| [agentes.py](../api/routers/agentes.py) | todo (12 rutas) | Router portal viejo completo | EXCLUSIVO |
| [main.py:136](../api/main.py) | include_router agentes | Monta `/api/v1/agentes` | EXCLUSIVO |
| [dependencies.py:40-42](../api/dependencies.py) | subquery `es_agente` | Deriva flag desde `agentes` | COMPARTIDO (reapuntar) |
| [dependencies.py:89](../api/dependencies.py) | `is_agente()` | Lee `es_agente` | COMPARTIDO (queda) |
| [listings_propios.py:25,353,382,483](../api/routers/listings_propios.py) | lookups `agentes` | Flujo publicar agente+propietario | COMPARTIDO (cirugía) |
| [suscripciones.py:71-75](../api/routers/suscripciones.py) | gate plan `agente` | Exige verificación en `agentes` antes de pagar | COMPARTIDO (reapuntar) |
| [config/planes.py:45](../api/config/planes.py) | texto "/agentes" | Copy de beneficio de plan | COMPARTIDO (cosmético) |
| [utils/storage.py:54](../api/utils/storage.py) | `folder="agentes"` | Nombre carpeta S3 default | COMPARTIDO (cosmético) |
| [tests/test_moderacion_flow.py](../api/tests/test_moderacion_flow.py) | fixture | Test flujo nuevo (menciona) | revisar |

> Nota: `listings.py:184,635` usa `owner_plan IN ('pro','agente')` — eso lee **`usuarios.plan`** (el string de plan), NO la tabla `agentes`. No es coupling con el portal viejo. INTOCABLE.

### Frontend — consumidores del portal viejo
Endpoints en [config/api.ts](../src/config/api.ts) (bloque agentes, líneas ~59-84):
`agentesRegistro`, `agentesAprobados`, `agentesAprobadosFiltros`, `agentePerfilPublico`, `agentePorSlug`, `adminAgentes`, `adminAgenteDetalle`, `agenteZona`, y bloque `listingsPropios*` (72-84, compartido).

Rutas/páginas FE:
| Archivo | Consume | Clasif. |
|---|---|---|
| [routes/agentes/registro.tsx](../src/routes/agentes/registro.tsx) | `/agentes/registro` (form 6 pasos) | EXCLUSIVO |
| [routes/agentes/index.tsx](../src/routes/agentes/index.tsx) | `/agentes/aprobados` | EXCLUSIVO |
| [routes/agentes/$slug.tsx](../src/routes/agentes/$slug.tsx) | `/agentes/por-slug` | EXCLUSIVO |
| [routes/admin/agentes.tsx](../src/routes/admin/agentes.tsx) | `/agentes/admin` (viejo) | EXCLUSIVO ⚠️ ver colisión |
| [routes/conectar-agente.tsx](../src/routes/conectar-agente.tsx) | `agenteZona` / perfil-publico | EXCLUSIVO |
| [routes/publicar.tsx:1097](../src/routes/publicar.tsx) | link a `/agentes/registro` + listingsPropios | COMPARTIDO (cirugía) |
| [routes/real-estate.tsx:933](../src/routes/real-estate.tsx) | link `/agentes/registro` | COMPARTIDO (quitar link) |
| [components/OnboardingModal.tsx:120](../src/components/OnboardingModal.tsx) | navigate `/agentes/registro` | COMPARTIDO (quitar) |
| [routes/vender.tsx](../src/routes/vender.tsx) | editorial + listingsPropios | COMPARTIDO |
| [routes/suscribirse.tsx](../src/routes/suscribirse.tsx) / [planes.tsx](../src/routes/planes.tsx) | redirect `/agentes/registro` en plan agente | COMPARTIDO |

⚠️ **Colisión admin**: FE `routes/admin/agentes.tsx` apunta al viejo `/agentes/admin`. El nuevo flujo usa `/admin/agentes` (admin_agentes.py, tabla `agent`). Son páginas distintas. Al borrar el viejo, el admin de agentes debe apuntar al nuevo.

---

## PASO 2 — EXCLUSIVO vs COMPARTIDO/INTOCABLE

### ✅ EXCLUSIVO del portal viejo — seguro de eliminar
- **DB**: `agentes`, `agente_reviews`, `agente_solicitudes`, `contactos_agente`.
- **Backend**: router `agentes.py` + su `include_router` en main.py:136.
- **FE**: `routes/agentes/registro.tsx`, `routes/agentes/index.tsx`, `routes/agentes/$slug.tsx`, `routes/conectar-agente.tsx`; endpoints agentes en `config/api.ts` (59-67, 84).

### ⚠️ COMPARTIDO — NO borrar, requiere cirugía puntual
- **`listings_propios` (tabla + router)**: es el sistema de **publicación de propietarios Y agentes**, y alimenta el mapa (`cache` → `fuente='propio'`). Solo su `agente_id → agentes` es el acople. Al borrar `agentes` hay que **soltar esa FK/columna**, NO la tabla. Efecto funcional: sin `agentes`, la rama "es_agente" del publicar queda siempre falsa → todos publican como propietario `pendiente`. Es cambio de comportamiento, no ruptura.
- **`dependencies.py es_agente`**: reapuntar a `agent` (Paso 3).
- **`suscripciones.py:71` gate plan agente**: reapuntar a `agent` o quitar el gate.
- **`config/planes.py:45`, `storage.py:54`**: cosméticos (copy y nombre de carpeta).
- **FE publicar/vender/onboarding/suscribirse**: quitar links a `/agentes/registro`, repuntar admin de agentes al nuevo.

### 🔒 INTOCABLE — con evidencia
| Recurso | ¿Lo toca el borrado? | Evidencia |
|---|---|---|
| **`usuarios`** | **NO** | El borrado solo elimina `agentes` y satélites. `es_agente` es un **subquery derivado** (dependencies.py:40), no una columna de usuarios. Ninguna FK de usuarios apunta a agentes. Auth global intacto. |
| **`suscripciones_usuario`** | **NO (solo se desacopla el gate)** | Único consumidor: [suscripciones.py](../api/routers/suscripciones.py) (INSERT/SELECT/UPDATE líneas 114,140,176,190,285,325,336,349). Keyed por `usuario_id`. Sirve a **todos los planes** (`pro`, `agente`, propietario), no solo agentes. Es la tabla de facturación viva → INTOCABLE. Solo el gate de línea 71 (que lee `agentes`) se reapunta. |
| **`listings` / `cache`** | **NO** | Lee `listings_propios` vía `fuente='propio'` y `usuarios.plan`, nunca la tabla `agentes`. |

**Regla de oro**: preservar `usuario_id` como puente. `agent` NO tiene columna `plan`; la relación agente→pago vive en `usuarios.plan` + `suscripciones_usuario` vía `usuario_id`. Borrar `agentes` no debe tocar ese eje.

---

## PASO 3 — `es_agente` y el auth (F2)

### Hoy — [dependencies.py:40-42](../api/dependencies.py)
```sql
EXISTS(SELECT 1 FROM agentes a
       WHERE a.usuario_id = usuarios.id
         AND a.estado = 'aprobado') AS es_agente
```
`is_agente()` ([dependencies.py:89](../api/dependencies.py)) = `plan == 'agente' OR es_agente`.

**Rutas que lo usan como guard** (dato de mapa exclusivo de agente: `buena_oferta` / `pct_bajo_mediana`):
- [listings.py:558](../api/routers/listings.py), [listings.py:1049](../api/routers/listings.py)
- [barrios.py:878](../api/routers/barrios.py)

### Propuesta (NO aplicada) — reapuntar a `agent` (UUID)
```sql
EXISTS(SELECT 1 FROM agent a
       WHERE a.usuario_id = usuarios.id
         AND a.estado = 'activo') AS es_agente
```
- `agent.estado = 'activo'` = aprobado + con `usuario_id` (el CHECK de 0045 garantiza `activo ⇒ usuario_id NOT NULL`). Equivale a `agentes.estado='aprobado'`.
- `is_agente()` línea 89 **no cambia** (sigue leyendo `es_agente`). Los 3 guards siguen funcionando sin tocarlos.
- Sin este reapunte, al borrar `agentes` el subquery revienta (tabla inexistente) y `es_agente` siempre falso → nadie accede al dato premium. **Este cambio es obligatorio y debe ir ANTES o EN el mismo deploy que el DROP.**

Orden seguro: (1) reapuntar `es_agente` a `agent`; (2) reapuntar/quitar gate suscripciones.py:71; (3) soltar FKs a `agentes`; (4) DROP tablas.

---

## PASO 4 — Catálogo de columnas de `agentes` (insumo de diseño para `agent`/`agency`)

Referencia de "qué campos tenía un agente". NO migrar datos (no hay); decidir qué añadir a `agent`/`agency`/satélite KYC.

| Columna | Tipo | Nullable | Grupo | ¿Destino en agent (0045)? |
|---|---|---|---|---|
| id | integer | NO | id | → agent.id (UUID) |
| usuario_id | integer | YES | id | ✓ agent.usuario_id |
| telefono | varchar | YES | contacto | ✓ agent.telefono |
| whatsapp | varchar | YES | contacto | ✗ |
| email | varchar | YES | contacto | ✓ agent.email |
| licencia | varchar | YES | credencial | ✗ |
| bio | text | YES | perfil | ✗ |
| ciudad_id | integer | YES | ubicación | ✗ |
| idiomas | array | YES | perfil | ✗ |
| plan | varchar | YES | comercial | ✗ (plan vive en usuarios/suscripciones) |
| created_at | timestamp | YES | meta | ✓ |
| updated_at | timestamp | YES | meta | ✓ |
| nombre_completo | text | YES | identidad | ✓ agent.nombre |
| cedula_numero | text | YES | **KYC** | ✗ |
| cedula_foto_frente | text | YES | **KYC** | ✗ |
| cedula_foto_reverso | text | YES | **KYC** | ✗ |
| foto_perfil | text | YES | perfil | ✓ agent.foto_url |
| fecha_nacimiento | date | YES | KYC | ✗ |
| rut_documento | text | YES | **fiscal** | ✗ |
| tarjeta_profesional | text | YES | credencial | ✗ |
| inmobiliaria_nombre | text | YES | agencia | ~ → agency |
| inmobiliaria_nit | text | YES | agencia | ~ → agency |
| es_independiente | boolean | YES | agencia | ✗ |
| anos_experiencia | integer | YES | perfil | ✗ |
| transacciones_cerradas | integer | YES | perfil | ✗ |
| especialidad | array | YES | perfil | ✗ |
| tipo_inmueble | array | YES | perfil | ✗ |
| precio_rango_min | numeric | YES | perfil | ✗ |
| precio_rango_max | numeric | YES | perfil | ✗ |
| zonas_opera | array | YES | **operación** | ✗ (relevante asignador/sponsorship) |
| telefono_verificado | boolean | YES | verificación | ✗ |
| email_verificado | boolean | YES | verificación | ✗ |
| linkedin | text | YES | marketing | ✗ |
| instagram | text | YES | marketing | ✗ |
| sitio_web | text | YES | marketing | ✗ |
| referencia_1_nombre | text | YES | **due diligence** | ✗ |
| referencia_1_telefono | text | YES | due diligence | ✗ |
| referencia_1_tipo | text | YES | due diligence | ✗ |
| referencia_2_nombre | text | YES | due diligence | ✗ |
| referencia_2_telefono | text | YES | due diligence | ✗ |
| referencia_2_tipo | text | YES | due diligence | ✗ |
| referencia_3_nombre | text | YES | due diligence | ✗ |
| referencia_3_telefono | text | YES | due diligence | ✗ |
| referencia_3_tipo | text | YES | due diligence | ✗ |
| acepta_terminos | boolean | YES | **legal** | ✗ |
| acepta_politica | boolean | YES | legal | ✗ |
| acepta_suspension | boolean | YES | legal | ✗ |
| firma_timestamp | timestamptz | YES | legal | ✗ |
| estado | text | YES | estado | ✓ agent.estado (enum) |
| motivo_rechazo | text | YES | estado | ≈ agent.motivo_estado |
| fecha_registro | timestamptz | YES | meta | ≈ created_at |
| fecha_aprobacion | timestamptz | YES | auditoría | ✗ |
| aprobado_por | text | YES | auditoría | ✗ |

Bloques que `agent` NO cubre hoy y habría que diseñar si se quieren: **KYC** (cédula/rut/nacimiento), **legal** (aceptaciones+firma), **due diligence** (referencias — evaluar reuso de `due_diligence_item`), **perfil/marketing** (bio, redes, experiencia, especialidad), **operación** (`zonas_opera` → asignador/sponsorship por zona), **auditoría** (aprobado_por/fecha).

---

## PLAN DE BORRADO SEGURO — orden de ejecución (NO aplicado)

### A. Reapuntar antes de borrar (obligatorio, mismo deploy)
1. **`dependencies.py:40`** → `es_agente` sobre `agent` (`estado='activo'`). Sin esto el auth revienta.
2. **`suscripciones.py:71`** → gate plan `agente` sobre `agent` (o eliminar el gate si el flujo nuevo maneja verificación).
3. **FE admin**: `routes/admin/agentes.tsx` → apuntar a `/admin/agentes` (nuevo, tabla `agent`).

### B. Desacoplar FKs (mantener tablas compartidas)
4. `listings_propios.agente_id`: soltar FK a `agentes` (y decidir si se conserva la columna como histórico o se dropea). La tabla `listings_propios` **se queda**.
5. Limpiar rama `es_agente` de `listings_propios.py` (25,353,382,483): el publicar pasa a propietario-only o se reapunta a `agent` según diseño.

### C. Eliminar exclusivo (backend)
6. `main.py:136`: quitar `include_router(agentes...)`.
7. Borrar `api/routers/agentes.py`.

### D. Eliminar exclusivo (FE)
8. Borrar `routes/agentes/registro.tsx`, `routes/agentes/index.tsx`, `routes/agentes/$slug.tsx`, `routes/conectar-agente.tsx`; regenerar `routeTree.gen.ts`.
9. Quitar del `config/api.ts` los endpoints agentes viejos (59-67, 84).
10. Quitar links a `/agentes/registro` en `publicar.tsx`, `real-estate.tsx`, `OnboardingModal.tsx`, `suscribirse.tsx`, `planes.tsx`.

### E. DROP tablas (última, migración alembic nueva)
11. `DROP TABLE agente_reviews, agente_solicitudes, contactos_agente;` (satélites exclusivos).
12. `DROP TABLE agentes;` (tras soltar la FK de `listings_propios`).

### 🔒 NO TOCAR JAMÁS
- `usuarios` (auth global; `es_agente` es derivado, no columna).
- `suscripciones_usuario` (facturación de todos los planes; solo se reapunta el gate).
- `listings_propios` la tabla (publicación de propietarios + feed del mapa); solo su FK a `agentes`.
- `listings` / `cache` (leen `usuarios.plan`, no `agentes`).

---

## Verificación pendiente antes de ejecutar
- Correr `docs/censo_agentes.sql` en **prod** para confirmar 0 datos reales (sobre todo punto 6: agentes que pagan). Si `agentes_que_pagan > 0`, parar: hay dinero vivo atado y el borrado necesita plan de migración de esos usuarios primero.
