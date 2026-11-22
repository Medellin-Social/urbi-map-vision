# Handoff — Programa de agentes (2026-11-21)

Rama: `DEV`. Documento fuente: [Medellin-Social-Programa-Inmobiliario-ES.md](Medellin-Social-Programa-Inmobiliario-ES.md).
Objetivo: aplicar todo ese documento y agregar el lead **"Más información"** (realtor de la casa / property manager / administración).

## Estado

**Hecho y committeado.** Los tests del backend pasan contra la DB local y `vite build` pasa. Falta revisarlo en el navegador y en DEV (Railway).

| Commit | Qué |
|---|---|
| `426191e` | Backend: migración 0131, servicio, endpoints, webhook, cron, tests |
| `b8359a5` | Frontend: páginas, insignias, aviso de no registrado, panel admin, navegación |
| (este) | Este handoff + trabajo en curso de otra sesión (ver abajo) |

## Decisiones confirmadas por Eduard

- Los precios van en **USD**. El registro ($25) y la certificación ($99) **se suman**.
- **$5 por anuncio, único**: se paga al vincular el anuncio y cubre mientras siga activo.
- Plan certificado: **$25/mes con 5 anuncios incluidos**, o **ilimitado a $99/mes**. El ilimitado se puede elegir con cualquier número de anuncios.
- **Examen EASE**: es un enlace externo. El agente pega la evidencia y el admin marca aprobado o no aprobado.
- **Pasarela**: links de GHL + webhook (mismo patrón que Realtor Preferido).
- **Preferente**: se mantiene la compra directa en COP con niveles A–D. **No exige certificación.**
- **"Más información"**: lead → GHL + email al equipo.

## Supuestos tomados sin preguntar (revisar con Eduard/Ken)

- Los agentes que ya estaban `activo` quedaron con el registro pagado (grandfather, en la migración).
- La insignia **certificado** exige 4 cosas: examen aprobado, revisión aprobada, $99 pagados y plan mensual vigente. Si el plan vence, el cron quita la insignia.
- Los **documentos de certificación** son *enlaces privados* (Drive/Dropbox), no archivos subidos. El bucket S3/R2 es público.
- El **directorio `/agentes`** solo lista agentes con registro pagado o realtors de la casa.
- Los anuncios **propios** ya publicados siguen mostrando a su agente como antes. El cobro de $5 aplica a las vinculaciones nuevas (`listing_representacion`).
- Las rutas van en español bajo `/agentes/*`, no en `/real-estate/*` como sugiere el documento.

## Mapa del código

**Backend**
- `alembic/versions/0131_agent_program.py`
  - Columnas nuevas en `agent`: `registro_pagado_at`, `cert_*`, `zonas_servicio`.
  - Tablas nuevas: `agent_certificacion`, `agent_program_pago` (ledger idempotente), `listing_representacion` (+ `_evento`), `leads_servicio`.
  - Columnas de revisión en `listing_reclamo`.
- `api/services/agent_program_service.py`: `procesar_pago`, `recalcular_coberturas`, `recalcular_certificado`, `vencer_planes`, `mi_estado`.
- `api/routers/agent_program.py`
  - `/api/v1/agent-program/*`: lado del agente y endpoints `admin/*`.
  - `/api/v1/leads/servicio`: lead público.
- `api/routers/ghl_webhook.py`: handler `agent_program`.
- `api/routers/listings.py`
  - `member` ahora significa registrado y exige el pago.
  - Directorio y perfil devuelven `preferente` [{nivel, nombre}]; el perfil también `representados`.
  - `/listings/{id}/agente` devuelve `representante`.
- `api/routers/suscripciones.py`: el registro acepta bio, experiencia, zonas y agencia (que queda sin verificar).
- `scripts/run_realtor_slots.py`: llama `vencer_planes` antes de `sincronizar_tier` (es el mismo cron que ya estaba).
- Tests: `api/tests/test_agent_program_db.py`, `api/tests/test_agent_program_http.py`.

**Frontend**
- Lógica compartida y tipos: `src/lib/agentProgram.ts` (precios y `pagarProducto`), `src/lib/agenteTipos.ts` (etiquetas y anclas).
- Páginas:
  - `/agentes/estados`: guía pública.
  - `/agentes/programa`: tarifas.
  - `/agentes/registro`: asistente de 3 pasos.
  - `/agentes/mi-programa`: pagos y anuncios.
  - `/agentes/certificacion`: trayectoria, EASE y planes.
  - `/mas-informacion`: lead.
- Componentes:
  - `AgenteNoRegistradoModal.tsx` y `RepresentanteCard` dentro de `ListingDrawer.tsx`.
  - `agentes/ProgramaUI.tsx`.
  - `AgenteTipoBadges` (prop `linked` y `preferente`).
- Admin: pestaña **Programa** en `src/routes/panel-x9k2/-ProgramaTab.tsx`.
- `/agentes` acepta `?zona=&comuna=&tipo=`.

## Pendiente

1. **GHL (lo hace Eduard o Talal)**: crear 5 links de pago en USD y el workflow "pago aprobado". El workflow hace POST a `/api/v1/webhook/ghl` con:
   - `object_type: "agent_program"`
   - `producto`: `registro` | `cert_cuota` | `cert_mensual` | `cert_ilimitado` | `anuncio`
   - `agent_email`
   - `pago_ref`: distinto en cada cobro, incluidos los recurrentes
   - `listing_url`: solo para `anuncio`
2. **Variables de entorno en Railway** (DEV y luego PROD): `GHL_LINK_REGISTRO`, `GHL_LINK_CERT_CUOTA`, `GHL_LINK_CERT_MENSUAL`, `GHL_LINK_CERT_ILIMITADO`, `GHL_LINK_ANUNCIO`, `EASE_EXAM_URL`. Mientras no existan los links, en DEV usar `ENABLE_SIMULATED_PAYMENTS=1`.
3. **Verificar en DEV** (gate de CLAUDE.md). Recorrido completo:
   1. Registro → pago simulado.
   2. El admin aprueba la cuenta.
   3. Vincular 6 anuncios.
   4. Certificación → evidencia EASE.
   5. El admin aprueba examen y trayectoria.
   6. Pagar $99 + plan → aparece la insignia.
   7. El anuncio 6 pide $5.
   8. Un anuncio importado muestra "Información del agente".
   9. Probar `/mas-informacion`.

   Revisar en móvil y desktop.
4. Agregar las rutas nuevas a `qc/journeys/realtor.qc.ts`.
5. Opcional: enlazar "Mi programa" desde `src/routes/realtor/dashboard.tsx`. No lo hice porque ese archivo lo estaba rediseñando otra sesión.

## Trabajo en curso de OTRA sesión (incluido en este push tal cual)

Rediseño del Centro de agente. No lo hice yo y no lo revisé a fondo; `vite build` pasa con estos cambios.
- `src/routes/realtor/dashboard.tsx`
- `src/routes/realtor/-ui.tsx`
- `src/lib/i18n-phrases.ts`
- `src/lib/i18n.scan.test.ts`
- `qc/e2e/realtor-listing-lifecycle.e2e.ts`
- `scripts/seed_realtor_demo.py`: semilla de una cuenta demo, **solo para la DB local**. Se niega a correr fuera de localhost.

## Tests y fallos conocidos

```bash
.venv/Scripts/python -m pytest api/tests/test_agent_program_db.py api/tests/test_agent_program_http.py -m require_db
```
- Hace falta `DATABASE_URL` exportado desde `.env` y la DB local en 0131: `alembic upgrade head`.
- En Windows, usar `PYTHONUTF8=1` para los tests de migraciones.

Fallos que **no** vienen de este trabajo:
- 4 tests de `api/tests/test_ghl_mocked.py` (ya fallaban en `HEAD` antes de este trabajo).
- `i18n.scan.test.ts`: literales sin traducir en `src/routes/publicar.tsx`.

## Al desplegar

El push a `DEV` dispara el deploy en Railway DEV, y `alembic upgrade head` aplica la 0131 solo, sin pasos manuales.
