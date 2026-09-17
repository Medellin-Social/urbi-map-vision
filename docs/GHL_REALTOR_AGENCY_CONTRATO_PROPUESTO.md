# GHL — contrato propuesto: Eventos + Negocios Locales + Agent / Owner / Agency

*Generado 2026-08-28. Propuesta, no contrato confirmado — falta que Talal valide
nombres de campo, picklists, firma del webhook, y si acepta el mapeo a objetos
nativos (Contact/Business) en vez de Custom Objects. Mismo criterio que ya se
usó para listing/tienda: no inventar un picklist sin confirmar (ver
`_map_choice` en `api/utils/ghl_client.py`) — mejor un campo sin mandar que un
valor inventado que corrompa el picklist en silencio.*

Reemplaza en GHL, todos decididos 2026-08-28: la administración de **eventos**
y **negocios locales** (destacados por alcance barrio/comuna/ciudad, migración
0079, misma mecánica para las dos tablas) y el ciclo completo de
**agente/agencia** (`/realtor/dashboard`, `/realtor/agency-dashboard`,
`/realtor/accept-invite`). `/panel-x9k2` queda fuera de los tres — no se sigue
usando como admin panel, GHL pasa a ser donde se decide todo.

---

## Prerrequisitos de cuenta — sin esto, nada de lo de abajo funciona

Esto es más básico que el mapeo de campos por entidad: es lo que hace falta
para que la conexión en sí exista, sin importar el contrato de cada objeto.

**Verificado hoy 2026-08-28: 0 de 3 env vars de GHL están configuradas en
prod** (`GHL_PRIVATE_TOKEN`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` — ninguna
existe en el servicio `Social-api` de Railway). `ghl_client.is_configured()`
devuelve `False` ahora mismo — todo el código de push existente
(`push_listing_to_ghl`, `push_tienda_to_ghl`, etc.) ya está deployado pero
nunca dispara nada real porque falta esto.

### Lado GHL (dashboard, configuración manual — no es código)

1. **Private Integration** (o app OAuth) creada en el location/sub-account de
   GHL → genera el Bearer token. Necesita scopes de lectura+escritura sobre:
   Contacts, Businesses, Custom Objects, Associations, Workflows.
2. **Location ID** del sub-account específico (visible en Settings de esa
   location en GHL).
3. **Custom Object "Event"** creado a mano en el builder de GHL (Settings →
   Custom Objects), con los campos de la sección 0 ya definidos ahí — la API
   no crea el objeto ni sus campos, solo escribe valores en campos que ya
   existen.
4. **Custom fields en Contact** (agent/owner, sección 1-2): `contact_type`,
   `agent_internal_id`, `agent_status`, `agent_status_reason`,
   `profile_photo_url`, `owner_internal_id`, `phone_verified`.
5. **Custom fields en Business** — ya existen los ~13 que usa
   `push_tienda_to_ghl` (confirmado, están en prod funcionando); faltan
   crear: `featured_scope`, `featured_zone_code`, `business_status` (tienda),
   `agency_nit`, `agency_type`, `agency_verified`, `agency_plan`,
   `agency_internal_id` (agency).
6. **Association type** Contact↔Business para agente↔agencia (la de
   listing↔agency ya existe, `_ASSOC_LISTING_AGENCY` — esta es nueva).
7. **Workflows** — uno por entidad que dispara webhook hacia nosotros: trigger
   "record created/updated" → acción Webhook → nuestra URL. No existe
   todavía ninguno.
8. **Firma del webhook** — cómo GHL firma lo que manda (header + algoritmo),
   para que `verificar_webhook()` pueda validar que el request es realmente
   de GHL y no de cualquiera que le pegue a la URL pública. Bloqueador #1 de
   todo lo pendiente — sin esto no se puede implementar ningún handler de
   entrada con seguridad real.

### Lado nuestro (una vez existan los valores reales)

Setear en Railway (`Social-api` y `social-cron` si el push corre desde ahí
también):
```
GHL_PRIVATE_TOKEN=...
GHL_LOCATION_ID=...
GHL_WEBHOOK_SECRET=...
```
Y agregarlas a `railway.env.example` — hoy ese archivo no menciona GHL en
absoluto, alguien que arranque el proyecto de cero no sabría que existen.

---

## 0. Eventos → Custom Object "Event"

Tabla real: `public.eventos`. Dirección: **bidireccional** — GHL es la fuente
(crea/edita eventos, aprueba o rechaza), empuja hacia nuestra API vía webhook.
Reemplaza el "solo salida" documentado el 2026-08-27 (ver
`api/routers/ghl_webhook.py`).

| Campo GHL propuesto | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `event_title` | titulo | texto | |
| `event_description` | descripcion | texto largo | |
| `category` | categoria | picklist* | *9 valores nuestros (musica/networking/gastronomia/…) — picklist real sin confirmar |
| `audience_type` | tipo_audiencia | picklist* | social/profesional/activo — sin confirmar |
| `municipality` | barrio_id → municipio | texto | vía join, GHL no tiene FK a nuestra tabla de barrios |
| `neighborhood` | barrio_id → nombre | texto | |
| `start_date` / `end_date` | fecha_inicio / fecha_fin | fecha+hora | |
| `price` / `currency` | precio / moneda | número / texto | |
| `is_free` | gratuito | yes/no | |
| `external_url` | url_externo | texto | |
| `photo_url` | foto_url | texto | |
| `organizer` | organizador | texto | |
| `max_attendees` | max_asistentes | número | |
| `is_active` | activo | yes/no | **este es el resultado de aprobar/rechazar** — GHL lo cambia, nosotros solo lo reflejamos |
| `is_featured` | destacado | yes/no | |
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | ya es enum cerrado de nuestro lado, mapeo directo |
| `featured_zone_code` | destacado_zona_codigo | texto | barrio_id o cd_comuna como texto |

**Ejemplo Postman — Custom Object record:**
```
POST https://services.leadconnectorhq.com/objects/custom_objects.event/records
Headers:
  Authorization: Bearer {{GHL_PRIVATE_TOKEN}}
  Version: 2021-07-28

Body:
{
  "locationId": "{{GHL_LOCATION_ID}}",
  "properties": {
    "event_title": "Feria de Emprendimiento El Poblado",
    "event_description": "Encuentro mensual de negocios locales.",
    "category": "networking",
    "audience_type": "profesional",
    "municipality": "Medellín",
    "neighborhood": "El Poblado",
    "start_date": "2026-09-05T18:00:00Z",
    "is_free": "yes",
    "organizer": "Cámara de Comercio",
    "is_active": "no",
    "is_featured": "no"
  }
}
```
`is_active: "no"` al crear = entra como pendiente. Cuando el admin aprueba
**dentro de GHL**, cambia a `"yes"` y dispara el workflow que nos avisa.

**Workflow en GHL:** trigger "Event record created/updated" → acción Webhook
→ `POST https://medellinsocial-api.up.railway.app/api/v1/webhook/ghl` con
`object_type: "evento"` + los `properties` del record. Un solo webhook cubre
tanto la creación (pendiente) como el cambio de estado (aprobado/rechazado) —
nuestra API no necesita distinguir, solo lee `is_active` y `is_featured` cada
vez y hace upsert.

**Dedup:** `ghl_object_mapping` (migración 0082) ya soporta `object_type` como
discriminador — agregar `"evento"` como valor válido ahí, mismo mecanismo que
listing/deal.

---

## 0b. Negocios Locales (tienda) → Business

Tabla real: `public.tiendas`. Distinto de los demás: **la salida ya está
construida y funcionando** — `push_tienda_to_ghl()` en `ghl_client.py` existe,
manda 6 campos estándar de Business (`_tienda_campos_to_standard`) + ~13
custom fields (`_tienda_campos_to_custom`). Lo que falta es la entrada
(GHL → nosotros), igual que con evento.

**Gap real encontrado hoy:** `_tienda_campos_to_custom` se escribió antes de
la migración 0079 — no manda `destacado_nivel` ni `destacado_zona_codigo`
todavía, aunque la columna ya existe y ya se usa en `admin.py`
(`editar_tienda`, mismo `DestacadoPatch` que eventos). Antes de agregarlos al
push, confirmar con Talal si ya existen como custom field en el Business
object de GHL — si no existen del otro lado, el API los rechaza o los
descarta en silencio.

| Campo GHL propuesto (nuevo) | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | mismo campo que se propuso para evento — reusar el mismo custom field si GHL permite compartirlo entre Business y Custom Object |
| `featured_zone_code` | destacado_zona_codigo | texto | |
| `business_status` | activo | picklist: pendiente/activo/rechazado* | *hoy `activo` es boolean — para reflejar aprobado/rechazado desde GHL hace falta un estado de 3 valores, no solo true/false; a decidir si se agrega una columna o se reusa `verificado` |

**Entrada (GHL → nosotros):** igual patrón que evento — GHL crea/edita el
Business record, workflow dispara `POST /api/v1/webhook/ghl` con
`object_type: "tienda"`. El handler (`_upsert_tienda_from_ghl` en
`ghl_webhook.py`) ya existe como stub `NotImplementedError`, listo para
recibir en cuanto haya contrato.

**Campos ya confirmados y funcionando** (ver `_tienda_campos_to_custom` para
la lista completa): nombre, descripción, subcategoría, barrio, whatsapp,
instagram, google_place_id, precio_rango, verified, featured, rating —
no hace falta re-proponerlos, ya están en producción saliendo hacia GHL.

---

## Por qué objetos nativos, no Custom Objects (Agent/Owner/Agency)

`agent` y `owner` son personas → mapean al objeto nativo **Contact** de GHL
(mismo objeto que ya usa `find_or_create_contact()` para suscripciones).
`agency` es una empresa → mapea a **Business** (mismo objeto que ya usa
`tienda`, ver `_tienda_campos_to_standard`). La relación agente↔agencia (rol,
invitación) va por la **Association API** — mismo patrón que ya conecta
`listing` con `agency` (`_create_relation`, `_ASSOC_LISTING_AGENCY`).

Esto es justo lo que estaba bloqueado antes ("crear Contact no está en el
contrato") — esta propuesta es el mapeo concreto para des-bloquearlo con
Talal.

---

## 1. Agent → Contact

Tabla real: `public.agent`

| Campo GHL propuesto | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `firstName` / `lastName` | nombre (split) | texto | GHL Contact pide nombre separado; nuestro `nombre` es un solo campo — partir por el primer espacio, sin inventar apellido si no hay |
| `email` | email | texto | único, ya lo es de nuestro lado también |
| `phone` | telefono | texto | |
| `contact_type` (custom field) | — | picklist fijo `"agent"` | para distinguir de Owner en el mismo pool de Contacts |
| `agent_internal_id` (custom field) | id | texto | uuid nuestro, para el mapeo inverso |
| `agent_status` (custom field) | estado | picklist: pendiente/activo/rechazado/inactivo* | *picklist real sin confirmar — no mandar hasta que Talal dé las opciones exactas |
| `agent_status_reason` (custom field) | motivo_estado | texto | |
| `profile_photo_url` (custom field) | foto_url | texto | |

**Ejemplo Postman — crear/actualizar Contact:**
```
POST https://services.leadconnectorhq.com/contacts/
Headers:
  Authorization: Bearer {{GHL_PRIVATE_TOKEN}}
  Version: 2021-07-28
  Content-Type: application/json

Body:
{
  "locationId": "{{GHL_LOCATION_ID}}",
  "firstName": "Camila",
  "lastName": "Restrepo",
  "email": "camila@example.com",
  "phone": "+573001234567",
  "customFields": [
    { "key": "contact_type", "field_value": "agent" },
    { "key": "agent_internal_id", "field_value": "8f14e45f-...-uuid" },
    { "key": "agent_status", "field_value": "activo" },
    { "key": "profile_photo_url", "field_value": "https://.../foto.jpg" }
  ]
}
```

---

## 2. Owner → Contact

Tabla real: `public.owner`

| Campo GHL propuesto | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `firstName` / `lastName` | nombre (split) | texto | |
| `email` | email | texto | |
| `phone` | telefono | texto | |
| `contact_type` (custom field) | — | `"owner"` | mismo campo que Agent, distinto valor |
| `owner_internal_id` (custom field) | id | texto | |
| `phone_verified` (custom field) | telefono_verificado | yes/no | |

**Deliberadamente NO incluido:** `otp_codigo`, `otp_expira` — son mecanismo
interno de verificación (10 min de validez), no tienen valor del lado de GHL y
exponerlos sería un riesgo de seguridad sin motivo.

---

## 3. Agency → Business

Tabla real: `public.agency`

| Campo GHL propuesto | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `name` | nombre | texto | campo estándar de Business |
| `agency_nit` (custom field) | nit | texto | NIT colombiano, puede ser null (independiente sin NIT) |
| `agency_type` (custom field) | tipo | picklist: independiente/inmobiliaria/constructora* | *valores del enum `agency_tipo` — confirmar traducción a picklist de GHL con Talal |
| `agency_verified` (custom field) | verificada | yes/no | |
| `agency_plan` (custom field) | plan | texto | |
| `agency_internal_id` (custom field) | id | texto | |

**Ejemplo Postman — Business (mismo patrón que tienda, `/businesses/`):**
```
POST https://services.leadconnectorhq.com/businesses/
Headers:
  Authorization: Bearer {{GHL_PRIVATE_TOKEN}}
  Version: 2021-07-28

Body:
{
  "locationId": "{{GHL_LOCATION_ID}}",
  "name": "Inmobiliaria El Poblado SAS",
  "customFields": [
    { "key": "agency_nit", "field_value": "900123456-7" },
    { "key": "agency_type", "field_value": "inmobiliaria" },
    { "key": "agency_verified", "field_value": "yes" },
    { "key": "agency_internal_id", "field_value": "3a7c...-uuid" }
  ]
}
```

---

## 4. Agent ↔ Agency: rol + invitación

Tablas reales: `public.agency_member` (rol activo), `public.agency_invite`
(invitación pendiente/aceptada/rechazada/vencida)

**Rol activo (agency_member)** → Association entre Contact(agent) y
Business(agency), mismo mecanismo que `_create_relation()` ya usa para
listing↔agency:

```
POST https://services.leadconnectorhq.com/associations/relations
Headers:
  Authorization: Bearer {{GHL_PRIVATE_TOKEN}}
  Version: 2021-07-28

Body:
{
  "locationId": "{{GHL_LOCATION_ID}}",
  "associationId": "{{ASSOC_AGENT_AGENCY}}",
  "firstRecordId": "{{ghl_business_id}}",
  "secondRecordId": "{{ghl_contact_id}}"
}
```
`rol` (agente/admin de agencia — ver enum `agency_member_rol`) iría como
custom field en la Association misma si GHL lo permite, o si no, como custom
field en el Contact (`agency_role`) — a confirmar cuál soporta GHL, el PDF de
Talal no cubre Associations con propiedades propias.

**Invitación (agency_invite)** — esto es un flujo, no un objeto que deba
persistir del lado de GHL: `estado` (pendiente/aceptada/rechazada/vencida) y
`token`/`expires_at` son mecanismo interno de invitación por link. Lo que sí
tiene sentido reflejar en GHL es el **resultado**: cuando se acepta, se crea
la Association de arriba. No hay necesidad de un objeto "Invite" en GHL —
sería inventar estructura que no aporta nada del lado de su CRM.

---

## Pendiente de Talal (mismo bloqueo de siempre)

**Eventos:**
1. Firma del webhook (header + algoritmo) — sin esto `verificar_webhook` no
   valida nada, y el endpoint ya está listo para recibir en cuanto exista.
2. Payload de ejemplo real de un Event record tal como lo manda el workflow
   de GHL.
3. Picklist real de `category` y `audience_type` (nuestros enums `categoria`
   de eventos y `tipo_audiencia`).
4. ¿Un solo endpoint recibe las 4 entidades bidireccionales (listing, deal,
   evento, tienda) con `object_type` en el body, o hay una URL de webhook por
   tipo?

**Negocios Locales (tienda):**
5. ¿`featured_scope`/`featured_zone_code` ya existen como custom field en el
   Business object, o hay que crearlos? (mismos nombres propuestos para
   evento — confirmar si se comparten o van separados).
6. ¿Cómo reflejar aprobado/rechazado si `activo` es boolean? ¿Estado nuevo de
   3 valores, o alcanza con true/false?
7. Firma del webhook + payload de ejemplo para tienda (puede ser el mismo de
   evento si comparten firma).

**Agent / Owner / Agency:**
8. ¿Confirma el mapeo a Contact/Business nativos, o insiste en Custom Objects
   dedicados para agent/owner/agency?
9. Picklist real de `agent_status` y `agency_type` (los enums de nuestro lado:
   `agent_estado`, `agency_tipo`) — sin esto, `_map_choice()` no manda esos
   campos en vez de adivinar.
10. ¿Las Associations soportan custom fields propios (para `rol`), o hay que
    guardarlo en el Contact?
11. Firma del webhook para agent/owner/agency, si se confirma inbound como
    con evento (hoy no hay ni siquiera stub de esta dirección).
