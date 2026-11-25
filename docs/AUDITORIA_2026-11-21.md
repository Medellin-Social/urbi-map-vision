# Auditoría del proyecto — 2026-11-21

Cinco revisiones (frontend, infra/proceso, seguridad, backend, producto). Solo lectura; los hallazgos con archivo:línea se re-verifican antes de arreglar. Sin críticos de seguridad explotables; sin SQLi.

## P0 — arreglar antes de cobrar en prod
1. **Webhook Stripe pierde pagos** (`api/routers/suscripciones.py:247-300`): registra el evento antes de procesarlo; si la activación falla, el reintento se toma como duplicado. → insert + proceso en una transacción.
2. **Zona patrocinada sin lock/idempotencia** (`zona_sponsor_service.py:76-117`, `zonas.py`): dos agencias pueden tener la misma zona; webhook repetido extiende dos veces. → advisory lock + unique parcial + `pago_ref`.
3. **Slots sin idempotencia** (`realtor_preferido_service.py:189`): sin `pago_ref` o con `"simulado"` se salta el ledger; sin unique parcial por posición. → exigir `pago_ref` real.
4. **Webhook GHL**: solo secreto estático (sin HMAC/timestamp) y `url_externo/foto_url/website` sin `require_safe_url` (XSS almacenado). → HMAC + validar URLs.
5. **Cobro de slots de punta a punta**: hoy "paga" = admin asigna a mano. Falta workflow GHL pago→webhook, precios reales, tarea humana en 409/404.
6. **Un solo modelo de ingresos publicado**: /vender dice 3 %, MISION_VISION dice sin comisión, planes.py trae USD 29/59/149, slots en COP. Definir uno.
7. **Legal/fiscal antes de cobrar**: T&C de slots, reembolsos/disputas, factura DIAN/IVA, habeas data/RNBD, contrato con GHL, scraping de terceros.

## P1 — rendimiento y robustez
1. `md5(url)::bit(32)::int = $1` sin índice en ~10 endpoints calientes → columna `map_id` + índice en el swap de `cache.py`.
2. `get_all_listings` usa 4 conexiones por request (pool max 10) → serializar/cachear COUNT.
3. `/viewport` y `/barrios` sin cache de servidor; geometría completa en cada request.
4. `refresh_listings_cache` en cada worker sin advisory lock y bloquea el arranque.
5. Asignador/rotación sin transacción ni check de rowcount (puede reportar "asignado" sin asignar).
6. GHL/email inline en el request (hasta 15 s); `smtplib.SMTP` sin timeout; `AsyncClient` nuevo por llamada.
7. ~110 `except Exception` que tragan errores.

## P1 — seguridad media
- `/refresh` sin tope absoluto de sesión; tokens de verify/reset/magic-link en claro (guardar sha256).
- `REQUIRE_EMAIL_VERIFICATION=false` por defecto; fijar `TRUSTED_PROXY_COUNT` en Railway.
- Throttles en memoria por worker (login/email) → Postgres/Redis.
- `/aplicar` (afiliados/embajadores/pasantías) sin límites/EmailStr/dedup/CAPTCHA; `/track` anónimo envenena métricas B2B.
- `visitas` POST: validar `listing_url` contra DB; `sin_agente` del cliente dispara emails.
- Sin revisar a fondo: realtor.py, usuario.py, business.py, comunidad*, auth.py (lógica), tracking.py.

## P1 — proceso DEV→PROD (regla de CLAUDE.md)
- Scripts que escriben tablas servidas pero no están en cron/alembic/dbt: `load_catastro_medellin`, `load_icfes_municipio`, `load_internet_speed`, `load_ruido_siata`, `load_traffic_here`, `trafico_*`, `seed_obras_publicas`, `fetch_airbnb_*` (misma divergencia que `barrios_pois`).
- Sin CI en PR/push; pytest excluye tests `require_db` (15 archivos) y `tests/` raíz.
- `alembic upgrade head` en cada deploy sin gate.
- crontab sin `flock`; TRUNCATE sin staging en `load_pois.py` y `load_catastro_medellin_vigente.py`.
- Dockerfile.cron pesado (Chromium, torch), corre como root; `railway.toml` sin healthcheck; `airflow/` obsoleto.
- Dos tablas de agente: `agentes` (legacy) vs `agent` → unificar por migración.

## P2 — frontend
- 3 tests i18n fallando (publicar, realtor/dashboard, ListingDrawer).
- `listing.$id.tsx` sin meta/canonical por listing; sitemap con solo 21 rutas estáticas; barrios sin SSR.
- Componentes gigantes: realtor/dashboard 2791, ListingDrawer 2331, FloatingPanel 2208, MapFilterBar 2182, publicar 2161, MapView 1673.
- Bundle: mapbox-gl 1.78 MB, index 671 KB, recharts 272 KB, i18n-phrases 184 KB.
- JWT en localStorage; ~43 `fetch()` directos; 18 catch vacíos; ~60 `any`; 20 `<img>` sin alt; sin virtualización de listas.

## P2 — producto (ideas, con esfuerzo)
1. Aviso al realtor por WhatsApp/email con recordatorio 12 h y reasignación 24 h (3-4 días).
2. Panel admin de negocio: MRR, ocupación de slots, vencimientos, churn, visitas sin respuesta, fallos GHL con reintento (4-5 días).
3. Reporte mensual automático al realtor (impresiones, clics, visitas) para bajar churn (2-3 días).
4. Cerrar visita→cierre: estados contactado/agendada/realizada/no_show.
5. Prueba de valor para negocios locales; retirar o implementar "comisión automática" de embajadores/afiliados.

Detalle completo por área: ver reportes originales de cada agente (producto: `audit_producto.md`).
