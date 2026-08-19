# Infraestructura — variables para decidir a futuro

*Escrito 2026-08-18. Esto NO es un plan de migración — es el análisis de variables que pediste para poder decidir más adelante si Railway sigue siendo la mejor opción. Nada de esto se ejecuta solo; cada sección termina en una decisión pendiente o un trigger.*

## 1. Qué corre dónde hoy (inventario real, no supuesto)

| Pieza | Dónde | Tipo de carga | Notas |
|---|---|---|---|
| `WEB` (TanStack Start) | Railway, Dockerfile | Stateless, HTTP | Escala horizontal sin fricción en cualquier PaaS |
| `Social-api` (FastAPI) | Railway, Dockerfile.api | Stateless, HTTP | Igual — portable a cualquier lado |
| `urbi-cron` | Railway, Dockerfile.cron | **Contenedor 24/7 con Chromium horneado**, corre `refresh_data.py` (fincaraiz+remates) diario 3am UTC + `run_comunidad.py` cada 6h | No autoscala — pagas capacidad reservada para 2 bursts/día. Riesgo de OOM si Playwright pide más RAM de la asignada (ya pasó en el otro pipeline, ver abajo) |
| Airflow (`scrape_listings` DAG: metrocuadrado, dedup, validate_urls, mirror R2, HERE tráfico) | **Local, WSL2, tu máquina** — `/home/edwlearn/urbi/docker-compose.yml` | Pesada, programada | **No está en la nube.** Esto es lo primero que cambiaría el cálculo si algún día lo mueves a un proveedor |
| `urbidata-postgis` | Railway — **imagen Docker propia `postgis/postgis`**, no el "Postgres managed" de Railway | Con estado, 1.5GB (`raw`=1.5GB de eso: listings crudos + catastro) | Portable tal cual a cualquier plataforma que corra contenedores Docker con volumen persistente |
| Fotos de listings | Cloudflare R2 (objeto) | — | Ya está bien ubicado, no es cuestión de "migrar", es terminar el backfill pendiente |
| GHL | SaaS externo, no controlamos su infraestructura | — | Somos inquilinos de su API — su escalabilidad no es nuestra, solo importa el rate limit que consumimos (ver §4) |

**Corrección a memoria anterior:** yo tenía documentado que "todo el scraping es local" — falso, parcialmente. `urbi-cron` en Railway ya corre Playwright en la nube para fincaraiz/remates/comunidad. El pipeline pesado (metrocuadrado + R2 + tráfico) sigue local en Airflow.

## 2. Las variables que de verdad determinan si Railway sigue siendo la opción correcta

No son "features" en general — son los ejes donde este proyecto específico puede doler:

1. **Soporte de PostGIS como extensión gestionada.** Hoy no lo necesitas (imagen propia), pero si algún día quieres dejar de administrar backups/upgrades de Postgres a mano, importa qué proveedores lo dan de fábrica.
2. **Modelo de cron/worker con carga pesada (Chromium).** ¿La plataforma autoscala un job programado, o pagas un contenedor fijo 24/7 como hoy?
3. **Verdadero scale-to-zero en el API** (pagar por request real, no por contenedor prendido) — solo importa si el tráfico se vuelve muy variable/bursty.
4. **Portabilidad Docker** (vendor lock-in). Toda tu stack ya es Dockerfiles — eso es una ventaja: casi cualquier plataforma sirve sin reescribir nada.
5. **Costo por GB de storage en la DB** — `raw` ya pesa 1.5GB y crece con cada scrape nuevo. A qué ritmo crece determina cuándo el precio por GB empieza a importar.
6. **Egress/transferencia** — si el tráfico del mapa crece, cuánto cobra cada proveedor por sacar datos.
7. **Observabilidad** — ver §5, hoy no tenemos cómo medir ninguna de estas variables con datos reales.

## 3. Matriz de plataformas contra esas variables

*(No es un ranking — es "qué tan bien resuelve cada eje", agosto 2026)*

| Plataforma | PostGIS gestionado | Cron/worker con Chromium | Scale-to-zero API | Portabilidad Docker | Notas de precio |
|---|---|---|---|---|---|
| **Railway (actual)** | No (imagen propia) | Contenedor fijo, sin autoscale | No — contenedor siempre prendido | Total (ya la usas) | Usage-based, spend limit disponible; timeout HTTP público 15 min (no te afecta hoy) |
| **Render** | Sí, como extensión en su Postgres managed | Sí — worker/cron son tipos de servicio nativos, cron cobra por minuto | No en compute estándar | Total (Dockerfile) | Web+DB+worker ronda $21-52/mes; HTTP hasta 100 min (mejor para jobs largos) |
| **Fly.io** | Postgres no-gestionado (tú administras) o su nuevo Managed Postgres | Machines pueden ser always-on o on-demand | **Sí** — Machines escalan a 0 con cold-start de segundos | Total (Machines = contenedores) | Presencia multi-región real si algún día importa latencia fuera de Colombia |
| **Google Cloud Run + Cloud SQL** | Sí, Cloud SQL Postgres soporta PostGIS | Cloud Run Jobs + Cloud Scheduler — job serverless real, paga solo mientras corre | **Sí, nativo** — es el punto fuerte de Cloud Run | Total (Docker) | Modelo más "paga por segundo real" que existe de los 4; más piezas que configurar (IAM, VPC connector) |
| **Supabase/Neon** (como reemplazo *solo* de la DB, no del compute) | Sí, PostGIS de fábrica | N/A — no es donde correrías el cron | N/A | — | Opción híbrida: DB gestionada ahí + compute en Railway/Render — desacopla el eje más doloroso (administrar Postgres) sin migrar todo lo demás |

## 4. GHL — diseño bidireccional (decidiste que sí, esto es lo que implica)

Confirmaste: no solo empujar (visitas/leads → GHL), también **leer** bloqueos que el realtor haga directo en GHL, para que `GET /listings/{id}/slots` no ofrezca un horario que el realtor ya tapó allá.

Piezas que faltan construir (nada existe todavía, `GHL_API_KEY` tampoco):

1. **Cliente saliente** (`api/utils/ghl_client.py`, patrón `wompi_client.py`): push de visita nueva → `POST /calendars/events/appointments`; push de intake asignado → contacto/oportunidad.
2. **Webhook entrante** (`api/routers/ghl_webhook.py` nuevo): GHL notifica `AppointmentCreate`/`AppointmentUpdate`/bloqueos de calendario → endpoint público con verificación de firma → refleja el bloqueo en algo que `GET /slots` consulte.
3. **Dónde vive el reflejo del bloqueo** — dos caminos:
   - (a) tabla espejo `ghl_calendar_block` (agent_id, inicio, fin) que el webhook llena y el generador de slots resta — rápido, sin llamar a GHL en cada carga de página.
   - (b) consultar `Get Calendar Events`/`Get Blocked Slots` de GHL en vivo cada vez que se generan slots — más simple de construir, pero mete latencia de red externa a un endpoint público que hoy es 100% local, y te acerca al rate limit (100/10s) si el mapa tiene tráfico.
   - **Recomendado: (a)** — es el patrón que ya usas en todo el repo (staging materializado, cache.py) en vez de fan-out a servicios externos en el hot path.
4. Migración nueva para la tabla espejo + índice por `agent_id`+rango de fecha.

Esto es diseño, no está construido — bloqueado por la misma falta de API key de siempre.

## 5. El gap que cruza todo esto: no hay métricas

No hay APM, no hay logs agregados de tráfico, no sabes cuánto cobra Railway hoy en la práctica ni cuántos requests/día recibe el API. **Sin esto, cualquier comparación de "elasticidad" entre plataformas es teórica.** Antes de que la decisión de migrar sea data-driven en vez de especulativa, lo mínimo:
- Contador de requests/latencia por endpoint (aunque sea logging estructurado a stdout + un dashboard simple).
- Revisar el dashboard de billing de Railway una vez al mes y anotar el número real.
- Tamaño de `raw` schema mes a mes (ya sabes correr el query de §DB del doc de progreso).

## 6. Recomendación — triggers, no fecha de migración

**No hay nada que migrar hoy.** Railway resuelve la carga actual sin dolor conocido. Razones concretas para revisar esta decisión más adelante:

| Trigger | Qué cambiaría la respuesta |
|---|---|
| Administrar backups/upgrades de tu Postgres propio empieza a consumir tiempo real | Considerar Supabase/Neon solo para la DB (manteniendo compute donde esté) |
| Mueves el pipeline de Airflow (metrocuadrado+R2+tráfico) de tu laptop a la nube | Ahí sí Railway (contenedor fijo) empieza a competir en serio contra Cloud Run Jobs o Fly Machines (job serverless real) |
| Tráfico del mapa se vuelve alto y variable (picos) | Cloud Run gana por scale-to-zero real; hoy es prematuro |
| `raw` schema sigue creciendo a este ritmo por 6-12 meses más | Revisar costo por GB — hoy 1.5GB es irrelevante en cualquier plataforma |
| Necesitas presencia fuera de Colombia/LatAm | Fly.io por multi-región nativa |

---
*Este doc es un mapa de decisión, no una decisión tomada. Actualízalo cuando alguno de los triggers de §6 se dispare, o cuando haya datos reales de §5.*
