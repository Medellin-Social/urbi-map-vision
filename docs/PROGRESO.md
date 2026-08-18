# Progreso — Medellín Social

*Snapshot 2026-08-16. Fuente: memoria de sesiones + auditoría del repo en esta fecha. Cosas marcadas "local" no están necesariamente en producción — ver [Railway Deploy] en cada sección.*

Ver [MISION_VISION.md](./MISION_VISION.md) para el marco de negocio detrás de estas prioridades.

---

## 1. Funcionando end-to-end (prod o verificado local, listo para usar)

| Área | Estado | Notas |
|---|---|---|
| Mapa + listings + comunas | ✅ prod estable (desde 2026-07-28) | fast-path "toda la ciudad" 1.47s→0.16s |
| Popup1/Popup2 (ficha listing) | ✅ | rediseño estilo Zillow, bilingüe es/en |
| Publicar propiedad (`/publicar`) | ✅ | OTP teléfono, moderación previa, 4 pasos |
| Agendar visita | ✅ | slots reales por disponibilidad del agente |
| Realtor dashboard | ✅ | inbox, agenda, desempeño/ROI, zonas, horario |
| Panel admin (`/panel-x9k2`) | ✅ | usuarios, realtors, asignar zonas |
| Agencia (equipo) | ✅ **recién commiteado, NO pusheado** | invitar agentes por email, inbox delegable — ver sección 4 |
| i18n es/en | ✅ | diccionario + MutationObserver, no `t()` por string |
| Comunidad (eventos/negocios) | ✅ | scrapers + rutas por barrio |
| Suscripciones (infra) | ⚠️ código listo, **sin activar** | faltan llaves Stripe/Wompi reales |

## 2. Construido pero NO conectado

Piezas con trabajo real hecho que no llegan al usuario todavía — candidatas naturales para "conectar" o delegar.

- **Airbnb/VRBO/renta media → mapa principal**: `raw.listings_renta_media` y `raw.listings_premium` (VRBO) NO están unidos a la query de `/listings` que alimenta el mapa. El filtro "Corto/Medio/Largo" en el panel ya existe en la UI pero es *dead code* (no hay campo `modalidad` en el backend). Requiere: unir esas tablas a la query con `fuente` propio + exponer el filtro real.
- **Fotos en R2**: pipeline de espejo/resize completo y probado (`scripts/mirror_listings_media.py`), pero **`AWS_URL` público sin setear** (hoy cae a una URL S3 incorrecta) y **backfill (~79k portadas) sin correr**.
- **Colegios/caminabilidad**: cálculo hecho y servido en el popup, pero el loader (`load_pois_overpass.py`) y compute solo corrieron **local** — falta correr en prod/Airflow.
- **Congestión de tráfico (HERE)**: pipeline completo (sampler + compute), pero **nunca se corrió la campaña de 2 semanas** ni se puso `HERE_API_KEY` en prod. Sin datos, no hay nada que mostrar.
- **Compra self-serve de zona (realtor)**: backend 100% listo (`/api/v1/zonas/*`), falta la UI en el dashboard del realtor para que compre sin pasar por el admin.
- **Scoring de barrios en prod**: `barrios_score_consolidado`/`barrios_liquidez` vacíos en producción → el mapa no muestra colores de inversión (gris). El pipeline que los genera es externo, corre local.
- **Punto-en-polígono Metrocuadrado**: ✅ resuelto en local (2026-08-16) — cobertura subió de 37,410 a 77,157/89,014 (87%). **Pero prod no tiene los datos para backfillear**: `raw.listings_metrocuadrado` en prod es un stub vacío (4 columnas, 0 filas, creado por la migración 0063 solo para evitar un 500) — le falta el dataset scrapeado completo (80k+ filas con lat/lon/barrio_id/geom) antes de que este backfill tenga sentido ahí. Es un gap de sincronización de datos, no de código.
- **Traducción de descripciones**: el 97% de las descripciones de listings no se traducen al inglés (son texto libre scrapeado, el diccionario no cubre párrafos). Decisión de negocio pendiente: MT en el cliente (gratis, más lento) vs. traducir al ingerir (paga, requiere DeepL/OpenAI).
- **Wompi/Stripe reales**: clients y webhooks listos, checkout de zona y de suscripción funcionan en modo simulado — falta activar con llaves reales.
- **GHL (GoHighLevel) — pagos**: `src/config/ghl.ts` ya tiene los 3 links de checkout (listing destacado, agente barrio, agente comuna) cableados en `/planes` y en el dashboard realtor — están **vacíos**, solo falta pegar las URLs reales cuando existan en GHL.
- **GHL — sync de dashboard/agenda del realtor (2026-08-16, sin construir aún)**: decisión del usuario — GHL NO reemplaza nuestro `/realtor/dashboard`/`/realtor/agenda` (siguen siendo la fuente de verdad), pero hay que **empujar** datos hacia GHL para que el realtor los vea también ahí (herramienta que ya usa a diario). Alcance acordado: sincronizar **visitas agendadas** (`visita_solicitud`) y **leads/intake asignados** — ambos igual de urgentes. Sin API key/sub-account de GHL todavía → no se puede construir el cliente real. Ver tarea en la tabla de abajo.

## 3. Para delegar

Tareas que **no requieren mi criterio de producto** — alguien con acceso a Railway/DB puede ejecutarlas siguiendo la nota, o son trabajo mecánico de un dev sin contexto de negocio.

| Tarea | Qué necesita | Bloqueante para |
|---|---|---|
| Setear env vars en Railway (`AWS_URL` R2, `HERE_API_KEY`, `SMTP_*` en prod, llaves Stripe/Wompi) | Acceso al dashboard de Railway | R2, tráfico, emails de agencia en prod, pagos reales |
| Backfill fotos R2 (`python scripts/mirror_listings_media.py --all`) | Creds R2 en prod, ~1 tarde de cómputo | Que el mapa sirva fotos livianas |
| Sincronizar dataset Metrocuadrado completo a prod (hoy 0 filas) | `pg_dump`/`pg_restore` de `raw.listings_metrocuadrado` local→prod (ver [Railway Deploy], `docker exec pg_dump` PG15), luego re-correr el backfill de `barrio_id` (ya hecho en local, mismo patrón replicable) | Que Metrocuadrado aparezca en el mapa de prod |
| Correr campaña de tráfico HERE (2 semanas, DAGs ya escritos, solo activarlos) | Airflow prod + `HERE_API_KEY` | Feature de congestión |
| Correr loader de colegios/POIs en prod | Mismo comando que corrió local | Caminabilidad/colegios en prod |
| UI "comprar zona" en dashboard realtor | Frontend puro, backend ya expone todo en `/zonas/*` | Que un realtor no dependa del admin para expandirse |
| Push del commit de agencia + pruebas manuales del flujo de invitación con email real | Nada técnico, solo revisar y aprobar | Que el equipo pueda invitarse entre sí |
| Conseguir API key + location/sub-account ID de GHL | Cuenta GHL activa, generar credencial API (v2) | Arrancar el cliente GHL (pagos reales + sync visitas/leads) |
| Pegar las 3 URLs de checkout GHL en `src/config/ghl.ts` cuando existan | Los links ya creados del lado de GHL | Que "Listing Destacado" y "Agente de Zona" cobren de verdad |
| Construir cliente GHL (push visitas + leads asignados, patrón `wompi_client.py`: no-op hasta tener key) | La API key de arriba | Que el realtor vea sus leads/agenda también en GHL |

## 4. Riesgos / deuda técnica a tener presente

- **Schema drift local↔prod**: ya causó 2 incidentes de 500 en prod (tablas/columnas creadas a mano localmente, nunca migradas). No hay proceso de sync fuera de alembic — cualquier `ALTER TABLE` manual es invisible hasta que algo lo golpea.
- **Roadmap MLS técnico** (fases 2/3 — viewport perf, deduplicación de tier, nuevas tablas de reseñas/suscripción propietario) tiene ~48 días sin revisión — verificar contra el código actual antes de asumir que sigue vigente.
- `apartamentos_valle_aburra.pdf` suelto en la raíz del repo, sin commitear — confirmar si es dato de trabajo o descartable.

---
*Este documento es un snapshot, no vive actualizado solo — al cerrar o avanzar un ítem, actualízalo o pide que se actualice.*
