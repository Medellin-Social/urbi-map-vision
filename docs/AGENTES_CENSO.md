# CENSO AGENTES — pre-migración `agentes` (viejo) → `agent` (canónico)

> 100% READ-ONLY. Solo SELECTs. Cero cambios. Fecha: 2026-07-11.
> Canónico decidido: `agent` (UUID, 0045). Origen a migrar: `agentes` (SERIAL, 0020).

## Cobertura de datos

| Entorno | Estado | Nota |
|---|---|---|
| **Local** (`localhost:5433/urbidata`) | ✅ Corrido | Base de dev, casi vacía |
| **Prod** (`yamabiko.proxy.rlwy.net:10109`) | ⛔ **PENDIENTE** | Lookup de credencial prod bloqueado por el clasificador. Script listo abajo — correlo tú. |

⚠️ **Local no tiene datos reales.** Los números que importan (dinero, listings, solapamiento) están en **prod**. Correr el script de abajo antes de diseñar la migración.

---

## Resultados — LOCAL

| # | Métrica | Local | Prod |
|---|---|---|---|
| 1 | Total `agentes` | **1** | _pendiente_ |
| 2 | `agentes` con `usuario_id` NOT NULL / NULL | **1 / 0** | _pend._ |
| 3 | `agentes` por estado | `aprobado`=1 | _pend._ |
| 4a | `agentes` con ≥1 listing-propio | **0** | _pend._ |
| 4b | Total `listings_propios` | **0** | _pend._ |
| 5a | Total `suscripciones_usuario` | **0** | _pend._ |
| 5b | Suscripciones ACTIVAS | **0** | _pend._ |
| 5c | Suscripciones de pago (`precio>0`) | **0** | _pend._ |
| 5d | Suscripciones de usuarios que son `agentes` viejos | **0** | _pend._ |
| 6 | Total `agent` (nuevo) | **0** (vacía) | _pend._ |
| 7 | `agent` por estado | — (vacía) | _pend._ |
| 8 | `usuario_id` en AMBAS tablas | **0** | _pend._ |
| 9a | `usuario_id` solo en `agentes` (viejo) | **1** | _pend._ |
| 9b | `usuario_id` solo en `agent` (nuevo) | **0** | _pend._ |
| 10 | `agentes` con `usuario_id` NULL (no autoenlazable) | **0** | _pend._ |

Notas de modelo detectadas:
- **No existe tabla `suscripciones`.** Las suscripciones viven en `suscripciones_usuario`, keyed por `usuario_id` (no por `agente_id`). El dinero se ata al **usuario**, no a la tabla `agentes`. Punto 5d es el join real "¿este agente viejo paga?".
- `usuarios.plan`: 2 `pro`, 17 `free` (local). El plan se refleja en `usuarios.plan` y en `suscripciones_usuario`.
- `agent` nuevo **no tiene** columna `plan` (en 0045 el `plan` está en `agency`, no en `agent`). La relación agente→pago seguirá vía `usuario_id → suscripciones_usuario`.

---

## PUNTO 11 — Campos SIN DESTINO (se perderían si se ignora la vieja)

Canónico nuevo:
- `agent` (0045): `id, usuario_id, email, nombre, telefono, foto_url, estado, motivo_estado, created_at, updated_at`
- `listing` (0046) + `listing_media` (fotos): cubre inmueble + fotos.

### A) `agentes` → `agent` — huérfanos

**Con destino (mapeables):** `usuario_id`✓, `email`✓, `telefono`✓, `nombre_completo`→`nombre`✓, `foto_perfil`→`foto_url`✓, `estado`✓(enum distinto), `motivo_rechazo`→`motivo_estado`≈, `created_at/updated_at`✓, `fecha_registro`→`created_at`≈.

**SIN destino en `agent` (se perderían):**
| Campo viejo | Tipo de dato | Comentario |
|---|---|---|
| `whatsapp` | contacto | canal de contacto |
| `bio` | perfil público | descripción del agente |
| `licencia` | credencial | |
| `ciudad_id` | ubicación | |
| `idiomas` | perfil | |
| `plan` | comercial | plan en fila agente (redundante c/ suscripciones_usuario, pero existe) |
| `cedula_numero` | **KYC** | identidad legal — UNIQUE |
| `cedula_foto_frente` / `cedula_foto_reverso` | **KYC** | docs de identidad |
| `fecha_nacimiento` | KYC | |
| `rut_documento` | **fiscal** | |
| `tarjeta_profesional` | credencial | |
| `inmobiliaria_nombre` / `inmobiliaria_nit` | agencia | → posible `agency` (0045) pero sin link automático |
| `es_independiente` | agencia | |
| `anos_experiencia` | perfil | |
| `transacciones_cerradas` | perfil | |
| `especialidad[]` | perfil | |
| `tipo_inmueble[]` | perfil | |
| `precio_rango_min` / `precio_rango_max` | perfil | |
| `zonas_opera[]` | **operación** | zonas donde opera — relevante para asignador/sponsorship por zona |
| `telefono_verificado` / `email_verificado` | verificación | |
| `linkedin` / `instagram` / `sitio_web` | marketing | |
| `referencia_1..3_nombre/telefono/tipo` | **due diligence** | 9 campos — ¿mapean a `due_diligence_item`? evaluar |
| `acepta_terminos` / `acepta_politica` / `acepta_suspension` | **legal/consentimiento** | evidencia de aceptación |
| `firma_timestamp` | **legal** | timestamp de firma |
| `fecha_aprobacion` | auditoría | |
| `aprobado_por` | auditoría | quién aprobó |

→ **Todo el bloque KYC, legal-fiscal, experiencia, referencias y auditoría no tiene lugar en `agent`.** Si prod tiene agentes reales aprobados, esto es data de cumplimiento que no se puede perder. Decidir: tabla satélite (`agent_kyc` / reusar `due_diligence_item`) o descartar explícitamente.

### B) `listings_propios` → `listing` — huérfanos

**Con destino:** `agente_id`→`agent_id`✓(tipo cambia SERIAL→UUID), `tipo_operacion`→`operacion`✓, `tipo_inmueble`✓, `precio_cop`→`precio`+`moneda`✓, `area_m2`✓, `habitaciones`✓, `banos`✓, `descripcion`✓, `lat/lon`→`geom`✓, `direccion`→`direccion_aprox`✓, `estrato`✓, `parqueaderos`✓, `ano_construccion/antiguedad`→`antiguedad_anios`≈, `administracion_cop`→`administracion`✓, `barrio_id`→`barrio`≈, `estado`✓, `fecha_publicacion`→`published_at`✓, `fotos`→`listing_media`✓.

**SIN destino en `listing`:**
| Campo viejo | Comentario |
|---|---|
| `precio_usd` | `listing` es mono-moneda (`precio`+`moneda`) — se pierde el par COP/USD |
| `ciudad_id` | `listing` usa `municipio` (texto) |
| `amenidades` | sin columna |
| `amoblado` | sin columna |
| `piso` | sin columna |
| `area_lote_m2` | sin columna |
| `mascotas` | sin columna |
| `permite_airbnb` | sin columna — relevante para yield/renta corta |
| `destacado` | flag de destaque |
| `vistas` | contador (¿→ `listing_vistas`?) |
| `fuente` | procedencia |
| `user_id` | redundante c/ agent, pero es dato |
| `nombre_contacto` / `telefono` / `email_contacto` / `horario_contacto` | **snapshot de contacto por listing** — no está en `listing` |

### C) `suscripciones_usuario`
Keyed por `usuario_id`, no por agente. **No se migra con el agente**: si se preserva `usuario_id` en `agent`, la relación agente→suscripción→dinero se mantiene por join. Ningún campo huérfano *siempre que* la migración conserve `agent.usuario_id`.

---

## Script para correr en PROD (read-only)

```bash
# reemplaza <PROD_URL> por la cadena real (Railway → servicio Postgres → DATABASE_URL)
PROD="<PROD_URL>"
psql "$PROD" -tA -F'|' <<'SQL'
\echo 1_total_agentes
select count(*) from agentes;
\echo 2_usuario_id_notnull_null
select (usuario_id is not null), count(*) from agentes group by 1;
\echo 3_agentes_por_estado
select coalesce(estado,'(null)'), count(*) from agentes group by 1 order by 2 desc;
\echo 4a_agentes_con_listing
select count(distinct agente_id) from listings_propios where agente_id is not null;
\echo 4b_total_listings_propios
select count(*) from listings_propios;
\echo 5a_subs_total
select count(*) from suscripciones_usuario;
\echo 5b_subs_por_estado
select coalesce(estado,'(null)'), count(*) from suscripciones_usuario group by 1;
\echo 5c_subs_de_pago
select count(*) from suscripciones_usuario where coalesce(precio,0)>0;
\echo 5d_subs_de_agentes_viejos
select count(*) from suscripciones_usuario s
 where s.usuario_id in (select usuario_id from agentes where usuario_id is not null);
\echo 6_total_agent
select count(*) from agent;
\echo 7_agent_por_estado
select coalesce(estado::text,'(null)'), count(*) from agent group by 1 order by 2 desc;
\echo 8_usuario_en_ambas
select count(*) from (select usuario_id from agentes where usuario_id is not null
  intersect select usuario_id from agent where usuario_id is not null) x;
\echo 9a_solo_viejo
select count(*) from (select usuario_id from agentes where usuario_id is not null
  except select usuario_id from agent where usuario_id is not null) x;
\echo 9b_solo_nuevo
select count(*) from (select usuario_id from agent where usuario_id is not null
  except select usuario_id from agentes where usuario_id is not null) x;
\echo 10_agentes_usuario_null
select count(*) from agentes where usuario_id is null;
SQL
```
