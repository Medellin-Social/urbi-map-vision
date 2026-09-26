# GHL — proposed contract (consolidated, all entities)

*Generated 2026-09-24. English copy of `GHL_CONTRATO_PROPUESTO.md` (Spanish
is the source of truth — if the two ever drift, Spanish wins; update this
copy alongside any future edit to the Spanish version). Replaces and merges
`GHL_PENDIENTES_TALAL.md`, `GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md`,
`GHL_REFERIDOR_CONTRATO_PROPUESTO.md` and `GHL_FIELDS_CHECKLIST.md` — these
used to be spread across 4 files, now it's one. Every point in this document
was re-verified against the actual code and migrations at merge time, this
is not a copy-paste of the old files — where something had changed or was
wrong, it got corrected (see "✅ verified" / "🔧 corrected" notes in each
section).*

**Proposal, not a confirmed contract on any point** — no picklist or field
name is invented without Talal confirming it (same rule as `_map_choice()`
in `api/utils/ghl_client.py`: better to skip a field than send an invented
one that silently corrupts something on the GHL side).

---

## 0. Account prerequisites — blocks everything else

- [ ] **Medellín Social email** to connect the GHL account (sub-account /
      Private Integration login) — undefined. Candidates in use today:
      `noreply@medellinsocial.com` (transactional),
      `rentalinquiries@medellinsocial.com` (rental leads) — neither is
      necessarily the right one to administer the GHL account.
- [ ] `GHL_PRIVATE_TOKEN` / `GHL_LOCATION_ID` — 🔧 **actual status differs
      from what the old docs said:** last verified in prod (Railway
      `Social-api`) on 2026-08-28, absent. **This session (2026-09-24) found
      they ARE configured in local `.env`** — prod was not re-verified.
      Confirm whether prod already has them too, or whether they only exist
      locally and need to be promoted.
- [ ] `GHL_WEBHOOK_SECRET` — blocker #1 for **all** inbound traffic (all 7
      entities in this document share this same block):
      `verificar_webhook()` in `ghl_client.py` is a stub that can't validate
      anything without GHL's real signature (header + algorithm).
- [ ] At least one **Workflow** per entity in GHL (trigger: record
      created/updated → action: webhook to our API) — none exist yet on the
      GHL side.
- [ ] Add the 3 env vars to `railway.env.example` once real prod values
      exist (today it doesn't mention GHL at all).

✅ **Verified 2026-09-24:** `ghl_object_mapping` (migration 0082) already
accepts `agent`/`owner`/`agency` as a valid `object_type` (migration 0083,
in addition to `listing`/`tienda`/`evento`/`deal`) — the dedup/sync-tracking
infrastructure is already ready for those 3 entities as soon as the real
push gets implemented. **Still need to add `referidor`** to that same CHECK
constraint once §6 gets implemented (not needed today because referidor's
code never actually reaches that write — the stub fails before it).

---

## 1. Events → Custom Object "Event"

✅ Verified: `_upsert_evento_from_ghl` (stub) and the dispatcher in
`api/routers/ghl_webhook.py` exist, `push_evento_to_ghl` (stub) in
`ghl_client.py` too — nothing implemented, just the skeleton.

Real table: `public.eventos`. Direction: **bidirectional** — GHL is the
source (creates/edits/approves/rejects), pushes to our API via webhook.

| Proposed GHL field | Our column | Type | Note |
|---|---|---|---|
| `event_title` | titulo | text | |
| `event_description` | descripcion | long text | |
| `category` | categoria | picklist* | our 9 values — real picklist unconfirmed |
| `audience_type` | tipo_audiencia | picklist* | social/professional/active — unconfirmed |
| `municipality` | barrio_id → municipio | text | via join, GHL has no FK to our barrios table |
| `neighborhood` | barrio_id → nombre | text | |
| `start_date` / `end_date` | fecha_inicio / fecha_fin | date+time | |
| `price` / `currency` | precio / moneda | number / text | |
| `is_free` | gratuito | yes/no | |
| `external_url` | url_externo | text | |
| `photo_url` | foto_url | text | |
| `organizer` | organizador | text | |
| `max_attendees` | max_asistentes | number | |
| `is_active` | activo | yes/no | result of approve/reject — GHL changes it, we mirror it |
| `is_featured` | destacado | yes/no | |
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | ✅ column verified, migration 0079 |
| `featured_zone_code` | destacado_zona_codigo | text | |

**GHL Workflow:** trigger "Event record created/updated" → Webhook →
`POST /api/v1/webhook/ghl` with `object_type: "evento"` + `properties`. One
single webhook covers both creation (pending) and status change.

---

## 2. Local businesses (tienda) → Business

✅ Verified: **outbound is already built and running in prod** —
`push_tienda_to_ghl()` sends 6 standard Business fields
(`_tienda_campos_to_standard`) + 13 custom fields
(`_tienda_campos_to_custom`, confirmed by reading the code: subcategory,
barrio, whatsapp, instagram, google_place_id, price range, verified,
featured, featured_badge, featured_since, operating_hours, google_rating,
active). Inbound (GHL → us) is missing.

🔧 **Real gap re-confirmed this session:** `_tienda_campos_to_custom` still
doesn't send `destacado_nivel`/`destacado_zona_codigo` (migration 0079,
used in `admin.py` `editar_tienda`/`DestacadoPatch` — ✅ verified it exists
and is in use). Before adding them to the push, confirm whether they
already exist as a custom field on the GHL Business object.

| Proposed GHL field (new) | Our column | Type | Note |
|---|---|---|---|
| `featured_scope` | destacado_nivel | picklist: barrio/comuna/ciudad | same field proposed for events — reuse if GHL allows sharing it between Business and Custom Object |
| `featured_zone_code` | destacado_zona_codigo | text | |
| `business_status` | activo | picklist: pending/active/rejected* | today `activo` is boolean — reflecting approved/rejected from GHL needs a 3-value state |

**Inbound (GHL → us):** `_upsert_tienda_from_ghl` in `ghl_webhook.py`
already exists as a stub, ready to receive once the contract exists.

---

## 3. Deal (special offer) and Hotspot → two distinct products, no mapping proposed yet

🔧 **Corrected this session:** the old doc (`GHL_PENDIENTES_TALAL.md` §3)
treated "Deal/Hotspot/Convenio" as one entity — the user already corrected
this in the code on 2026-09-23 (see `project_deals_vs_hotspot`): they're
two separate tables and two separate product concepts. Don't send Talal the
merged version.

✅ Verified: `push_deal_to_ghl()` and `_upsert_deal_from_ghl()` are both
stubs — not even outbound exists. **Hotspot has NO GHL code at all, not
even a stub function name** — it's the newest entity in this entire
document (migration `0094_hotspots.py`, 2026-09-23).

### 3a. Deal (special offer) — `public.deals`

Bidirectional, same status as listing. Context: businesses that give a
benefit to whoever shows up in person at the location, promoted through
bilingual (ES/EN) influencers.

Real columns: `tienda_id`, `tipo_deal`, `descripcion`, `categoria`,
`barrio_id`, `ciudad_id`, `fecha_inicio`, `fecha_fin`, `activo`,
`destacado`, `suscripcion_id`, `descripcion_larga`, `foto_url`, `vistas`,
`clicks`. **`descripcion_en` does not exist** — if GHL handles the bilingual
content, confirm whether it's solved with 2 fields or the object's native
localization.

Proposed checklist (same pattern as event/tienda):

- [ ] `deal_type` — free text (our `tipo_deal`, not a closed enum)
- [ ] `description_es` / `description_en` — long text, bilingual
- [ ] `category` — picklist* (same values as `tienda.categoria`)
- [ ] `start_date` / `end_date` — date
- [ ] `is_active` / `is_featured` — yes/no
- [ ] `photo_url` — text
- [ ] Relationship to the Business that owns the deal — Association, same
      mechanism as `link_agency_to_listing`

### 3b. Hotspot — `public.hotspots` (✅ verified, migration 0094)

Different from Deal: a place curated/featured for its experience (best
rooftop, best salsa spot, best cocktails) — an editorial "best of" by vibe,
not a one-off discount. Always tied to a paying business (`tienda_id NOT
NULL`, `suscripcion_id NOT NULL` — every hotspot is paid, no editorial
exception, same $29 plan in `planes_negocio` that covers Deal).

Real columns (`api/routers/business.py`, `_HOTSPOTS_QUERY`): `tienda_id`,
`categoria_experiencia` (free text: rooftop, best_salsa,
best_cocktails...), `descripcion`, `foto_url`, `barrio_id`, `ciudad_id`,
`fecha_fin`, `activo`, `destacado`, `suscripcion_id`, `created_at`.

Proposed checklist (never proposed to Talal before, new in this doc):

- [ ] `experience_category` — free text (our `categoria_experiencia`, not a
      closed enum — don't invent a picklist)
- [ ] `description` — long text
- [ ] `end_date` — date (no `start_date`, unlike Deal)
- [ ] `is_active` / `is_featured` — yes/no
- [ ] `photo_url` — text
- [ ] Relationship to the Business that owns the hotspot — same mechanism
      as Deal

---

## 4. Agent / Owner / Agency → Contact / Business

✅ Verified: `find_or_create_contact()` is still a stub — there is no
working Contact push anywhere in the code today, this is the first attempt
at defining that contract.

**Why native objects, not Custom Objects:** `agent`/`owner` are people →
**Contact**. `agency` is a company → **Business** (same object tienda
already uses). The agent↔agency relationship goes through the **Association
API** (same pattern as `_create_relation`/`_ASSOC_LISTING_AGENCY`).

### 4a. Agent → Contact (`public.agent`)

| Proposed GHL field | Our column | Note |
|---|---|---|
| `firstName`/`lastName` | nombre (split) | GHL requires a split name, split on the first space |
| `email` / `phone` | email / telefono | |
| `contact_type` (custom) | — | fixed picklist `"agent"` |
| `agent_internal_id` (custom) | id | our uuid |
| `agent_status` (custom) | estado | picklist* pending/active/rejected/inactive — unconfirmed |
| `agent_status_reason` (custom) | motivo_estado | |
| `profile_photo_url` (custom) | foto_url | |

### 4b. Owner → Contact (`public.owner`)

| Proposed GHL field | Our column | Note |
|---|---|---|
| `firstName`/`lastName`, `email`, `phone` | nombre/email/telefono | |
| `contact_type` (custom) | — | `"owner"` |
| `owner_internal_id` (custom) | id | |
| `phone_verified` (custom) | telefono_verificado | |

**Deliberately NOT included:** `otp_codigo`/`otp_expira` — internal
verification mechanism, no value on the GHL side, security risk to expose
it for no reason.

### 4c. Agency → Business (`public.agency`)

| Proposed GHL field | Our column | Note |
|---|---|---|
| `name` | nombre | standard field |
| `agency_nit` (custom) | nit | can be null |
| `agency_type` (custom) | tipo | picklist* independent/realty/developer |
| `agency_verified` (custom) | verificada | yes/no |
| `agency_plan` (custom) | plan | text |
| `agency_internal_id` (custom) | id | |

### 4d. Agent ↔ Agency: role + invite

`agency_member` (active role) → Association Contact(agent)↔Business(agency),
same mechanism as listing↔agency. `rol` as a custom field on the
Association if GHL allows it, or on the Contact if not.

`agency_invite` (pending/accepted/rejected/expired) is an internal
link-based invite mechanism — doesn't need its own object in GHL, just
needs to reflect the result (when accepted, the Association above gets
created).

---

## 5. Users (web signup) / Marketing leads

Today `usuarios` (direct signup) and the leads that come in through
landing/ad funnels are **two pools with no bridge**, in either direction.
`usuarios.ghl_contact_id` (✅ verified, migration 0077) and
`usuarios.customer_type` + `ghl_account_mapping` (✅ verified, migration
0084) are columns already reserved for this, with no code using them yet.

- **Website → GHL (create Contact):** the existing handoff only validates
  GET/PUT on a Contact that already exists — zero `POST /contacts` tested.
  Same circular block as Agent/Owner above.
- **GHL → our DB (pulling ad leads):** does the contract include a
  List/Search Contacts endpoint filterable by tag/funnel, or only
  GET-by-ID? If it's only GET-by-ID, there's no way to *discover* new leads
  without the webhook signature (§0) or that listing endpoint.
- **Unified login (magic link):** ✅ **verified 2026-09-24, built and in
  production on our side** — `POST /auth/magic-link` +
  `/auth/magic-link/verificar` (`api/routers/auth.py`), auto-registers if
  the email doesn't exist yet. This gives a concrete destination to the
  point above: if a Contact is created in GHL, with just their email we can
  already give them access without going through `/register`. Missing:
  can the "Contact Created" Workflow fire the webhook with the email in
  the payload? `object_type: "contact"` doesn't exist yet in `_HANDLERS` —
  added as soon as Talal confirms the payload, not heavy work.

---

## 6. Referidor (Affiliate / Ambassador) — commission for referred business

🔧 **Fully revised this session (2026-09-24) — the previous proposal
(generic Contact + Opportunity) does NOT match what Talal's own blueprint
(`docs/Medellin-Social-GHL-Architecture.pdf`) already specifies.** Reading
the full PDF surfaced the actual mechanism Talal proposes:

> *"Affiliate commission → MASTER: GHL **Affiliate Manager** → Referral
> custom object. Financial attribution must have one authority."*
> *"Affiliate Manager is the single source of truth for attribution and
> payout. Nothing else may calculate commission."*

In other words: **it's not Contact + custom fields + Opportunity** (what
had been proposed before reading the PDF) — it's GHL's native
**Affiliate Manager** feature (attribution, commissions, referral links)
generating a **Referral custom object** per conversion, with these fields
per the blueprint:

- Referred person
- Date
- Package purchased
- Status
- Sale value
- Commission

The PDF itself flags this as *"Proposed — validate Affiliate Manager API
access and whether conversion events can trigger cross-sub-account object
creation"* — even Talal doesn't consider this confirmed against the real
API yet.

**Additional data point from the blueprint, not confirmed by anyone on our
side:** `usuarios.customer_type` (migration 0084) already includes
`neighbourhood_ambassador` and `community_affiliate` as values — the
blueprint places them in a third tier ("GROWTH", neither free nor paying)
alongside "Affiliate Manager Referral objects." And the blueprint itself
prioritizes Referral as one of the **first 3 objects to build** ("start
with Business, Property Listing and Referral") — higher priority than
assumed, given it has no code today.

### Our side — already built (2026-09-24)

- `POST /api/v1/afiliados/aplicar` and `POST /api/v1/embajadores/aplicar` —
  public form in production, inserts into `public.aplicacion_referidor`.
- Every application automatically attempts a push to GHL
  (`ghl_client.sync_referidor`, best-effort). Fails on purpose today:
  `push_referidor_to_ghl` is a stub waiting on this contract.
- `object_type: "referidor"` already registered in `_HANDLERS`
  (`api/routers/ghl_webhook.py`), handler also a stub.
- Legacy tables `public.referidor`/`public.referidos` (0 rows) **will not
  be used** — leftovers from a consolidation prior to the decision that
  this lives in GHL, not a destination.

### Pending from Talal, specific to this entity

- [ ] Is Affiliate Manager already enabled on the location? What API does
      it expose (affiliate creation, referral link generation, reading
      calculated commission)?
- [ ] Real fields of the Referral custom object (the 6 above are what the
      blueprint names, exact API field names unconfirmed)
- [ ] Does the affiliate/ambassador get their own sub-account (as the
      blueprint states: "Referral custom object created in the affiliate's
      own sub-account"), or are they a Contact in the central account? This
      changes the entire provisioning flow.
- [ ] Does GHL generate `referidor_codigo` (our identifier) as part of the
      referral link, or do we generate it?
- [ ] Webhook signature — same blocker as everything else (§0).

---

## 7. Pricing — ⚠️ none of this is ground truth yet

🔧 **Corrected 2026-09-24:** the previous doc presented these numbers as
"source = DB/code, not marketing" — that was false. `$410,000 COP` for
Featured Business is the seed value from migration `0012_modelo_negocio.py`
(June), just as provisional as the `$820,000` that `afiliado.tsx` used
before being corrected. Commission percentages
(`referidor.comision_pct` default 15% affiliate / 10% ambassador) aren't
confirmed as a current figure either — they're table defaults, not a closed
business decision.

**Don't send Talal any price or percentage as if it were final.** If
Affiliate Manager needs to be configured with a real commission rule,
confirm the current figure with the team first — don't copy these numbers.

---

## 8. Field checklist to create in GHL (summary for whoever configures the dashboard)

*Fields marked `picklist*` need the real option values from Talal before
creating them — don't invent the values, create as free text or wait.*

**Custom Object "Event" (new):** `event_title`, `event_description`,
`category` (picklist*), `audience_type` (picklist*), `municipality`,
`neighborhood`, `start_date`, `end_date`, `price`, `currency`, `is_free`,
`external_url`, `photo_url`, `organizer`, `max_attendees`, `is_active`,
`is_featured`, `featured_scope` (picklist: neighborhood/district/city),
`featured_zone_code`.

**Contact (native) — 7 new fields, Agent + Owner:** `contact_type`
(picklist: agent/owner), `agent_internal_id`, `agent_status` (picklist*),
`agent_status_reason`, `profile_photo_url`, `owner_internal_id`,
`phone_verified`.

**Business (native) — already exist, confirmed working in prod:**
`business_subcategory`, `barrio`, `whatsapp`, `instagram`,
`google_place_id`, `price_range`, `verified`, `featured`,
`featured_badge`, `featured_since`, `operating_hours`, `google_rating`,
`active`.

**Business (native) — new, tienda:** `featured_scope`,
`featured_zone_code`, `business_status` (picklist*).

**Business (native) — new, agency:** `agency_nit`, `agency_type`
(picklist*), `agency_verified`, `agency_plan`, `agency_internal_id`.

**Business (native) — new, deal:** `deal_type`, `description_es`,
`description_en`, `category` (picklist*), `start_date`, `end_date`,
`is_active`, `is_featured`, `photo_url`.

**Business (native) or new Custom Object — hotspot (no prior proposal,
newest entity in the document):** `experience_category`, `description`,
`end_date`, `is_active`, `is_featured`, `photo_url`.

**Affiliate Manager / Referral (referidor) — pending Talal confirming
whether it's already enabled, see §6:** referred_person, date,
package_purchased, status, sale_value, commission — tentative names,
unconfirmed against Affiliate Manager's real API.

**Not a field — separate setup:** Association Contact↔Business for
agent↔agency (the listing↔agency one already exists).

---

## 9. Pending from Talal — numbered master list

**Account (blocks everything):**
1. GHL account email — undefined (§0).
2. Confirm the real status of `GHL_PRIVATE_TOKEN`/`GHL_LOCATION_ID` in
   prod — last verified 2026-08-28 (absent); local has had them since this
   session, prod not re-verified.
3. Webhook signature (header + algorithm) — unblocks *all* inbound traffic
   in one shot: events, tienda, deal, agent/owner/agency, referidor, and
   unified login (§5), which needs nothing else from our side.

**Events:**
4. Real example payload of an Event record.
5. Real picklist for `category` and `audience_type`.
6. Does a single endpoint receive all 7 entities (Hotspot added, split from
   Deal) with `object_type` in the body, or is there one URL per type?

**Local businesses (tienda):**
7. Do `featured_scope`/`featured_zone_code` already exist as a custom
   field on Business, or do they need to be created?
8. How to reflect approved/rejected if `activo` is a boolean?

**Agent / Owner / Agency:**
9. Do you confirm native Contact/Business, or insist on dedicated Custom
   Objects?
10. Real picklist for `agent_status` and `agency_type`.
11. Do Associations support their own custom fields (for `rol`)?

**Users / Leads:**
12. Website → GHL: confirm `POST /contacts` (create, not just GET/PUT).
13. GHL → us: filterable List/Search Contacts, or only GET-by-ID?
14. Unified login: can the "Contact Created" Workflow send the email in
    the payload? (the only missing piece, we already built the rest).

**Deal (special offer):**
15. `deal_type`, bilingual (`description_es`/`en`), `category` picklist.

**Hotspot (🔧 new in this doc — never proposed to Talal before, don't
confuse with Deal, two distinct products since 2026-09-23):**
16. Native Business (like tienda/deal) or dedicated Custom Object?
17. Webhook signature (shares blocker #1 from §0, not a new point).

**Referidor (affiliate/ambassador):**
18. Is Affiliate Manager already enabled? What API does it expose?
19. Real fields of the Referral custom object.
20. Own sub-account for the affiliate, or a central Contact?
21. Does GHL generate `referidor_codigo`, or do we?

---

## Executive summary — suggested order if prioritization is needed

1. **Account (§0)** — nothing can be tested without this, not even what's
   already implemented (`push_tienda_to_ghl` deployed but inert without a
   signature).
2. **Webhook signature** — the cheapest piece in the entire document once
   it exists: unblocks 7 entities at once, including unified login which
   needs nothing else.
3. **Referral / Affiliate Manager (§6)** — 🔧 re-prioritized this session:
   Talal's own blueprint puts it in the top-3 objects to build, not at the
   end like the old order suggested.
4. **Deal / special offer (§3a)** — what's being actively discussed.
5. **Hotspot (§3b)** — new product (2026-09-23), zero prior proposal to
   Talal, added for the first time in this document.
6. **Rest (event, tienda, agent/owner/agency, users)** — already have a
   written proposal, just needs Talal to confirm.
