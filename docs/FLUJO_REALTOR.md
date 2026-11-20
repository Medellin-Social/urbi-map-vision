# Flujo Realtor (modelo Zillow) — estado, pendientes y plan

Doc vivo. Consolida TODO el workstream "realtor estilo Zillow": captura de lead →
calificación → enrutamiento → toma por el realtor → trabajo del lead → cierre, +
la API GHL (entrada y salida) que se construye **de este lado primero**, antes de
cablear GoHighLevel.

Última revisión: 2026-11-16 (+§6 directorio 20 posiciones). Rama: `DEV`.
Ver también: [GHL_CONTRATO_PROPUESTO.md](GHL_CONTRATO_PROPUESTO.md) (contrato campo
a campo con Talal) · [GHL_TALAL_TEST_HANDOFF.md](GHL_TALAL_TEST_HANDOFF.md) (handoff
de prueba a Talal).

---

## 0. Los 6 pasos Zillow ↔ Medellín Social

| Paso Zillow | Estado MS | Dónde |
|---|---|---|
| 1. Captura del lead | ✅ | `POST /visitas`, favoritos, `/publicar`, `POST /listings/{id}/reclamar` |
| 2. Calificación + enrutamiento | ✅ calificar (migr 0101) + ✅ enrutar (asignador) | `visita_solicitud.{intencion,presupuesto,plazo,credito}`, `asignador_service` |
| 3. Respuesta del agente (velocidad) | ✅ medida + diente | `/realtor/desempeno` grado de servicio |
| 4. CRM / seguimiento | ✅ interno + 🟡 GHL | `/realtor/agenda`, `/realtor/visitas/{id}`; push GHL stub |
| 5. Reporte de estado/cierre | ✅ backend, 🟡 UI | `POST /realtor/listings/{id}/cerrar` + ledger `propiedad_evento` (migr 0100) |
| 6. Cierre y cobro | ❌ cobro | cobro va por GHL (no construido aquí) |

---

## 1. Flujo Realtor interno — PROBADO end-to-end 2026-11-11

Verificado contra API local (login real `realtor.test@example.com`, DB `social`:5433).

### 1a. Tomar un listing como propio
- `GET /realtor/pool` — leads sin dueño (intakes `en_pool`). **Probado: 9 en pool.**
- `POST /realtor/pool/{intake_id}/tomar` — UPDATE atómico condicional
  (`estado='en_pool' AND agent_id IS NULL`), gana la DB no un select-then-update.
  **Probado: 200 `{"resultado":"tomado","estado":"asignado","agent_id":...}`.**
- `GET /realtor/asignados` — lo que el realtor tomó/le asignaron.
- Timeout: `sweep_asignados_vencidos` devuelve al pool los `asignado` que nadie
  aceptó en `ASIGNADO_TIMEOUT_HORAS` (24h). Corre al leer pool/asignados (sin cron).

> **🐛 2 bugs encontrados testeando + arreglados 2026-11-11** (verificados DB A/B):
> 1. **`tomar_del_pool` no reseteaba `updated_at`** → como el sweep cuenta 24h desde
>    `updated_at`, cualquier lead que esperó >24h en el pool volvía al pool en el
>    primer sweep tras tomarlo (los leads más añejos = los que más urge tomar =
>    intomables). Fix: `tomar` setea `updated_at=NOW()` (reloj del timeout arranca al
>    tomar). Mismo fix en `asignar_intake` por consistencia.
> 2. **`_agent_del_usuario` no-determinista** con >1 fila `agent` por usuario →
>    `/pool/tomar` escribía en una fila y `/asignados` leía de otra → el lead tomado
>    "desaparecía". Fix: `ORDER BY (estado='activo') DESC, created_at ASC LIMIT 1`
>    (canónica = activa más vieja). Protege prod si un usuario llegara a tener 2 filas.

### 1b. Trabajar el lead (subir datos)
- `POST /intake/{id}/aceptar` → crea `listing` borrador + 8 ítems de due-diligence.
- `PATCH /realtor/listings/{id}` — editar ficha (título, precio, área, hab/baños…).
- `POST /realtor/listings/{id}/fotos` — subir fotos a R2 (1ª = portada).
- `POST /realtor/asignados/{id}/publicar` — borrador → `en_revision` (guardia
  server-side: ningún listing incompleto pasa, espejo de `datos_minimos_completos`).

### 1c. Cerrar (paso 5 Zillow — poblar el dato de transacción)
- `POST /realtor/listings/{id}/cerrar` — marca vendido + graba precio de cierre +
  llaves ORIP/catastro en el ledger `propiedad_evento` (append-only, sobrevive al
  listing). Precio autoreportado → `verificado=false` hasta cruzar con SNR.
- UI "Marcar vendido": botón en Mis listings (publicado/pausado) → modal
  (precio + matrícula obligatoria + fecha/catastral opc) → `cerrar`. ✅ construido.

### 1c-bis. INCENTIVOS del realtor — ✅ construido + testeado 2026-11-11

El loop: **reportar cierres → desbloquea comparables de cierre + sube tu puntaje →
tasas mejor → ganas más → más cierres.**

- **Palanca de reciprocidad (`GET /realtor/comparables`):** comparables de precio de
  CIERRE (el dato más valioso para tasar), **gated**: solo los ve quien reportó
  ≥`_COMPARABLES_MIN_CIERRES` cierres en 12m. Ese gate ES la razón para teclear el
  cierre. NO expone matrícula/dirección/agente/listing de otros (solo
  precio/fecha/zona/tipo/área/$m2) — verificado no-leak.
- **Standing (`/realtor/desempeno.standing`):** `puntaje` 0–100 (contribución 30% +
  velocidad 30% + show 20% + aceptación 20%, pesos en `_PUNTAJE_PESOS`) + `ranking`
  {posicion,total} cross-agente. **Degrada honesto:** sin actividad ≥
  `_RANKING_MIN_ACTIVIDAD` → puntaje/ranking `null` + "datos insuficientes" (no
  inventa un puesto sobre ceros).
- **Diente del grado SLA:** la velocidad de respuesta es 30% del puntaje → el espejo
  se vuelve palanca (vía standing/ranking). NO rewiring de la asignación: la
  velocidad sube el standing, no cambia (aún) el orden de reparto de nuevos leads.

**Parámetros = decisión de PRODUCTO** (en `realtor.py`, placeholder, tunéalos):
`_PUNTAJE_PESOS`, `_CONTRIB_CAP=5`, `_RANKING_MIN_ACTIVIDAD=3`, `_COMPARABLES_MIN_CIERRES=1`.

**Decisiones de negocio pendientes (flagueadas, no bloquean el mecanismo):**
- **Cold-start:** con pocos cierres en el sistema el gate guarda una sala casi vacía
  (comparables finos). El mecanismo crece con los reportes; al inicio el valor
  desbloqueado es bajo. ¿Umbral 1 está bien, o se arranca con gate abierto hasta
  tener N cierres?
- **Integridad del gate — mitigado 2026-11-11 (punto medio):** el cierre sigue
  autoreportado (`verificado=false`, unlock instantáneo = incentivo fuerte), PERO:
  1. **Anti-farm:** gate/contribución cuentan `DISTINCT matrícula` → spamear la misma
     matrícula N veces NO sube el unlock ni el puntaje (una propiedad se vende una vez).
  2. **Transparencia:** los comparables marcan `verificado` vs `sin verificar`, ordenan
     verificados primero y, si hay autoreportado + verificado de la misma matrícula,
     dedup se queda con el verificado → un cierre falso queda abajo, etiquetado "sin
     verificar", inútil para engañar y contaminando solo el bucket descartable (que el
     propio tramposo también ve).
  3. **Futuro (no construido — falta dato):** cruce SNR por matrícula flipearía
     `verificado=true` y permitiría descartar los no-verificados que no aparezcan.
     `compraventas_orips` es nivel municipio hoy → el cruce fino espera ese dato.
  Verificado en vivo: 3 filas / 2 matrículas → `cierres_reportados=2`, 2 comparables
  (dedup), verificados primero, dedup prioriza la verificada.

**Testeo:** `api/tests/test_realtor_incentivos.py` (10 tests: math de puntaje+pesos+cap,
degradación honesta del ranking, gate bloqueado/abierto, no-leak) +
- FLIP del gate en vivo contra API real (0 cierres→gated → `cerrar` → mismo agente ve
  comparables + no-leak) con cleanup (sin dejar cierres sintéticos).
- Standing SQL→math en vivo: seed 2 agentes (5 vs 3 cierres) → `/desempeno` devuelve
  puntaje=30 (= cálculo a mano) + ranking puesto 1 de 2; cleanup. (El pytest prueba la
  math con dicts; esto prueba que `_STANDING_COMPONENTS_SQL` la alimenta bien.)

**Observado vs calibrado (honestidad):** el MECANISMO está probado (gate en vivo, standing
SQL→math en vivo, degradación). Que los pesos/umbrales sean los CORRECTOS para el negocio
NO está validado — son placeholder.

### 1d. Tracking (todo se traquea)
- Vistas: `public.user_events` (`event_type='listing_view'`). **Probado: 7 vistas
  del agente, 837 totales.**
- `/realtor/desempeno`: tasa aceptación, mediana horas aceptar, vistas 30d/total,
  show-rate de visitas, ofertas/interesados, ROI por zona patrocinada, **grado de
  servicio** (velocidad de respuesta A/B/C/D — diente del SLA, paso 3).
- `/realtor/agenda`: visitas (leads) con calificación + favoritos.

### 1e. Reclamar inmueble scrapeado ("claim your home")
- `POST /listings/{listing_id}/reclamar` — un dueño/agente reclama un listing
  scrapeado (sin dueño). Se guarda en `listing_reclamo` + se enruta como lead al
  realtor de zona vía intake/asignador. Idempotente (`unique(listing_url,usuario_id)`).

---

## 2. Calificación del lead (paso 2 Zillow) — migr 0101

4 columnas opcionales en `visita_solicitud`, pedidas sin obligar en el modal
"Agendar visita" (obligar hundiría la conversión del paso 1):
- `intencion` (vivir | invertir)
- `presupuesto` (<200M | 200-500M | 500-1000M | >1000M)
- `plazo` (ya | 1-3m | 3-6m | explorando)
- `credito` (contado | aprobado | en_tramite | no)

El realtor las ve en `/realtor/agenda` (chip "✓ Calificado" + pills) y los leads
calificados ordenan arriba.

---

## 3. API para GHL — se construye de ESTE lado primero

**Principio (decisión del usuario):** construir TODA la superficie API aquí —
entrada y salida — ANTES de cablear GoHighLevel. Talal sólo mapea del lado GHL.

**Dos caminos técnicos:**

### 3a. Camino NO bloqueado — REST con shape nuestro + token (✅ construido / a extender)
Nosotros definimos request/response; Talal conecta un HTTP-request action / workflow
de GHL. No necesita la firma del webhook de Talal.

Todos (`api/routers/ghl_leads.py`): auth header `X-API-Key` vs env `GHL_LEADS_TOKEN`
(`hmac.compare_digest`, cerrado por defecto → 503 si no hay token). Rate-limit +
rotación de token por coma + IP allowlist opcional (`GHL_LEADS_ALLOWED_IPS`).

- **Salida (GHL trae nuestros datos por PULL):**
  - ✅ `GET /ghl/leads?since=&estado=&limit=` + `GET /ghl/leads/{id}` — lead calificado.
  - ✅ `GET /ghl/agents?since=&estado=&limit=` + `GET /ghl/agents/{id}` — realtor →
    Contact (first/last name, email, tel, estado, verificado, agent_internal_id).
  - ✅ `GET /ghl/cierres?since=&verificado=&limit=` — feed de transacciones (ledger
    `propiedad_evento`) para el cobro (paso 6): agent_id (a quién se cobra), precio,
    matrícula, `from_lead` (atribución), zona/tipo/$m2. **Interno de billing** (≠
    `/realtor/comparables` que oculta matrícula/agente a otros realtors). migr 0123+.
- **Entrada (GHL empuja a REST nuestro, shape nuestro) — NO usa la firma del webhook:**
  - ✅ `POST /ghl/leads` — **crea un lead NUEVO** ("cuando llega un lead" de ad/form/
    portal de GHL). Rutea al realtor de zona por `listing_url` (inmueble concreto) o por
    `zona_nivel`+`zona_codigo` (solo contacto+zona de interés) → aparece en su agenda.
    **Idempotente** por `external_id` (los workflows de GHL reintentan). migr 0123
    (`external_id` unique + `email` en `visita_solicitud`). Verificado DB: ruteo→agente,
    lead en agenda, dedup, unrouted→agent_id NULL, sin leak cross-agente (10/10).
  - ✅ `POST /ghl/visitas/{id}/estado` — estado/fecha/resultado de la visita →
    `visita_solicitud`. Verificado: 401 · 200+persist · 400.
  - ✅ `POST /ghl/agents/{id}/estado` — aprobar/rechazar/activar realtor →
    `public.agent`. Guard 409 si se activa sin usuario vinculado (no 500).
    Verificado: 401 · 200 round-trip · 400 · 404 · 409-guard.

  > **Gotcha (fix 2026-11-13):** `/realtor/agenda` y `PATCH /realtor/visitas/{id}` NO
  > filtraban por `agent_id` — re-derivaban la propiedad del lead desde `listing_url` →
  > staging → zona → sponsorship. Un lead zona-only (listing_url sintético
  > `zona:<nivel>:<codigo>`, sin fila en staging) quedaba invisible aunque tuviera
  > `agent_id`. Se agregó la rama `OR v.agent_id = $1` en ambas → el ruteo por agente
  > ahora surte efecto (es lo que hace visible el lead-in de GHL en el dashboard).

Todo verificado por `curl` contra API local, sin Talal.

### 3b. Camino bloqueado — webhook firmado (espera a Talal)
- `POST /api/v1/webhook/ghl` (`api/routers/ghl_webhook.py`) — receptor con dispatch
  por `object_type` (listing/tienda/evento/agent/visita/deal/referidor). Todos los
  handlers `_upsert_*_from_ghl` devuelven **501** a propósito hasta tener: firma del
  webhook + payload real por entidad. **NO se adivina el payload.**
- Salida vía API nativa de GHL: `ghl_client.py` — listing/tienda/agency ✅ live;
  evento/agent/visita stub (falta contrato).

---

## 4. Pendientes

### Código (lo construimos nosotros, sin esperar a nadie)
- [ ] UI "marcar vendido" en dashboard realtor (paso 5) + incentivo.
- [ ] Endpoints de ENTRADA token-authed (GHL→nosotros, shape nuestro) — §5.
- [ ] Extender PULL a más entidades si se necesita (agent, listing status).
- [ ] (hecho hoy) fixes tomar/sweep + agente determinista — falta commit+deploy.

### No-código (bloqueado en terceros — NO urge, se espera)
- [ ] `GHL_LEADS_TOKEN` seteado en el env de la API (prod). Sin él, PULL = 503.
      Lo generamos nosotros y se lo pasamos a Talal.
- [ ] Talal: webhook secret + firma + payload de ejemplo por entidad (desbloquea TODO
      lo de §3b entrante).
- [ ] Talal: `POST /contacts` payload (desbloquea sync de realtor/usuario).
- [ ] Talal: conectar workflow GHL → `GET /ghl/leads` (pull) o → REST de entrada.
- [ ] Cobro por GHL (paso 6) — nada cobra plata aún.

---

## 5. Plan — endpoints de API ahead-of-Talal (próximo)

Objetivo: dejar TODA la API de entrada y salida lista y testeable de este lado, con
shape nuestro + auth por token (mismo patrón que `/ghl/leads`), para que cuando Talal
esté listo sea sólo mapear en GHL.

La superficie realtor/lead de nuestro lado está COMPLETA (entrada + salida):
leads (in/out), visita estado (in), agents (in/out). Ver §3a.

**Lo que queda de nuestro lado (no bloqueado):**
- [x] UI "marcar vendido" (paso 5) + sistema de INCENTIVOS (comparables gated +
      standing/ranking) — ✅ 2026-11-11, ver §1c-bis.
- [x] `POST /ghl/leads` — lead-in nuevo (GHL → visita → agenda del realtor), ruteo
      por url/zona, idempotente. ✅ 2026-11-13 (migr 0123 + rama agenda agent_id).
- [x] `GET /ghl/cierres` — feed de transacciones para el cobro (paso 6). ✅ 2026-11-13.
- [ ] (si se necesitan) `GET /ghl/listings?since=` pull — hoy el push nativo
      `ghl_client.sync_listing` ya cubre salida de listings.
- [ ] **Intakes (owner/seller leads) in/out** — simétrico a `/ghl/leads` pero para
      captación de propietarios → `intake` + asignador → Inbox (pool/asignados).
      `POST /ghl/intakes` (crear) + `GET /ghl/intakes` (pull). Pendiente, no bloqueado.

**Bloqueado en terceros (luego):** webhook firmado `/webhook/ghl`, sync nativo a
GHL de evento/agent/visita (contrato Talal), `GHL_LEADS_TOKEN` en prod, cobro.

---

## 6. Directorio de Realtors por zona — 20 posiciones con rotación ponderada (DISEÑO)

Nuevo modelo de monetización del directorio público. **20 posiciones por zona**:
el primer realtor que se suscribe toma la posición 1 (precio más bajo), cada
siguiente toma la siguiente posición con precio mayor, hasta la 20. El orden en
que aparecen al público NO es la posición: es una **permutación aleatoria
ponderada, estable por sesión** — la pos 1 sale arriba más veces que la 2, etc.,
pero ninguna queda invisible.

> **Relación con `sponsorship` (exclusividad):** `sponsorship` es el modelo viejo
> de **UN** patrocinador exclusivo por zona (`zona_ocupada_por_otro`, $1k comuna /
> $200 barrio). El modelo de 20 slots lo **sustituye para el directorio público**.
> Son tablas separadas a propósito: meter una columna de posición en `sponsorship`
> rompería la exclusividad que su índice garantiza. **El enrutamiento de leads de
> `/realtor/agenda` y `/embudo` sigue cableado a `sponsorship`** (ver §3a gotcha) —
> migrar ese ruteo al modelo de 20 slots es una decisión aparte, no la toca este
> diseño.

Reusa lo ya construido: identidad `agent`/`agency`, el patrón del webhook de pago
`procesar_pago_zona` (`zona_sponsor_service.py` — asignación tras pago APROBADO,
nunca desde el redirect de éxito), el stream `public.user_events` para tracking, y
la página pública `/agentes`.

### 6.1 Modelo de datos (PostgreSQL)

Dos tablas: **config editable** (precios y pesos, fuera del código) + **slots**
(las suscripciones). `community_id` = la zona; reusa la convención polimórfica de
`sponsorship`: `community_id` ≡ `zona_codigo` (barrio_id::text | cd_comuna |
municipio) y `zona_nivel` desambigua.

```sql
-- Config: precios y pesos POR POSICIÓN, zona-agnóstico, editable (NO en código).
-- Precio ASCIENDE con la posición (pos1 = más barata). Peso DESCIENDE (pos1 = más
-- visible). peso > 0 obligatorio: así ninguna posición queda invisible.
CREATE TABLE realtor_slot_config (
    posicion       SMALLINT PRIMARY KEY CHECK (posicion BETWEEN 1 AND 20),
    precio_mensual NUMERIC  NOT NULL CHECK (precio_mensual >= 0),  -- placeholder, editable
    peso           NUMERIC  NOT NULL CHECK (peso > 0)
);
-- Seed: 20 filas. Precios PLACEHOLDER (aún no definidos por negocio); peso
-- decreciente. Ambos se editan luego por UPDATE (o panel admin), sin deploy.
INSERT INTO realtor_slot_config (posicion, precio_mensual, peso)
SELECT g, 0, (21 - g)::numeric FROM generate_series(1, 20) g;

-- Slots: una suscripción = un agente ocupando una posición en una zona.
CREATE TABLE realtor_slot (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id      TEXT     NOT NULL,                 -- = zona_codigo
    zona_nivel        TEXT     NOT NULL DEFAULT 'barrio',-- barrio|comuna|municipio
    posicion          SMALLINT NOT NULL REFERENCES realtor_slot_config(posicion),
    agent_id          UUID     NOT NULL REFERENCES agent(id) ON DELETE RESTRICT,
    estado            TEXT     NOT NULL DEFAULT 'activa', -- activa|pausada|cancelada
    fecha_suscripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Una posición ocupada por un solo agente a la vez (guard de concurrencia del pago):
CREATE UNIQUE INDEX uq_realtor_slot_pos
    ON realtor_slot (community_id, zona_nivel, posicion) WHERE estado = 'activa';
-- Un agente ocupa a lo sumo una posición activa por zona:
CREATE UNIQUE INDEX uq_realtor_slot_agent
    ON realtor_slot (community_id, zona_nivel, agent_id) WHERE estado = 'activa';
CREATE INDEX idx_realtor_slot_community
    ON realtor_slot (community_id, zona_nivel, estado);
```

Vive en **migración alembic** (schema + seed de las 20 filas de config de una vez
— carril "schema + backfill", ver CLAUDE.md). Los precios/pesos reales son UPDATEs
de datos posteriores, no código.

**Cancelación / vacante:** `estado='cancelada'` libera la posición *en su mismo
número y precio* — NO se corren las posiciones 6–20 hacia arriba. Así el par
posición↔precio es estable; el siguiente comprador rellena el hueco más bajo
(que ahora es esa posición).

### 6.2 Ordenamiento (FastAPI) — `api/services/realtor_slot_order.py` ✅ construido+probado

Permutación ponderada estable por sesión (Efraimidis–Spirakis), con self-check
(`python api/services/realtor_slot_order.py`):

```python
rng = random.Random(session_id)          # string directo (NO hash(): salado por proceso)
key = rng.random() ** (1.0 / peso[posicion])   # por slot
# sorted(slots, key=key, reverse=True)
```

- **Semilla = `session_id`** (el mismo que ya fluye a `user_events` — se reusa, no
  se inventa otra). Mismo session_id → mismo orden toda la sesión; no cambia al
  recargar. Entre sesiones rota.
- **`random.Random(session_id)` con el string crudo**, NO `hash(session_id)`: el
  hash de str en CPython está salado por `PYTHONHASHSEED` y divergiría entre workers.
- Los slots se consultan `ORDER BY posicion` (orden determinista de entrada →
  extracciones del RNG reproducibles). Pesos desde `realtor_slot_config`.
- Server-side: el dashboard y el tracking ven exactamente el orden mostrado.
- Self-check verifica: estabilidad (misma sesión = mismo orden), rotación, pos1
  arriba ~Npeso× más que pos20, y pos20 igual aparece (nunca invisible).

**Endpoint público:** `GET /agentes?community_id=&nivel=&session_id=` → slots
activos de la zona, ya ordenados por rotación, con datos públicos del `agent`
(nombre, foto, bio, zonas, rating) + su `posicion` (para el tracking).

**Asignar la siguiente posición (tras pago APROBADO):** transacción + índice único
parcial como guard de carrera. Punto único, mismo patrón que `procesar_pago_zona`:

```sql
-- posición libre más baja de la zona (= lo que cuesta "el siguiente"):
SELECT c.posicion, c.precio_mensual FROM realtor_slot_config c
WHERE NOT EXISTS (
  SELECT 1 FROM realtor_slot s
  WHERE s.community_id=$1 AND s.zona_nivel=$2 AND s.posicion=c.posicion AND s.estado='activa')
ORDER BY c.posicion LIMIT 1;   -- NULL → zona llena (20/20)
-- INSERT dentro de transacción; si otro pago ganó la carrera, el UNIQUE parcial
-- revienta → reintentar (recalcular la libre más baja). GHL = solo pago+notif.
```

### 6.3 Dónde se consume la rotación: el popup del listing

**La rotación de §6.2 surte en el POPUP de los listings** (`src/components/
listing-popup/ListingPopup.tsx`), NO en el directorio `/agentes`.

- Al abrir el popup de un listing, se muestra el/los realtor(s) que patrocinan la
  **zona del listing** en orden de rotación ponderada estable por sesión.
- `community_id` = `listing.barrio_id` (ya disponible en el popup), `zona_nivel =
  'barrio'`. Los slots activos de esa zona salen de `realtor_slot`, ordenados por
  `ordenar_por_rotacion(session_id)` → el popup muestra el tope (o los primeros N).
- Mismo `session_id` toda la sesión → el realtor mostrado en el popup es estable,
  no cambia al reabrir; entre sesiones rota (pos1 más seguido, pos20 nunca invisible).

**La página `/agentes` (`src/routes/agentes.tsx`) muestra TODA la info y NO rota** —
directorio completo, orden estable (verificado/rating), sin permutación.

Decisión de alcance del usuario (2026-11-16): este workstream construye SOLO el
modelo de datos (§6.1) y la lógica de ordenamiento (§6.2). El consumo en el popup,
el directorio `/agentes` y el dashboard (§6.4) NO se tocan acá.

### 6.4 Realtor Dashboard — `GET /realtor/mi-posicion`

Extiende el dashboard (`api/routers/realtor.py`). Por cada zona donde el agente
tiene slot activo:

| Campo | Fuente |
|---|---|
| `posicion` | `realtor_slot.posicion` |
| `precio_mensual` | `realtor_slot_config.precio_mensual` de su posición |
| `slots_ocupados` / `slots_totales` (20) | count activos de la zona |
| `puestos_libres` | 20 − ocupados |
| `costo_siguiente` | precio de la posición libre más baja (query §6.2) |
| `impresiones_30d` | `user_events` `event_type='realtor_impression'`, `metadata->>'agent_id'` = él, 30d |
| `contactos_30d` | `user_events` `event_type='realtor_contact'`, idem |

### 6.5 Tracking para calibrar pesos (lo importante)

Todo va a `public.user_events` (un solo stream, ya particionado — migr 0120; ya
soporta `event_type='impression'`). Se graba **la posición del slot** (1–20), que
es la perilla a calibrar, en `metadata`:

```
impresión → event_type='realtor_impression', entity_type='realtor_slot',
            entity_id=<agent_id>, metadata={community_id, zona_nivel, posicion}
contacto  → event_type='realtor_contact',    (mismos campos)
```

Rollup para calibrar (impresión→contacto por posición, agregando TODAS las zonas):

```sql
SELECT (metadata->>'posicion')::int AS posicion,
       count(*) FILTER (WHERE event_type='realtor_impression') AS impresiones,
       count(*) FILTER (WHERE event_type='realtor_contact')    AS contactos,
       round(count(*) FILTER (WHERE event_type='realtor_contact')::numeric
             / NULLIF(count(*) FILTER (WHERE event_type='realtor_impression'),0), 4) AS ctr
FROM public.user_events
WHERE event_type IN ('realtor_impression','realtor_contact')
  AND created_at > now() - interval '90 days'
GROUP BY 1 ORDER BY 1;
```

Con esa curva CTR-por-posición se re-tunean los `peso` de `realtor_slot_config`
(UPDATE, sin deploy). **Railway es la fuente de verdad**; GHL solo pago + notif.

### 6.6 Estado

- [x] **Migración alembic** `0125_realtor_slots.py`: `realtor_slot_config` +
      `realtor_slot` + seed 20 filas (precio placeholder, peso 20..1).
- [x] **Lógica de ordenamiento** `api/services/realtor_slot_order.py` (§6.2),
      con self-check (`python api/services/realtor_slot_order.py`).
- [ ] (fuera de alcance de este workstream) consumo en el popup del listing
      (`ListingPopup.tsx`, `community_id = listing.barrio_id`), el asignador
      `asignar_siguiente_posicion()` + webhook de pago, tracking de impresión/
      contacto, y `GET /realtor/mi-posicion` (§6.4 — no se toca).
