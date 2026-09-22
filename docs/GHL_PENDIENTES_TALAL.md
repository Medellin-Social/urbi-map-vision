# GHL — Pendientes de Talal (consolidado) + Precios + Cuenta

*Creado 2026-09-19. Documento vivo — junta lo que ya estaba disperso en
`GHL_FIELDS_CHECKLIST.md` y `GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md`, agrega
2 gaps nuevos encontrados hoy (Deal/Convenio y Referidor/Afiliado/Embajador),
más precios y el dato de cuenta que faltaba.*

*Actualizado 2026-09-20: agregado punto #14 (login unificado por magic
link) — ver §2.*

---

## 1. Cuenta / conexión (bloquea todo lo demás)

- [ ] **Email de Medellín Social** que va a conectar la cuenta GHL (login del
      sub-account / Private Integration) — **sin definir todavía**. Emails
      existentes en uso hoy: `noreply@medellinsocial.com` (envíos
      transaccionales), `rentalinquiries@medellinsocial.com` (leads de
      arriendo) — ninguno de los dos es necesariamente el correcto para
      administrar la cuenta GHL. Definir cuál antes de crear la Private
      Integration.
- [ ] `GHL_PRIVATE_TOKEN` — verificado 2026-08-28: no configurado en prod
      (Railway `Social-api`). Confirmar si sigue así.
- [ ] `GHL_LOCATION_ID` — mismo estado, sin configurar.
- [ ] `GHL_WEBHOOK_SECRET` — bloqueador #1 de todo lo inbound: sin firma
      confirmada, `verificar_webhook()` no puede validar nada.
- [ ] Agregar las 3 env vars a `railway.env.example` una vez existan valores
      reales (hoy no menciona GHL).

---

## 2. Ya documentado en detalle (ver archivo, no se repite acá)

| Entidad | Estado | Detalle completo |
|---|---|---|
| Evento | Bidireccional decidido, 0 implementado (falta contrato) | `GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md` §0 |
| Tienda (negocio local) | Salida funcionando, entrada bloqueada | ídem §0b |
| Agent / Owner / Agency | Propuesta de mapeo a Contact/Business, sin confirmar | ídem §1-4 |
| Usuarios (registro web) / Leads de ads | Sin puente en ninguna dirección, ni siquiera diseñado | ídem, sección final (#12-13) |
| Login unificado (magic link) | **Nuestro lado ya construido y testeado (2026-09-20)** — falta que Talal confirme que el webhook de Contact puede mandar el email | ídem, sección final (#14) |

Preguntas puntuales pendientes de cada una: ver la sección "Pendiente de
Talal" al final de `GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md` (14 puntos ya
listados ahí).

---

## 3. NUEVO — Deal / Hotspot / Convenio (sin ningún mapeo propuesto todavía)

Tabla real: `public.deals`. Decisión ya tomada (2026-08-27): **bidireccional**,
mismo estatus que `listing` — pero a diferencia de evento/tienda, **nunca se
llegó a proponer un mapeo de campos**. `push_deal_to_ghl()`
(`api/utils/ghl_client.py:565`) y `_upsert_deal_from_ghl()`
(`api/routers/ghl_webhook.py:57`) son ambos `NotImplementedError` — ni
siquiera el lado de salida existe (a diferencia de tienda).

Contexto de negocio (confirmado con el usuario 2026-09-19): esto es el
programa de **convenios** — negocios que dan un beneficio a quien se presente
físicamente en el local. Se promociona con influencers bilingües (ES/EN).

Columnas reales hoy en `deals`: `tienda_id`, `tipo_deal`, `descripcion`,
`categoria`, `barrio_id`, `ciudad_id`, `fecha_inicio`, `fecha_fin`, `activo`,
`destacado`, `suscripcion_id`, `descripcion_larga`, `foto_url`, `vistas`,
`clicks`. **No existe `descripcion_en`** — si el contenido lo va a manejar
GHL, confirmar si el picklist/campo bilingüe se resuelve allá o si seguimos
necesitando la columna acá.

Checklist propuesto para Talal (mismo patrón que evento/tienda — no inventar
picklists):

- [ ] `deal_type` — texto (nuestro `tipo_deal`: "-30%", "2x1", "Free", etc. —
      no es un enum cerrado, texto libre sirve)
- [ ] `description_es` / `description_en` — texto largo, **bilingüe** (gap
      nuevo por los influencers ES/EN — confirmar si GHL maneja esto con 2
      campos o con localización nativa del objeto)
- [ ] `category` — picklist* (mismos valores que `tienda.categoria`, sin
      picklist confirmado, ver mismo problema documentado para evento)
- [ ] `start_date` / `end_date` — fecha
- [ ] `is_active` — yes/no (resultado de aprobar en GHL, igual que evento)
- [ ] `is_featured` — yes/no
- [ ] `photo_url` — texto
- [ ] Relación al Business (tienda) dueño del convenio — Association, mismo
      mecanismo que `link_agency_to_listing`
- [ ] Firma del webhook + payload de ejemplo (puede compartir con evento/tienda
      si Talal confirma un solo endpoint multi-entidad)

---

## 4. NUEVO — Referidor / Afiliado / Embajador (comisión por negocio referido)

**No está en el alcance de GHL en absoluto** — no aparece en `ghl_client.py`,
`ghl_webhook.py`, ni en los `customer_type` de la migración 0084
(`hotspot_business`, `rental_host`, `service_provider`). Hay que agregarlo al
contrato desde cero, no es un bloqueo existente.

Contexto de negocio (confirmado 2026-09-19): influencers ganan comisión por
cada negocio que refieren y que nos paga. Ya dividido por zona.

Schema real ya existe en nuestra DB (`public.referidor`, `public.referidos`,
consolidación de las antiguas `afiliados`/`embajadores`), **0 filas en las
dos**, sin ningún código que las conecte:

- `referidor`: `tipo` (afiliado/embajador), `codigo` único, **`barrio_id`
  (zona)**, `comision_pct`, `total_referidos`, `total_ganado_usd`, `activo`,
  `verificado`
- `referidos`: `referidor_id` → `tienda_id` + `suscripcion_id` +
  `comision_usd` + `estado` (pendiente/pagado/cancelado)

**Pregunta abierta antes de proponerle nada a Talal:** ¿dónde vive el
registro de esta comisión — GHL (coherente con que pagos ya se decidieron
mover allá) o nuestra DB? Si es GHL, el mapeo natural (mismo criterio que
Agent/Owner) sería:

- Referidor (persona) → **Contact**, custom fields: `contact_type` =
  "referidor", `referidor_codigo`, `referidor_tipo` (afiliado/embajador),
  `referidor_zona` (barrio_id o nombre), `comision_pct`
- Cada comisión generada (`referidos`) → **Opportunity** en un pipeline de
  comisiones, o custom field en la Association Referidor↔Business, valor =
  `comision_usd` + `estado`

Sin confirmar con Talal todavía — es propuesta, no contrato.

---

## 5. Precios (todo lo que existe hoy, fuente = DB / código, no marketing)

### Negocios locales — `public.planes_negocio`

| Plan | USD | COP | Frecuencia |
|---|---|---|---|
| Free | $0 | $0 | — |
| Hotspot / Special Offer (convenio) | $29 | $120,000 | por placement, sin compromiso |
| Featured Business | $99 | $410,000 | mensual |

⚠️ **Discrepancia encontrada:** `src/routes/afiliado.tsx` (página de ventas
del programa de Afiliados) usa `$820,000 COP/mes` como ejemplo de Featured
Business en toda su matemática de comisiones — no coincide con los
`$410,000 COP` reales de `planes_negocio`. Confirmar cuál es el precio
vigente antes de mandarle nada a Talal o de pagarle comisión a un afiliado
real.

### MLS (usuarios finales) — `api/config/planes.py`

| Plan | USD/mes | COP/mes |
|---|---|---|
| MLS Pro | $29 | $79,000 |
| MLS Agente | $59 | $199,000 |

### Zona patrocinada (realtors) — `api/services/zona_sponsor_service.py`

| Zona | COP/mes |
|---|---|
| Comuna | $1,000,000 |
| Barrio | $200,000 |

### Comisiones — `public.referidor` (default por `tipo`)

| Rol | comisión default en DB | Nota |
|---|---|---|
| Afiliado | 15% | coincide con `afiliado.tsx`: "15% único primer pago + 5% recurrente 24 meses, luego 2.5%" |
| Embajador | 10% | ⚠️ **no coincide** con `docs/03_Neighborhood_Ambassador_Landing.html` (spec de Easy Street, venture separada) que dice "50% primer mes + 15% recurrente + 5% override sobre afiliados reclutados" — confirmar si ese doc aplica al `embajador` de Medellín Social o es solo de Easy Street (US) antes de fijar el % real |

---

## 6. Resumen ejecutivo para la conversación con Talal

Orden sugerido si hay que priorizar (lo más barato de confirmar primero):

1. Cuenta (§1) — sin esto no se puede probar nada, ni siquiera lo que ya
   está implementado (`push_tienda_to_ghl` deployado pero inerte).
2. Firma del webhook — desbloquea *todo* lo inbound de una sola vez,
   **incluido login unificado (#14) que ya no necesita nada más de nuestro
   lado** — es la pieza más barata de todo este documento una vez exista
   la firma: un solo campo (email) y un handler de 10 líneas.
3. Deal/Convenio (§3) — es lo que se está discutiendo activamente ahora.
4. Referidor (§4) — scope nuevo, decidir dónde vive antes de proponer campos.
5. Resto (evento, tienda, agent/owner/agency, usuarios) — ya tienen propuesta
   escrita, solo falta que Talal confirme.
