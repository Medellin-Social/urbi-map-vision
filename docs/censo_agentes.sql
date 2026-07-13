-- ============================================================================
-- censo_agentes.sql — CENSO READ-ONLY para migración agentes (viejo) -> agent (0045)
-- ============================================================================
-- Qué hace: cuenta agregados (COUNT/GROUP BY) sobre las tablas `agentes`,
--   `agent`, `listings_propios` y `suscripciones_usuario` para dimensionar la
--   migración ANTES de diseñarla. Mide volumen, dinero vivo y solapamiento.
--
-- 100% READ-ONLY: solo SELECT. Ningún UPDATE/INSERT/DELETE/CREATE/ALTER.
--   Solo vuelca agregados — NO extrae filas con PII.
--
-- Cómo correr (tú, contra prod):
--   psql "$DATABASE_URL_PROD" -f docs/censo_agentes.sql
--
-- Nota de valores de estado: las etiquetas exactas (p.ej. 'activa' vs 'active')
--   se desconocen en prod, por eso cada bloque delicado imprime un GROUP BY con
--   las etiquetas reales ADEMÁS del conteo titular (que usa ILIKE 'activ%').
-- ============================================================================

\echo '===== AGENTES (tabla vieja) ====='

\echo '-- 1. Total de registros en agentes'
SELECT COUNT(*) AS total_agentes FROM agentes;

\echo '-- 2. agentes con usuario_id NOT NULL (enlazable) vs NULL'
SELECT (usuario_id IS NOT NULL) AS enlazable, COUNT(*) AS n
FROM agentes GROUP BY 1 ORDER BY 1;

\echo '-- 3. Distribución de agentes por estado'
SELECT COALESCE(estado, '(null)') AS estado, COUNT(*) AS n
FROM agentes GROUP BY 1 ORDER BY n DESC;

\echo '-- 4a. Agentes distintos con >=1 listing-propio'
SELECT COUNT(DISTINCT agente_id) AS agentes_con_listing
FROM listings_propios WHERE agente_id IS NOT NULL;

\echo '-- 4b. Total de listings_propios'
SELECT COUNT(*) AS total_listings_propios FROM listings_propios;


\echo '===== DINERO — suscripciones_usuario (keyed por usuario_id) ====='

\echo '-- 5a. Total de suscripciones_usuario'
SELECT COUNT(*) AS total_suscripciones FROM suscripciones_usuario;

\echo '-- 5b. suscripciones_usuario por estado (etiquetas reales)'
SELECT COALESCE(estado, '(null)') AS estado, COUNT(*) AS n
FROM suscripciones_usuario GROUP BY 1 ORDER BY n DESC;

\echo '-- 5c. Suscripciones ACTIVAS (estado ILIKE activ%)'
SELECT COUNT(*) AS suscripciones_activas
FROM suscripciones_usuario WHERE estado ILIKE 'activ%';

\echo '-- 5d. Suscripciones de PAGO (precio > 0)'
SELECT COUNT(*) AS suscripciones_de_pago
FROM suscripciones_usuario WHERE COALESCE(precio, 0) > 0;

\echo '-- 5e. Suscripciones ACTIVAS y de PAGO (dinero vivo total)'
SELECT COUNT(*) AS activas_de_pago
FROM suscripciones_usuario
WHERE estado ILIKE 'activ%' AND COALESCE(precio, 0) > 0;

\echo '-- 6. CRÍTICO — agentes viejos que PAGAN: usuario_id de agentes con'
\echo '--    suscripción ACTIVA y de PAGO (JOIN por usuario_id). Decide si la'
\echo '--    migración toca dinero vivo.'
SELECT COUNT(DISTINCT a.usuario_id) AS agentes_que_pagan
FROM agentes a
JOIN suscripciones_usuario s ON s.usuario_id = a.usuario_id
WHERE a.usuario_id IS NOT NULL
  AND s.estado ILIKE 'activ%'
  AND COALESCE(s.precio, 0) > 0;

\echo '-- 6b. Desglose de esos pagos por plan (agentes que pagan, por plan)'
SELECT COALESCE(s.plan, '(null)') AS plan, COUNT(DISTINCT a.usuario_id) AS n
FROM agentes a
JOIN suscripciones_usuario s ON s.usuario_id = a.usuario_id
WHERE a.usuario_id IS NOT NULL
  AND s.estado ILIKE 'activ%'
  AND COALESCE(s.precio, 0) > 0
GROUP BY 1 ORDER BY n DESC;


\echo '===== AGENT (tabla nueva, 0045) ====='

\echo '-- 7a. Total de registros en agent'
SELECT COUNT(*) AS total_agent FROM agent;

\echo '-- 7b. Distribución de agent por estado'
SELECT COALESCE(estado::text, '(null)') AS estado, COUNT(*) AS n
FROM agent GROUP BY 1 ORDER BY n DESC;


\echo '===== SOLAPAMIENTO agentes vs agent (por usuario_id) ====='

\echo '-- 8. usuario_id presentes en AMBAS tablas'
SELECT COUNT(*) AS en_ambas FROM (
  SELECT usuario_id FROM agentes WHERE usuario_id IS NOT NULL
  INTERSECT
  SELECT usuario_id FROM agent   WHERE usuario_id IS NOT NULL
) x;

\echo '-- 9a. usuario_id SOLO en agentes (viejo)'
SELECT COUNT(*) AS solo_viejo FROM (
  SELECT usuario_id FROM agentes WHERE usuario_id IS NOT NULL
  EXCEPT
  SELECT usuario_id FROM agent   WHERE usuario_id IS NOT NULL
) x;

\echo '-- 9b. usuario_id SOLO en agent (nuevo)'
SELECT COUNT(*) AS solo_nuevo FROM (
  SELECT usuario_id FROM agent   WHERE usuario_id IS NOT NULL
  EXCEPT
  SELECT usuario_id FROM agentes WHERE usuario_id IS NOT NULL
) x;

\echo '-- 10. agentes con usuario_id NULL (no enlazables automáticamente)'
SELECT COUNT(*) AS agentes_usuario_null
FROM agentes WHERE usuario_id IS NULL;

\echo '===== FIN CENSO ====='
