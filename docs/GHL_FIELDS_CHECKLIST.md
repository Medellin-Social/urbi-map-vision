# GHL — Fields to Create Checklist

*Generated 2026-08-28. Companion to `docs/GHL_REALTOR_AGENCY_CONTRATO_PROPUESTO.md`
(full contract, rationale, Postman examples, in Spanish). This file is just the
field checklist, in English, for whoever sets these up directly in the GHL
dashboard.*

Fields marked `picklist*` need real option values from Talal before creating —
don't invent the choices, create as free text or wait.

---

## Custom Object: "Event" (new object, all fields new)

- [ ] `event_title` — text
- [ ] `event_description` — long text
- [ ] `category` — picklist* (our `categoria` enum, 9 values)
- [ ] `audience_type` — picklist* (our `tipo_audiencia` enum)
- [ ] `municipality` — text
- [ ] `neighborhood` — text
- [ ] `start_date` — date+time
- [ ] `end_date` — date+time
- [ ] `price` — number
- [ ] `currency` — text
- [ ] `is_free` — yes/no
- [ ] `external_url` — text
- [ ] `photo_url` — text
- [ ] `organizer` — text
- [ ] `max_attendees` — number
- [ ] `is_active` — yes/no (this is the approve/reject result — GHL sets it, we read it)
- [ ] `is_featured` — yes/no
- [ ] `featured_scope` — picklist: neighborhood / district / city
- [ ] `featured_zone_code` — text

## Contact (native object) — 7 new custom fields, for Agent + Owner

- [ ] `contact_type` — picklist: agent / owner
- [ ] `agent_internal_id` — text
- [ ] `agent_status` — picklist* (our `agent_estado` enum)
- [ ] `agent_status_reason` — text
- [ ] `profile_photo_url` — text
- [ ] `owner_internal_id` — text
- [ ] `phone_verified` — yes/no

## Business (native object) — already exist, confirmed working in prod

No action needed — already live via `push_tienda_to_ghl`:
`business_subcategory`, `barrio`, `whatsapp`, `instagram`, `google_place_id`,
`price_range`, `verified`, `featured`, `featured_badge`, `featured_since`,
`operating_hours`, `google_rating`, `active`.

## Business (native object) — new fields to create

For local businesses (tienda):
- [ ] `featured_scope` — picklist: neighborhood / district / city
- [ ] `featured_zone_code` — text
- [ ] `business_status` — picklist* (today `active` is boolean only — need a
      3-state value to represent pending/approved/rejected if GHL starts
      sending that)

For agency:
- [ ] `agency_nit` — text
- [ ] `agency_type` — picklist* (our `agency_tipo` enum)
- [ ] `agency_verified` — yes/no
- [ ] `agency_plan` — text
- [ ] `agency_internal_id` — text

**Note:** `featured_scope` / `featured_zone_code` show up on both Event and
Business — same underlying concept (`destacado_nivel` / `destacado_zona_codigo`
in our DB), but GHL doesn't share custom fields across object types, so create
them separately on each object.

## Not a field — separate setup

- [ ] **Association type** Contact ↔ Business, for agent ↔ agency membership
      (the listing ↔ agency association already exists — this one is new)

---

## Account-level prerequisites (blocks everything above)

Verified 2026-08-28: **0 of 3 GHL env vars are set in production.**

- [ ] `GHL_PRIVATE_TOKEN` — Private Integration (or OAuth) token, scoped to
      read+write on Contacts, Businesses, Custom Objects, Associations,
      Workflows
- [ ] `GHL_LOCATION_ID` — the specific sub-account ID
- [ ] `GHL_WEBHOOK_SECRET` — needs GHL's webhook signing scheme (header name +
      algorithm) from Talal first; this is the #1 blocker for building any
      inbound handler safely
- [ ] At least one **Workflow** per entity (trigger: record created/updated →
      action: webhook to our API) — none exist yet
- [ ] Add the three env vars to `railway.env.example` once real values exist
      (today it doesn't mention GHL at all)
