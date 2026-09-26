# GHL — contrato propuesto (consolidado, todas las entidades)

*Generado 2026-09-24. Reemplaza y fusiona `GHL_PENDIENTES_TALAL.md`,
`GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md`, `GHL_REFERIDOR_CONTRATO_PROPUESTO.md`
y `GHL_FIELDS_CHECKLIST.md` — estaban repartidos en 4 archivos, ahora es uno
solo. Cada punto de este documento fue re-verificado contra el código y las
migraciones reales al momento de fusionar, no es un copy-paste de los
archivos viejos — donde algo había cambiado o estaba mal, se corrigió (ver
notas "✅ verificado" / "🔧 corregido" en cada sección).*

**Propuesta, no contrato confirmado en ningún punto** — no se inventa
picklist ni nombre de campo sin que Talal lo confirme (mismo criterio que
`_map_choice()` en `api/utils/ghl_client.py`: mejor un campo sin mandar que
uno inventado que corrompa algo en silencio del lado GHL).

---

## 0. Prerrequisitos de cuenta — bloquea todo lo demás

- [ ] **Email de Medellín Social** para conectar la cuenta GHL (login del
      sub-account / Private Integration) — sin definir. Candidatos en uso
      hoy: `noreply@medellinsocial.com` (transaccional),
      `rentalinquiries@medellinsocial.com` (leads de arriendo) — ninguno es
      necesariamente el correcto para administrar la cuenta.
- [ ] `GHL_PRIVATE_TOKEN` / `GHL_LOCATION_ID` — 🔧 **estado real distinto al
      que decían los docs viejos:** última verificación en prod (Railway
      `Social-api`) fue 2026-08-28, ausentes. **Esta sesión (2026-09-24) se
      encontró que SÍ están configuradas en `.env` local** — no se
      re-verificó prod. Confirmar si prod ya las tiene también, o si solo
      existen en local y hay que promoverlas.
- [ ] `GHL_WEBHOOK_SECRET` — bloqueador #1 de **todo** lo inbound (las 7
      entidades de este documento comparten el mismo bloqueo):
      `verificar_webhook()` en `ghl_client.py` es un stub que no puede
      validar nada sin la firma real (header + algoritmo) de GHL.
- [ ] Al menos un **Workflow** por entidad en GHL (trigger: record
      created/updated → acción: webhook a nuestra API) — ninguno existe
      todavía del lado GHL.
- [ ] Agregar las 3 env vars a `railway.env.example` una vez existan valores
      de prod confirmados (hoy no menciona GHL en absoluto).

✅ **Verificado 2026-09-24:** `ghl_object_mapping` (migración 0082) ya
acepta `agent`/`owner`/`agency` como `object_type` válido (migración 0083,
además de `listing`/`tienda`/`evento`/`deal`) — la infraestructura de
dedup/tracking de sync ya está lista para esas 3 entidades apenas se
implemente el push real. **Falta agregar `referidor`** a ese mismo CHECK
constraint cuando se implemente §6 (hoy no hace falta porque el código de
referidor nunca llega a escribir ahí — el stub falla antes).

---

## 1. Eventos → Custom Object "Event"

✅ Verificado: `_upsert_evento_from_ghl` (stub) y dispatcher en
`api/routers/ghl_webhook.py` existen, `push_evento_to_ghl` (stub) en
`ghl_client.py` también — nada implementado, solo el esqueleto.

Tabla real: `public.eventos`. Dirección: **bidireccional** — GHL es la
fuente (crea/edita/aprueba/rechaza), empuja hacia nuestra API vía webhook.

| Campo GHL propuesto | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `event_title` | titulo | texto | |
| `event_description` | descripcion | texto largo | |
| `category` | categoria | picklist* | 9 valores nuestros — picklist real sin confirmar |
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
| `is_active` | activo | yes/no | resultado de aprobar/rechazar — GHL lo cambia, nosotros lo reflejamos |
| `is_featured` | destacado | yes/no | |
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | ✅ columna verificada, migración 0079 |
| `featured_zone_code` | destacado_zona_codigo | texto | |

**Workflow GHL:** trigger "Event record created/updated" → Webhook →
`POST /api/v1/webhook/ghl` con `object_type: "evento"` + `properties`. Un
solo webhook cubre creación (pendiente) y cambio de estado.

---

## 2. Negocios locales (tienda) → Business

✅ Verificado: **la salida ya está construida y funcionando en prod** —
`push_tienda_to_ghl()` manda 6 campos estándar de Business
(`_tienda_campos_to_standard`) + 13 custom fields
(`_tienda_campos_to_custom`, confirmado leyendo el código: subcategoría,
barrio, whatsapp, instagram, google_place_id, precio_rango, verified,
featured, featured_badge, featured_since, operating_hours, google_rating,
active). Falta la entrada (GHL → nosotros).

🔧 **Gap real confirmado de nuevo esta sesión:** `_tienda_campos_to_custom`
sigue sin mandar `destacado_nivel`/`destacado_zona_codigo` (migración 0079,
usada en `admin.py` `editar_tienda`/`DestacadoPatch` — ✅ verificado que
existe y se usa). Antes de agregarlos al push, confirmar si ya existen como
custom field en el Business object de GHL.

| Campo GHL propuesto (nuevo) | Columna nuestra | Tipo | Nota |
|---|---|---|---|
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | mismo campo que evento — reusar si GHL permite compartirlo entre Business y Custom Object |
| `featured_zone_code` | destacado_zona_codigo | texto | |
| `business_status` | activo | picklist: pendiente/activo/rechazado* | hoy `activo` es boolean — para reflejar aprobado/rechazado desde GHL hace falta un estado de 3 valores |

**Entrada (GHL → nosotros):** `_upsert_tienda_from_ghl` en `ghl_webhook.py`
ya existe como stub, listo para recibir en cuanto haya contrato.

---

## 3. Deal (Convenio) y Hotspot → dos productos distintos, sin mapeo propuesto todavía

🔧 **Corregido esta sesión:** el doc viejo (`GHL_PENDIENTES_TALAL.md` §3)
trataba "Deal/Hotspot/Convenio" como una sola entidad — el usuario ya
corrigió esto en el código el 2026-09-23 (ver `project_deals_vs_hotspot`):
son dos tablas y dos conceptos de producto separados. No mandarle a Talal
la versión mezclada.

✅ Verificado: `push_deal_to_ghl()` y `_upsert_deal_from_ghl()` son ambos
stub — ni el lado de salida existe. **Hotspot no tiene NINGÚN código GHL
todavía, ni siquiera un nombre de función stub** — es la entidad más nueva
de todo este documento (migración `0094_hotspots.py`, 2026-09-23).

### 3a. Deal (Convenio) — `public.deals`

Bidireccional, mismo estatus que listing. Contexto: negocios que dan un
beneficio a quien se presente físicamente en el local, promocionado con
influencers bilingües (ES/EN).

Columnas reales: `tienda_id`, `tipo_deal`, `descripcion`, `categoria`,
`barrio_id`, `ciudad_id`, `fecha_inicio`, `fecha_fin`, `activo`,
`destacado`, `suscripcion_id`, `descripcion_larga`, `foto_url`, `vistas`,
`clicks`. **No existe `descripcion_en`** — si el contenido bilingüe lo
maneja GHL, confirmar si se resuelve con 2 campos o localización nativa.

Checklist propuesto (mismo patrón que evento/tienda):

- [ ] `deal_type` — texto libre (nuestro `tipo_deal`, no es enum cerrado)
- [ ] `description_es` / `description_en` — texto largo, bilingüe
- [ ] `category` — picklist* (mismos valores que `tienda.categoria`)
- [ ] `start_date` / `end_date` — fecha
- [ ] `is_active` / `is_featured` — yes/no
- [ ] `photo_url` — texto
- [ ] Relación al Business dueño del convenio — Association, mismo
      mecanismo que `link_agency_to_listing`

### 3b. Hotspot — `public.hotspots` (✅ verificado, migración 0094)

Distinto de Deal: lugar curado/destacado por experiencia (mejor rooftop,
mejor salsa, mejores cócteles) — un "best of" editorial por vibe, no un
descuento puntual. Siempre ligado a un negocio pagador (`tienda_id NOT
NULL`, `suscripcion_id NOT NULL` — todo hotspot es pago, sin excepción
editorial, mismo plan $29 de `planes_negocio` que cubre Deal).

Columnas reales (`api/routers/business.py`, `_HOTSPOTS_QUERY`):
`tienda_id`, `categoria_experiencia` (texto libre: rooftop, mejor_salsa,
mejores_cocteles...), `descripcion`, `foto_url`, `barrio_id`, `ciudad_id`,
`fecha_fin`, `activo`, `destacado`, `suscripcion_id`, `created_at`.

Checklist propuesto (nunca antes propuesto a Talal, es nuevo en este doc):

- [ ] `experience_category` — texto libre (nuestro `categoria_experiencia`,
      no es enum cerrado — no inventar picklist)
- [ ] `description` — texto largo
- [ ] `end_date` — fecha (no tiene `fecha_inicio`, a diferencia de Deal)
- [ ] `is_active` / `is_featured` — yes/no
- [ ] `photo_url` — texto
- [ ] Relación al Business dueño del hotspot — mismo mecanismo que Deal

---

## 4. Agent / Owner / Agency → Contact / Business

✅ Verificado: `find_or_create_contact()` sigue siendo stub — no hay ningún
push de Contact funcionando hoy en todo el código, este es el primer intento
de definir ese contrato.

**Por qué objetos nativos, no Custom Objects:** `agent`/`owner` son
personas → **Contact**. `agency` es empresa → **Business** (mismo objeto
que ya usa tienda). La relación agente↔agencia va por **Association API**
(mismo patrón que `_create_relation`/`_ASSOC_LISTING_AGENCY`).

### 4a. Agent → Contact (`public.agent`)

| Campo GHL propuesto | Columna nuestra | Nota |
|---|---|---|
| `firstName`/`lastName` | nombre (split) | GHL pide nombre separado, partir por el primer espacio |
| `email` / `phone` | email / telefono | |
| `contact_type` (custom) | — | picklist fijo `"agent"` |
| `agent_internal_id` (custom) | id | uuid nuestro |
| `agent_status` (custom) | estado | picklist* pendiente/activo/rechazado/inactivo — sin confirmar |
| `agent_status_reason` (custom) | motivo_estado | |
| `profile_photo_url` (custom) | foto_url | |

### 4b. Owner → Contact (`public.owner`)

| Campo GHL propuesto | Columna nuestra | Nota |
|---|---|---|
| `firstName`/`lastName`, `email`, `phone` | nombre/email/telefono | |
| `contact_type` (custom) | — | `"owner"` |
| `owner_internal_id` (custom) | id | |
| `phone_verified` (custom) | telefono_verificado | |

**Deliberadamente NO incluido:** `otp_codigo`/`otp_expira` — mecanismo
interno de verificación, sin valor del lado GHL, riesgo de seguridad
exponerlo sin motivo.

### 4c. Agency → Business (`public.agency`)

| Campo GHL propuesto | Columna nuestra | Nota |
|---|---|---|
| `name` | nombre | campo estándar |
| `agency_nit` (custom) | nit | puede ser null |
| `agency_type` (custom) | tipo | picklist* independiente/inmobiliaria/constructora |
| `agency_verified` (custom) | verificada | yes/no |
| `agency_plan` (custom) | plan | texto |
| `agency_internal_id` (custom) | id | |

### 4d. Agent ↔ Agency: rol + invitación

`agency_member` (rol activo) → Association Contact(agent)↔Business(agency),
mismo mecanismo que listing↔agency. `rol` como custom field en la
Association si GHL lo permite, o en el Contact si no.

`agency_invite` (pendiente/aceptada/rechazada/vencida) es mecanismo interno
de invitación por link — no necesita objeto propio en GHL, solo reflejar el
resultado (cuando se acepta, se crea la Association).

---

## 5. Usuarios (registro web) / Leads de marketing

Hoy `usuarios` (registro directo) y los leads que entran por landing/funnel
de ads son **dos pools sin ningún puente**, en ninguna dirección.
`usuarios.ghl_contact_id` (✅ verificado, migración 0077) y
`usuarios.customer_type` + `ghl_account_mapping` (✅ verificado, migración
0084) son columnas ya reservadas para esto, sin código que las use todavía.

- **Website → GHL (crear Contact):** el handoff existente solo valida
  GET/PUT sobre un Contact que ya existe — cero `POST /contacts` probado.
  Mismo bloqueo circular que Agent/Owner arriba.
- **GHL → nuestra DB (traer leads de ads):** ¿el contrato incluye List/Search
  Contacts filtrable por tag/funnel, o solo GET-por-ID? Si es solo
  GET-por-ID, no hay forma de *descubrir* leads nuevos sin la firma del
  webhook (§0) o ese endpoint de listado.
- **Login unificado (magic link):** ✅ **verificado 2026-09-24, construido y
  en producción de nuestro lado** — `POST /auth/magic-link` +
  `/auth/magic-link/verificar` (`api/routers/auth.py`), auto-registra si el
  email no existe todavía. Le da un destino concreto al punto anterior: si
  un Contact se crea en GHL, con solo su email ya se le puede dar acceso sin
  pasar por `/register`. Falta: ¿el Workflow "Contact Created" puede
  disparar el webhook con el email en el payload? `object_type: "contact"`
  no existe todavía en `_HANDLERS` — se agrega apenas Talal confirme el
  payload, no es trabajo pesado.

---

## 6. Referidor (Afiliado / Embajador) — comisión por negocio referido

🔧 **Revisado por completo esta sesión (2026-09-24) — la propuesta anterior
(Contact + Opportunity genérico) NO coincide con lo que el propio blueprint
de Talal (`docs/Medellin-Social-GHL-Architecture.pdf`) ya especifica.**
Leyendo el PDF completo se encontró el mecanismo real que Talal propone:

> *"Affiliate commission → MASTER: GHL **Affiliate Manager** → Referral
> custom object. Financial attribution must have one authority."*
> *"Affiliate Manager is the single source of truth for attribution and
> payout. Nothing else may calculate commission."*

Es decir: **no es Contact + custom fields + Opportunity** (lo que se había
propuesto antes de leer el PDF) — es la función nativa **Affiliate Manager**
de GHL (attribution, commissions, referral links) generando un **Referral
custom object** por cada conversión, con estos campos según el blueprint:

- Referred person (a quién refirió)
- Date
- Package purchased
- Status
- Sale value
- Commission

El propio PDF marca esto como *"Proposed — validate Affiliate Manager API
access and whether conversion events can trigger cross-sub-account object
creation"* — ni Talal lo da por confirmado contra la API real todavía.

**Dato adicional del blueprint, no confirmado por nadie del lado nuestro:**
el `customer_type` de `usuarios` (migración 0084) ya incluye
`neighbourhood_ambassador` y `community_affiliate` como valores — el
blueprint los ubica en un tercer tier ("GROWTH", ni gratis ni pagador) junto
a "Affiliate Manager Referral objects". Y el propio blueprint prioriza
Referral como uno de los **primeros 3 objetos a construir** ("start with
Business, Property Listing and Referral") — más prioridad de la que se le
había asumido por el simple hecho de que hoy no tiene ningún código.

### Nuestro lado — ya construido (2026-09-24)

- `POST /api/v1/afiliados/aplicar` y `POST /api/v1/embajadores/aplicar` —
  formulario público en producción, inserta en `public.aplicacion_referidor`.
- Cada aplicación intenta un push a GHL automáticamente
  (`ghl_client.sync_referidor`, best-effort). Falla siempre a propósito hoy:
  `push_referidor_to_ghl` es stub esperando este contrato.
- `object_type: "referidor"` ya registrado en `_HANDLERS`
  (`api/routers/ghl_webhook.py`), handler también en stub.
- Tablas legacy `public.referidor`/`public.referidos` (0 filas) **no se van
  a usar** — quedaban de una consolidación previa a la decisión de que esto
  vive en GHL, no son destino.

### Pendiente de Talal, específico de esta entidad

- [ ] ¿Affiliate Manager ya está habilitado en la location? ¿Qué API
      expone (creación de afiliado, generación de link de referido, lectura
      de comisión calculada)?
- [ ] Campos reales del Referral custom object (los 6 de arriba son los que
      nombra el blueprint, sin confirmar nombres exactos de API)
- [ ] ¿El afiliado/embajador recibe su propio sub-account (como dice el
      blueprint: "Referral custom object created in the affiliate's own
      sub-account"), o es un Contact en la cuenta central? Esto cambia todo
      el flujo de provisioning.
- [ ] ¿`referidor_codigo` (nuestro identificador) lo genera GHL como parte
      del link de referido, o lo generamos nosotros?
- [ ] Firma del webhook — mismo bloqueador que el resto (§0).

---

## 7. Precios — ⚠️ nada de esto es fuente de verdad todavía

🔧 **Corregido 2026-09-24:** el doc anterior presentaba estos números como
"fuente = DB/código, no marketing" — eso era falso. `$410,000 COP` de
Featured Business es el seed de la migración `0012_modelo_negocio.py`
(junio), tan provisional como el `$820,000` que `afiliado.tsx` usaba antes
de corregirse. Los % de comisión (`referidor.comision_pct` default 15%
afiliado / 10% embajador) tampoco están confirmados como cifra vigente —
son default de tabla, no decisión de negocio cerrada.

**No mandarle ningún precio ni % a Talal como si fuera definitivo.** Si
Affiliate Manager necesita configurarse con una regla de comisión real,
confirmar la cifra vigente con el equipo antes, no copiar estos números.

---

## 8. Checklist de campos a crear en GHL (resumen para quien configure el dashboard)

*Campos marcados `picklist*` necesitan las opciones reales de Talal antes de
crearse — no inventar los valores, crear como texto libre o esperar.*

**Custom Object "Event" (nuevo):** `event_title`, `event_description`,
`category` (picklist*), `audience_type` (picklist*), `municipality`,
`neighborhood`, `start_date`, `end_date`, `price`, `currency`, `is_free`,
`external_url`, `photo_url`, `organizer`, `max_attendees`, `is_active`,
`is_featured`, `featured_scope` (picklist: neighborhood/district/city),
`featured_zone_code`.

**Contact (nativo) — 7 campos nuevos, Agent + Owner:** `contact_type`
(picklist: agent/owner), `agent_internal_id`, `agent_status` (picklist*),
`agent_status_reason`, `profile_photo_url`, `owner_internal_id`,
`phone_verified`.

**Business (nativo) — ya existen, confirmados funcionando en prod:**
`business_subcategory`, `barrio`, `whatsapp`, `instagram`,
`google_place_id`, `price_range`, `verified`, `featured`,
`featured_badge`, `featured_since`, `operating_hours`, `google_rating`,
`active`.

**Business (nativo) — nuevos, tienda:** `featured_scope`,
`featured_zone_code`, `business_status` (picklist*).

**Business (nativo) — nuevos, agency:** `agency_nit`, `agency_type`
(picklist*), `agency_verified`, `agency_plan`, `agency_internal_id`.

**Business (nativo) — nuevos, deal:** `deal_type`, `description_es`,
`description_en`, `category` (picklist*), `start_date`, `end_date`,
`is_active`, `is_featured`, `photo_url`.

**Business (nativo) o Custom Object nuevo — hotspot (sin propuesta previa,
entidad más nueva del documento):** `experience_category`, `description`,
`end_date`, `is_active`, `is_featured`, `photo_url`.

**Affiliate Manager / Referral (referidor) — pendiente de que Talal
confirme si ya existe habilitado, ver §6:** referred_person, date,
package_purchased, status, sale_value, commission — nombres tentativos,
sin confirmar contra la API real de Affiliate Manager.

**No es un campo — setup aparte:** Association Contact↔Business para
agente↔agencia (la de listing↔agency ya existe).

---

## 9. Pendiente de Talal — lista maestra numerada

**Cuenta (bloquea todo):**
1. Email de la cuenta GHL — sin definir (§0).
2. Confirmar estado real de `GHL_PRIVATE_TOKEN`/`GHL_LOCATION_ID` en prod —
   última verificación fue 2026-08-28 (ausentes); local sí las tiene desde
   esta sesión, sin re-verificar prod.
3. Firma del webhook (header + algoritmo) — desbloquea *todo* lo inbound de
   una sola vez: eventos, tienda, deal, agent/owner/agency, referidor, y
   login unificado (§5), que ya no necesita nada más de nuestro lado.

**Eventos:**
4. Payload de ejemplo real de un Event record.
5. Picklist real de `category` y `audience_type`.
6. ¿Un solo endpoint recibe las 7 entidades (agregado Hotspot, separado de Deal) con `object_type` en el body, o
   hay una URL por tipo?

**Negocios locales (tienda):**
7. ¿`featured_scope`/`featured_zone_code` ya existen como custom field en
   Business, o hay que crearlos?
8. ¿Cómo reflejar aprobado/rechazado si `activo` es boolean?

**Agent / Owner / Agency:**
9. ¿Confirma Contact/Business nativos, o insiste en Custom Objects dedicados?
10. Picklist real de `agent_status` y `agency_type`.
11. ¿Las Associations soportan custom fields propios (para `rol`)?

**Usuarios / Leads:**
12. Website → GHL: confirmar `POST /contacts` (crear, no solo GET/PUT).
13. GHL → nosotros: ¿List/Search Contacts filtrable, o solo GET-por-ID?
14. Login unificado: ¿el Workflow "Contact Created" puede mandar el email
    en el payload? (única pieza que falta, ya construimos el resto).

**Deal (Convenio):**
15. `deal_type`, bilingüe (`description_es`/`en`), picklist de `category`.

**Hotspot (🔧 nueva en este doc — nunca se le propuso nada a Talal, no
confundir con Deal, son dos productos distintos desde 2026-09-23):**
16. ¿Business nativo (como tienda/deal) o Custom Object dedicado?
17. Firma del webhook (comparte el bloqueador #1 de §0, no es punto nuevo).

**Referidor (afiliado/embajador):**
18. ¿Affiliate Manager ya habilitado? ¿Qué API expone?
19. Campos reales del Referral custom object.
20. ¿Sub-account propio para el afiliado, o Contact central?
21. ¿`referidor_codigo` lo genera GHL o nosotros?

---

## Resumen ejecutivo — orden sugerido si hay que priorizar

1. **Cuenta (§0)** — sin esto no se prueba nada, ni lo que ya está
   implementado (`push_tienda_to_ghl` deployado pero inerte sin firma).
2. **Firma del webhook** — la pieza más barata de todo el documento una vez
   exista: desbloquea 7 entidades a la vez, incluido login unificado que ya
   no necesita nada más.
3. **Referral / Affiliate Manager (§6)** — 🔧 re-priorizado esta sesión: el
   propio blueprint de Talal lo pone en el top-3 de objetos a construir,
   no al final como sugería el orden viejo.
4. **Deal/Convenio (§3a)** — lo que se está discutiendo activamente.
5. **Hotspot (§3b)** — producto nuevo (2026-09-23), cero propuesta previa a
   Talal, agregado por primera vez en este documento.
6. **Resto (evento, tienda, agent/owner/agency, usuarios)** — ya tienen
   propuesta escrita, solo falta que Talal confirme.
