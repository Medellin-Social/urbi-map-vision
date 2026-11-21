# Procesos por persona + qué construir en GHL

Fecha: 2026-11-21. Probado en LOCAL (API de prueba con GHL apagado, así no se
tocó el GHL real). DEV/PROD no se tocaron. Complementa `MAPA_PROCESOS_FALTANTES.md`.

Leyenda: ✅ probado local · 📖 leído en código, no ejecutado · 🔴 falla/lógica mala · 🟡 falta

---

## 0. Resultados de las pruebas locales

| # | Prueba | Resultado |
|---|---|---|
| 1 | Registro agente (`POST /suscripciones/agente/registro`) | ✅ queda `pendiente` |
| 2 | Admin aprueba (`/admin/agentes/{id}/aprobar`) | ✅ → `activo`. Pide **password del admin** (re-auth bcrypt) |
| 3 | Marcar realtor casa (`/realtor-preferido/admin/casa`) | ✅ (🔴 también deja marcar a un agente `pendiente`) |
| 4 | Precios de ejemplo (`/realtor-preferido/precios`) | ✅ 8 filas, `es_ejemplo:true` (barrio A 400k … D 120k) |
| 5 | Subir listing como realtor (`POST /listings-propios/`) | ✅ 201, queda `publicado` directo (agente salta OTP y moderación) |
| 6 | Slot gratis admin (`/admin/asignar`) | ✅ barrio 236 (El Poblado), cupos 4→3 |
| 7 | Checkout slot | ✅ modo `simulado` (sin `GHL_SLOT_CHECKOUT_URL`) |
| 8 | Webhook `realtor_slot` sin secret / con secret | ✅ 401 / 200; idempotente por `pago_ref`; 404 si agente no existe |
| 9 | Webhook `listing` | ✅ 501 (esperado, sin contrato) |
| 10 | Owner crea intake en El Poblado | ✅ 201 pero 🔴 va a `en_pool` aunque hay realtor con slot ahí |
| 11 | Realtor toma del pool | ✅ → `asignado` |
| 12 | Realtor acepta intake | 🔴 409 "El agente no pertenece a ninguna agency" |
| 13 | Visita (`POST /visitas`) | ✅ 201 `pendiente`, pero 🔴 sin ruteo al realtor del slot |

## 1. Lógica mala encontrada (ordenada por impacto)

> ✅ Fallas 1–4 **corregidas y verificadas en DEV** (2026-11-21): slot rutea leads, independiente acepta intake, listing con agent_id/agency, nivel_zona con savepoint. Pendiente prod.

1. 🔴 **El slot pagado no recibe leads.** `asignador_service.asignar_intake` rutea solo por
   *agency patrocinadora* (sistema viejo). `siguiente_realtor()` solo lo usa el endpoint público.
   Pagar/recibir un slot no cambia a quién llega el lead. → Hacer que `asignar_intake` use
   `realtor_preferido_service.siguiente_realtor` (round-robin) antes de caer al pool.
2. 🔴 **Realtor independiente no puede aceptar** un intake (exige agency). Bloquea el flujo
   del realtor nuevo que no tiene agencia.
3. 🔴 **Listing subido por realtor queda con `agent_id` NULL** (solo `owner_id`); `/realtor/listings`
   devuelve `[]`. El realtor no ve ni gestiona lo que subió; GHL no lo asocia a él.
4. 🔴 **Webhook `realtor_slot` da 500** si `analytics.zonas_nivel_precio` no existe:
   `nivel_zona()` captura la excepción dentro de una transacción → transacción abortada.
   Fix: savepoint (`async with conn.transaction()`) o chequear la tabla. En prod depende de que dbt haya corrido.
5. 🔴 **Dos tablas de agentes** (`agentes` legacy vs `agent`) sin sincronía; `_es_agente_activo` hace OR.
6. 🔴 **Pushes a GHL son best-effort y tragan errores**: sin cola de reintento ni alarma
   (solo `_record_push_failure`). Un contacto que falla no se vuelve a intentar.
7. 🟡 Casa se puede marcar a agente no activo; sin validación.
8. 🟡 Admin no puede autoregistrarse (`ADMIN_EMAIL` bloqueado en register) ni aprobar sin password → admin solo por Google/magic link o DB.
9. 🟡 Realtor no recibe notificación real al asignarle lead (`_notificar_lead_asignado` existe, sin canal GHL/WhatsApp).
10. 🟡 Entrada GHL→sitio: solo `evento`, `tienda`, `realtor_slot`. `listing/deal/referidor/agent/visita` = 501.
11. 🟡 Pago→slot depende de un workflow GHL que **no existe aún**; si pagan y falla, queda 409 + log y requiere humano.
12. 🟡 Moneda/idioma/país del comprador no se guardan (clave para extranjeros).

## 2. Convenciones GHL (lo que hay que crear una vez)

**Auth sitio→GHL:** Private Integration token (`GHL_PRIVATE_TOKEN`, `GHL_LOCATION_ID`). **GHL→sitio:** `POST /api/v1/webhook/ghl`, header `X-Webhook-Secret`.

**Pipelines (existen):** Realtors `[new, paid]`, Negocios, Visitas, Embajadores (cada uno con `new`).
**A agregar:** Realtors `[new, approved, active, paused, churned]`; Owners/Listings `[intake, asignado, aceptado, publicado, cerrado]`; Visitas `[pendiente, contactado, agendada, realizada, no_show]`.

**Tags:** `agent`, `agent-pendiente|activo|suspendido|rechazado`, `realtor-casa`, `realtor-preferido`, `zona-barrio-<id>`, `owner`, `owner-intake-<estado>`, `buyer`, `renter`, `negocio-local`, `embajador`, `afiliado`, `pasante`, `agency-owner`, `agency-agent`.

**Custom fields (Contact):** `agent_estado`, `agent_zonas`, `es_realtor_casa`, `slot_vence`, `pago_ref`, `owner_listing_id`, `buyer_pais`, `buyer_idioma`, `buyer_intencion`.

**Workflows a construir (prioridad):**
1. **Pago slot** → trigger "Opportunity Won / pago Stripe" → webhook al sitio `realtor_slot` (`agent_email`, `zona_nivel`, `zona_codigo`, `meses`, `pago_ref`) → si 404/409 crear tarea humana.
2. **Bienvenida realtor** (tag `agent-pendiente`): email + WhatsApp + tarea de revisión.
3. **Realtor aprobado** (`agent-activo`): mover a stage `active`, enviar guía + oferta de zona.
4. **Lead asignado** (intake→asignado): WhatsApp al realtor con link; recordatorio a 12h, reasigna a 24h.
5. **Visita solicitada**: WhatsApp al realtor y al comprador; si no responde 24h → admin.
6. **Slot por vencer** (T-7, T-1 días): upsell renovar.
7. **Negocio nuevo / Embajador aprobado**: bienvenida + tarea.
8. **Alerta de fallo de sync**: notificar si un push falla (hoy invisible).

---

## 3. Procesos por persona

### 3.1 Realtor (agente) — registro → onboarded
1. Crea cuenta (email + habeas data, email verificado). Sitio: `usuarios`. **GHL:** contacto base (`upsert_contact`).
2. `POST /suscripciones/agente/registro` → `agent` `pendiente`. **GHL:** Contact + tags `agent`,`agent-pendiente`, Opp en Realtors/`new`. Dispara workflow bienvenida.
3. Admin revisa y aprueba (`/admin/agentes/{id}/aprobar`, con password). Sitio: `activo`. **GHL:** tag `agent-activo`, Opp → `paid`(renombrar a `active`).
4. Admin asigna zonas / slot gratis (`/admin/asignar`) o realtor compra slot (`/checkout` → link GHL → pago → webhook `realtor_slot`). **GHL:** tag `zona-barrio-X`, `realtor-preferido`.
5. Admin puede marcar **casa** (`/admin/casa`). **GHL:** tag `realtor-casa` (hoy 🟡 no se sincroniza).
6. Dashboard: `/realtor/me, /asignados, /pool, /pool/{id}/tomar, /listings, /desempeno, /embudo, /agenda, /disponibilidad`.
Acciones: subir listing, editar/cerrar/cambiar estado, tomar del pool, aceptar intake, publicar asignado, gestionar visitas y disponibilidad, comprar/renovar zona.
Fallas: ver §1 (2, 3, 1).

### 3.2 Propietario (owner)
1. Registro/login → verificar teléfono por OTP (email) — 403 `telefono_no_verificado` si no.
2. Opción A: `POST /listings-propios/` (formulario completo + fotos + declaraciones legales + matrícula si venta) → publicado/moderación. **GHL:** `sync_listing` (custom object `real_estate_listing`).
3. Opción B: `POST /intake` (captación) → `asignar_intake` → realtor o pool. **GHL hoy: nada** (owner no es Contact) 🟡.
4. Realtor acepta → due-diligence → publica.
Construir en GHL: Contact `owner` + pipeline Owners; tags por estado de intake; workflow de seguimiento.

### 3.3 Comprador / arrendatario
Acciones: buscar, favoritos, `POST /visitas` (agendar). **GHL:** `sync_visita` → Opp en Visitas/`new`. Falta: ruteo al realtor del slot (§1.1), país/idioma/moneda (§1.12), WhatsApp consent ya existe (`consent_whatsapp`).

### 3.4 Admin
Acciones: aprobar/rechazar/suspender agentes, zonas, slots (asignar/quitar, cobertura, casa), moderación de listings (`/admin/listings/en-revision`, aprobar/rechazar), tiendas (aprobar/editar → `sync_tienda`), eventos, posts, leads.
Requiere email = `ADMIN_EMAIL` verificado + password para acciones sensibles. GHL: workflow de alertas; hoy sin vista de fallos de sync.

### 3.5 Negocio local
Alta tienda → admin aprueba → `sync_tienda`; lead de negocio → `push_negocio_lead_to_ghl` (tag `negocio-local`, nota, Opp Negocios). Falta: cobro, reporte Funnel 1, workflow de bienvenida; `leads_negocio` es callejón sin salida.

### 3.6 Embajador / afiliado
Registro → `sync_referidor` (Opp Embajadores/`new`). Falta: aprobación, código de referido, comisión, webhook GHL→sitio (501).

### 3.7 Pasante
Sin integración GHL. Definir si es tag `pasante` + acceso limitado (solo lectura de pool/moderación).

### 3.8 Dueño de agencia / agente invitado
`/agency/me, inbox, delegar, agentes, listings, asignar, invitar`; invitado acepta `/agency/invite/{token}` → `sync_agent` + `link_agency_to_listing`. Es el único camino hoy por el que `aceptar intake` funciona (§1.2). GHL: tags `agency-owner/agency-agent`.

### 3.9 Operador GHL (tú / Talal)
Construye: workflows de §2, pipelines extra, custom fields, webhook saliente con secret, token privado, alertas. Define contrato de payload para `listing, agent, visita, deal, referidor` (hoy 501).

---

## 4. Pendientes antes de prod (regla DEV→PROD)
- Precios de ejemplo ya viven en migración; **precios reales** → decidir con Eduard y subir por migración.
- Marcar realtor casa en prod = acción admin (no migración); hacerlo tras verificar en DEV.
- Corregir §1.1–§1.4 en código → DEV → verificar → prod.
- Configurar en Railway: `GHL_SLOT_CHECKOUT_URL`, `GHL_WEBHOOK_SECRET`.
