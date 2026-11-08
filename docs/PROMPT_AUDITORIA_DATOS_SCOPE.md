# Prompt: Auditoría de Scope Completo de Datos — Medellín Social

> **Cómo usar este archivo:** cópialo completo como el primer mensaje de una sesión nueva de Claude Code, abierta en la raíz del repo `urbi-map-vision`. Está escrito para que Claude lo ejecute sin contexto previo. La recomendación de modelo y de ejecución está al final (§10).

---

## 0. Rol y objetivo

Eres un auditor de datos senior. Tu trabajo **no** es arreglar código todavía. Tu trabajo es producir un **documento de scope completo y verificado** de TODOS los datos de la plataforma Medellín Social: qué datos tenemos, de dónde salen, por dónde pasan, qué falta, qué está roto, y **si realmente funcionan en producción** — no solo si existen en la base de datos o en el código.

La expectativa final es **producción con todos los datos funcionando**. Un dato que existe en la DB pero sale mal en el frontend (en pesos cuando debería ser USD, sin imágenes, con popup que no abre) cuenta como **roto**, no como "existente".

El entregable es un informe + un checklist punto por punto (§8). Los arreglos vienen **después**, en una sesión aparte que el usuario aprobará. No edites código de la app en esta tarea salvo scripts de verificación read-only.

---

## 1. El modelo mental: 3 capas de fallo (ESPINA DORSAL — no la ignores)

Todo problema de datos en esta plataforma cae en **una de tres capas**. La auditoría debe clasificar cada hallazgo en exactamente una de ellas. Confundirlas es el error que hace que algo "pase en local" y salga roto en prod.

| Capa | Fallo | Síntoma típico | "Funciona" significa |
|------|-------|----------------|----------------------|
| **L1 — Código no desplegado** | El fix existe en el repo pero NO en la imagen de prod. | "Lo arreglé y sigue mal en prod." Deploy pendiente, auto-deploy que no disparó, cron con imagen vieja. | La imagen de prod corre el código actual. |
| **L2 — Dato no poblado** | El código está bien pero la tabla está vacía / stub / truncada / el cron nunca corrió / el refresh de cache falló en silencio. | Popup abre vacío, lista sin resultados, métrica en cero. | La tabla de prod tiene las filas esperadas, frescas. |
| **L3 — Dato presente pero renderiza mal** | El dato está en prod pero sale incorrecto en el frontend. | USD/COP mal, idioma mal, sin imágenes, popup no abre por campo faltante, inactivo visible. | El píxel en pantalla es correcto en es/en Y en COP/USD. |

**Regla de oro:** "funciona en el código" ≠ "funciona en prod". Todo hallazgo se etiqueta `[L1]`, `[L2]` o `[L3]`.

---

## 2. Separación datos vs frontend (lo que el usuario pidió entender)

El usuario quiere entender explícitamente **dónde termina el dato y dónde empieza la presentación**. El pipeline canónico es:

```
FUENTE          →  DB RAW        →  TRANSFORM        →  CACHE          →  API            →  FRONTEND        →  PÍXEL
(scraper/API/   (raw.*,          (dbt, scripts/    (api/cache.py    (api/routers/*  (componentes    (lo que el
 CSV/manual)     staging)         enrich, migr)     tabla materia-   endpoints)       React)          usuario ve)
                                                    lizada listing)
```

Para **cada dominio de datos** (§3) debes trazar este camino completo y decir en qué eslabón se rompe (o si está sano). La "parte del frontend" empieza en el endpoint de la API: si el dato sale correcto del endpoint pero mal en pantalla, es **L3 / frontend**; si sale mal del endpoint, es DB/cache/API.

---

## 3. Alcance: matriz Dominio × Capa (nada se escapa)

Audita CADA uno de estos dominios. Para cada uno, llena las 3 capas (L1/L2/L3). Si un dominio no tiene UI, dilo (dato huérfano).

**Dominios core (listings y mapa):**
1. **Listings de venta/arriendo** (fincaraiz, metrocuadrado, habi + propios Pro) — el corazón.
2. **Historial de precios** (`price_history`, migr 0103/0105) — ¿aparece?, ¿en USD cuando idioma = EN?
3. **Imágenes / media** (R2 mirror, `raw.listing_media_mirror`) — portada + galería, ¿cargan?, ¿rotas?
4. **Estado activo/muerto** (`url_activa`) — ¿se esconden los 404/301?, ¿hay muertos visibles?
5. **Renta media / premium** (Airbnb/VRBO/NomadBarrio/Flatio/Booking) — ¿unidos al mapa?, ¿filtro UI?
6. **Geolocalización / barrio_id** (resolución espacial ST_Contains para fz/mc) — ¿puntos sin barrio?

**Dominios de enriquecimiento (paneles de barrio/zona):**
7. **Seguridad / score ABCD** por barrio.
8. **Zonas / barrios / comunas** (polígonos, cobertura, municipios Valle de Aburrá).
9. **POT / estrato / manzana** (POT48, estrato socioeconómico).
10. **Tráfico / congestión** (HERE Flow, `analytics.barrios_trafico_perfil`).
11. **Compraventas ORIP / catastro / mercado real**.
12. **POIs / ruido / verde** (SIATA, cómputos de barrio).
13. **Población** (DANE, comuna/municipio).

**Dominios de comunidad:**
14. **Eventos** por barrio (scrapers eventos).
15. **Negocios locales / tiendas**.
16. **Noticias / blog comunidad** (RSS, filtro cultural).

**Dominios transversales:**
17. **Moneda (TRM COP↔USD)** — regla crítica, ver §6.
18. **Idioma (es/en, i18n DOM)** — regla crítica, ver §6.
19. **Métricas / analytics** que alimentan dashboards (realtor, desempeño, zonas).

Para cada dominio produce una fila de matriz: `Dominio | Fuente | Tabla(s) | Endpoint | Componente FE | L1 estado | L2 estado | L3 estado | Veredicto`.

---

## 4. Metodología de verificación (SECCIÓN QUE CARGA EL PESO)

Un checklist sin método de verificación es prosa con una casilla. **Cada ítem del checklist debe traer CÓMO se comprobó.** Para cada campo/dato relevante:

1. **Query de DB** (en prod) que prueba que el dato existe y está fresco. Ej: `SELECT count(*), max(updated_at) FROM listing WHERE ...`.
2. **Llamada al endpoint** real de la API que sirve ese dato. Ej: `curl https://<prod>/api/.../listings?...` y qué campos vienen.
3. **URL del frontend** a cargar + **qué se ve correcto**, descrito explícitamente en **las 4 combinaciones**: `es+COP`, `es+USD`, `en+COP`, `en+USD` (cuando apliquen). Ej: "en `en`, el precio del mini-popup debe decir `$320,000 USD`, no `$1.300.000.000 COP`".
4. **Clasificación** `[L1]`/`[L2]`/`[L3]` + veredicto `✅ funciona` / `⚠️ parcial` / `❌ roto` / `🚫 no existe`.

**Regla dura — verificación EN PRODUCCIÓN, no solo local:**
Esta plataforma tiene historial repetido de "funciona en local, roto en prod" (cron que nunca corrió, cache refresh fallido en silencio, tablas stub en prod, deploy que no disparó). **Un ítem marcado ✅ solo con evidencia local NO es válido.** Para cada dominio verifica contra la DB y los endpoints de **prod**. Si no tienes acceso a prod para algún punto, márcalo `❓ no verificado en prod` explícitamente — nunca lo asumas verde. Sospechosos habituales a chequear siempre: (a) ¿el cron de scrapers/cache corrió?, (b) ¿el refresh de cache (`api/cache.py`) completó o falló callado?, (c) ¿la imagen de prod es posterior al último fix?

---

## 5. Anclas reales del repo (empieza por aquí, no adivines)

**Backend / datos:**
- `api/cache.py` — tabla materializada de listings (UNION de fuentes, dedup, resolución barrio_id espacial, filtro `url_activa`). Es el cuello de botella de casi todo lo del mapa.
- `api/routers/` (35 routers) — endpoints. Clave: `listings.py`, `listings_propios.py`, `historial.py`, `barrios.py`, `zonas.py`, `comunas.py`, `trm.py`, `realtor.py`, `comunidad.py`, `business.py`.
- `api/parametros.py` — parámetros incl. TRM backend.
- `alembic/versions/` — 105 migraciones (última `0105`). El esquema real vive aquí.

**Scrapers / ingestión:**
- `scraping/` — `airbnb/`, `metrocuadrado/`, `habi/`, `renta_media/`, `vrbo/`, `eventos/`, `tiendas/`, `noticias/`.
- `scripts/` — 64 scripts de carga/cómputo (`scrape_*.py`, `load_*.py`, `compute_*.py`, `enrich_*.py`, `fetch_trm.py`, `qc_report.py`).
- `airflow/dags/` — `scrape_listings.py`, `trm_semanal.py`, `parametros_diario.py` (metadata en `airflow_meta`, NO en la DB de la app).

**Frontend mapa (donde renderiza):**
- `src/components/MapView.tsx` — el mapa.
- `src/components/MapFilterBar.tsx` — filtros (moneda/unidad/idioma).
- `src/components/ListingMiniPopup.tsx` — el popup pequeño (Popup1).
- `src/components/ListingDrawer.tsx` — el drawer Zillow (Popup2).
- `src/components/listing-popup/` — `ListingPopup.tsx`, `PopupGallery.tsx`, `PopupPriceHistory.tsx`.
- `src/config/mapColors.ts` — colores del mapa.

**Moneda / idioma (reglas críticas):**
- `src/hooks/useTrm.ts`, `api/routers/trm.py`, `api/parametros.py` — conversión COP↔USD.
- `src/lib/i18n.tsx` — traducción DOM es/en.

**Docs a RECONCILIAR (no re-derivar desde cero — ver §7):**
- `docs/DATABASE_SCHEMA.md`, `docs/INVENTARIO_DATOS.md`, `docs/RESUMEN_DATOS_STAKEHOLDER.md`, `docs/GAPS_DATOS_TIPO_ZILLOW.md`.

Usa primero las herramientas del codebase-memory-mcp (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`) para mapear estructura antes de leer archivo por archivo.

---

## 6. Reglas críticas transversales (aplican a TODO dato con precio o texto)

**MONEDA — USD/COP:** Cuando el idioma/selección es inglés (o el usuario pidió USD), **TODO precio debe mostrarse en USD** convertido vía TRM. Esto incluye: precio del listing, rango de precios, **historial de precios**, yield/ROI, precio por m², cualquier métrica monetaria en paneles de barrio/zona, calculadora, comparador. Un precio en COP mostrado bajo idioma EN es `❌ roto [L3]`. (Precedente real: el input de texto de precio máx no convertía USD→COP mientras el slider sí — hay bugs de este tipo en ambas direcciones; búscalos.)

**IDIOMA — es/en:** El idioma lo maneja un traductor DOM (`i18n.tsx`), no `t()` por campo. Ojo con: descripciones libres (no se traducen), colisiones de substring, campos que quedan en español bajo EN. Un campo que debería traducirse y no lo hace es `❌ roto [L3]`.

Verifica estas dos reglas en CADA dominio que tenga precio o texto, no solo en el listing.

---

## 7. Punto de partida: reconciliar docs vs realidad

No re-derives el inventario desde cero. **Empieza** leyendo `docs/INVENTARIO_DATOS.md`, `docs/DATABASE_SCHEMA.md`, `docs/RESUMEN_DATOS_STAKEHOLDER.md`, `docs/GAPS_DATOS_TIPO_ZILLOW.md`. Luego **reconcilia doc vs. estado real** (DB prod + código + frontend): marca cada afirmación de esos docs como `confirmada`, `desactualizada`, o `contradicha por la realidad`. Gran parte del trabajo es encontrar dónde el doc dice una cosa y prod hace otra.

---

## 8. Entregables (formato exacto)

Produce un documento nuevo en `docs/SCOPE_DATOS_<fecha>.md` con estas secciones:

### A. Resumen ejecutivo (NO técnico)
Para el usuario/stakeholder. En lenguaje llano: qué datos tiene la plataforma, cuáles funcionan de verdad en producción, cuáles están rotos o faltan, y el riesgo de salir a producción hoy. Sin jerga. Una tabla semáforo por dominio (🟢/🟡/🔴).

### B. Matriz Dominio × Capa (técnica)
La matriz de §3, una fila por dominio, con las 3 capas y veredicto.

### C. Checklist punto por punto (el corazón del entregable)
Lista de casillas, **una por campo/comportamiento verificable**, por más simple que parezca. Formato de cada ítem:

```
- [ ] [Dominio] [L1/L2/L3] <qué se verifica>
      Query/Prueba: <query DB prod o curl endpoint>
      FE: <URL + qué se ve correcto en es+COP / es+USD / en+COP / en+USD>
      Veredicto: ✅/⚠️/❌/🚫/❓  — <una línea de hallazgo>
```

Incluye explícitamente, como mínimo, estos ítems (son los ejemplos que el usuario dio — mapéalos a su capa):
- Mini-popup del listing abre y muestra datos (no vacío). `[L3]`
- Precio del mini-popup en USD cuando idioma = EN (no solo COP). `[L3]`
- Listing en la lista también abre en popup/drawer (no "aparece pero no abre por falta de dato"). `[L3]`
- Imágenes del listing cargan: portada + galería, no rotas. `[L2/L3]`
- Listing inactivo/muerto NO visible en el mapa (`url_activa`). `[L2]`
- Historial de precios aparece Y está en USD bajo EN. `[L3]`
- (Extiende la lista a todos los dominios de §3.)

### D. Gap analysis
Qué falta, etiquetado por capa: `[L1]` falta desplegar, `[L2]` falta poblar/correr cron, `[L3]` falta arreglar render. Prioriza por impacto en "salir a producción".

### E. Plan de arreglo propuesto (solo propuesta, no ejecutar)
Lista priorizada de fixes, cada uno con capa, archivo(s), y esfuerzo estimado. El usuario decide qué se arregla después.

---

## 9. Reglas de ejecución

- **No arregles código de la app.** Solo auditoría + scripts read-only de verificación. Los fixes son una sesión aparte aprobada por el usuario.
- **Verifica en prod** (regla dura §4). Marca `❓` lo no verificable, nunca lo asumas verde.
- **Contexto:** hubo un outage de Railway el 2026-10-21 y hay varios fixes con "deploy pendiente" — revisa el estado de deploy real, no confíes en que un commit en `main` ya esté en prod (el auto-deploy no siempre dispara, y `social-cron` requiere `railway up` manual).
- **Dos altitudes:** siempre resumen no técnico + detalle técnico.
- Trabaja dominio por dominio; no declares nada ✅ sin el método de verificación al lado.

---

## 10. Cómo ejecutar esta auditoría (modelo + estrategia)

**Modelo recomendado: Opus 4.8 (contexto 1M), reasoning high/xhigh.**
Razón: la tarea es transversal (DB + scrapers + API + frontend a la vez), larga, y necesita sostener muchos archivos y el esquema completo en contexto para trazar cada dato source→píxel. Modelos de contexto chico pierden el hilo del pipeline a mitad de camino.

**Estrategia de ejecución — fan-out por dominio:**
Corre el hilo principal en Opus 4.8 como **sintetizador**. Para acelerar, lanza **sub-agentes en paralelo, uno por grupo de dominios** (ej: un sub-agente para listings+historial+imágenes, otro para enriquecimiento de barrio, otro para comunidad, otro para moneda/idioma transversal). Cada sub-agente trae su porción de la matriz y el checklist; el hilo principal reconcilia, deduplica y arma el resumen ejecutivo. Así se cubre el repo entero sin saturar un solo contexto.

Si prefieres un solo hilo, igual funciona en Opus 4.8 1M — solo será más lento y secuencial, dominio por dominio.
