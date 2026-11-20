# Reorg del Realtor Dashboard — Auditoría, reorganización y pruebas

**Fecha:** 2026-11-16 · **Rama:** DEV · **Alcance:** Centro de agente (`/realtor/dashboard`)

## 1. Por qué (contexto)

El Centro de agente tenía **10 tabs de primer nivel** con solapamiento real: el mismo
dato se mostraba en varias secciones, y la navegación no agrupaba tareas afines. Se
reorganizó en **5 secciones**, se eliminaron duplicados, se definió un único dueño por
métrica, se aplicó jerarquía visual y accesibilidad WCAG 2.2, y se agregó el ciclo de
vida completo del listing con una prueba Playwright de extremo a extremo.

## 2. Auditoría — duplicados encontrados

| Duplicado | Dónde vivía | Resolución |
|---|---|---|
| Aceptación / respuesta / asistencia / vistas | **Resumen** *y* **Desempeño** *y* **Resultados §1** | Queda solo en **Inicio**. Desempeño eliminado; §1 de Resultados eliminado. |
| ROI de zonas (costo/intake, funnel recibidos→cerrados) | **Resumen**, **Desempeño** (`RoiZonaCard`), **Resultados §2** | Funnel operativo en **Inicio**; ROI analítico en **Mercado › Zonas**. `RoiZonaCard` eliminado. |
| Grid "Información del mercado" | **Resumen** (`MercadoZona`) *y* **Resultados §3** *y* **Inteligencia** | Sale de Inicio; queda en **Mercado**. `MercadoZona` eliminado. |
| "Ideas para más adelante" (placeholder) | **Resultados §4** | Eliminado (cruft, sin dato real). |

**Código eliminado:** `DesempenoTab`, `RoiZonaCard`, `ResultCard`, `SUGERENCIAS`,
`MercadoZona`, y los bloques §1/§4 de `ResultadosTab`. Helpers compartidos
(`StatTile`, `RingStat`, `BloqueHeader`, `BigNumber`, `MercadoCol`) se conservaron.

## 3. Estructura nueva (10 → 5)

| Sección | Compone | Sub-nav |
|---|---|---|
| **Inicio** | Alertas de hoy + Resumen (standing/aceptación/respuesta/asistencia + funnel recibidos→tomados→publicados→cerrados + vistas perdidas) | — |
| **Mis listings** | Crear/editar/pausar/reactivar/eliminar + métricas por listing | filtro por estado |
| **Bandeja y agenda** | Inbox (leads) + Agenda (visitas) | Bandeja / Agenda |
| **Mercado** | Zonas de interés (ROI + comparables + grid mercado) + Inteligencia + Comparador | Zonas / Inteligencia / Comparador |
| **Herramientas** | Simulador + Servicios (perfil/horario/zonas) | Simulador / Servicios |

Deep-links viejos (`?tab=inbox`, `?tab=desempeno`, …) se remapean a la sección nueva
(`TAB_TO_SECTION`) para no romper enlaces del navbar y los popups de listing. Los que
apuntan a una sub-vista (`?tab=comparador` → Mercado › Comparador; `?tab=agenda`,
`?tab=config`) también fijan el sub-tab correcto, no solo la sección. Callers reales
verificados: `comparador.tsx` y `simulador.tsx` redirigen aquí.

## 4. Dueño de métrica (tabla canónica)

| Métrica | Única sede | Fuente |
|---|---|---|
| Standing, Aceptación, Respuesta, Asistencia, Oferta/interés, Vistas | **Inicio** | `useDesempeno` |
| Recibidos → Tomados → Publicados → Cerrados (por zona pagada) | **Inicio** | `d.zonas` |
| **Vistas perdidas** | **Inicio** | derivada client-side: `Σ(intakes−tomados)` + plantones (no-show) |
| **Qué hacer hoy** (alertas) | **Inicio** | derivada: asignados sin responder, visitas de hoy, borradores, rechazados |
| Aperturas / 30d / Favoritos por listing | **Mis listings** | `mis_listings` SQL |
| ROI de zonas (costo/intake), grid de mercado, comparables de cierre | **Mercado › Zonas** | `useDesempeno` + `useComparables` + `useInteligenciaBarrio` |
| Barrio a fondo (scores, seguridad, valorización, airbnb) | **Mercado › Inteligencia** | `useInteligenciaBarrio` |
| Embudo de demanda (vistas→detalle→fav→visita) | **Inicio** (resumen) | `useEmbudo` |

> **Nota:** la "vistas" por listing que ya existía = `event_type='listing_view'` =
> **aperturas de detalle**. Lo genuinamente nuevo por listing es **favoritos**
> (`raw.favoritos_listings` por `url ∈ {id, slug}`, mismo patrón dual que las vistas).

## 5. Ciclo de vida del listing

**Backend (`api/routers/realtor.py`), solo estado del dashboard — NO toca el cache del mapa (fase 2):**
- `POST /realtor/listings/{id}/estado` — pausar (publicado→pausado) / reactivar (pausado→publicado), guardado con el `TRANSICIONES_VALIDAS` que ya usa `cerrar`.
- `DELETE /realtor/listings/{id}` — soft-delete (`deleted_at`), reversible; `mis_listings` filtra `deleted_at IS NULL`.
- `mis_listings` extendido con `favoritos` por listing.
- Migración aditiva `0126_listing_soft_delete` (`ALTER TABLE listing ADD COLUMN deleted_at`).

**Front:** métodos `cambiarEstadoListing`/`eliminarListing` en `realtorApi` (http + mock stateful),
hooks `useCambiarEstadoListing`/`useEliminarListing`, y acciones por fila en `ListingRow`
(Editar · Pausar/Reactivar · Marcar vendido · Eliminar) + botón **Crear listing** → `/publicar`.

## 6. Accesibilidad (WCAG 2.2) y responsive

- **SC 2.4.11 Focus Not Obscured:** `scroll-mt-28` en el panel para que el header sticky no tape el foco.
- **SC 2.5.8 Target Size (≥24px):** nav 44px, sub-nav 40px, acciones de fila 32px, botón Crear 44px.
- **SC 2.4.7 Focus Visible:** `focus-visible:ring-2` en nav, sub-nav y acciones.
- **ARIA:** nav y sub-navs son `role="tablist"` con `tab`/`tabpanel`, `aria-selected`, `aria-controls` y navegación por flechas/Home/End.
- **Contraste (verificado con ui-ux-suite):** texto blanco sobre `C.brand` (#0F8A4F) daba 4.4:1 (falla AA); sub-nav activo y badges usan `#0C7A45` = **5.4:1 (AA)**. `ink`/`sub` sobre card/soft pasan AA.
- **Responsive:** grids colapsan (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`), nav con `overflow-x-auto`, acciones de fila con `flex-wrap`.

## 7. Prueba Playwright (ciclo completo)

- **Archivo:** `qc/e2e/realtor-listing-lifecycle.e2e.ts` · **Config:** `qc/playwright.realtor.config.ts` · **Script:** `npm run test:realtor-e2e`.
- Corre contra un **dev server local con mock stateful** (`VITE_REALTOR_USE_MOCK=true`). **Verifica el flujo de UI, no el backend** (las mutaciones pegan al mock; el backend real se valida sembrando una cuenta agente en DEV).
- **3 pruebas:**
  1. **Render de las 5 secciones** — monta Inicio/Mis listings/Bandeja/Mercado/Herramientas y cada sub-nav, verificando que ninguna lanza errores de JS (tsc/build no detectan crashes de render en los cuerpos recortados).
  2. **Deep-link** `?tab=comparador` abre Mercado › Comparador.
  3. **Ciclo de vida**: **crear** (entrada a `/publicar`) → **editar** (título) → **pausar** → **reactivar** → **eliminar** (confirm nativo), con capturas por etapa.

**Resultado:** `3 passed (25.1s)`. Reporte HTML + capturas 01–05 en `qc-report-realtor/`.

> Bug encontrado y corregido por la prueba: hydration mismatch al leer `?section=` en el
> inicializador de `useState` (SSR renderizaba `inicio`, cliente `listings`). Fix: default
> `inicio` + aplicar deep-link en `useEffect` post-mount.

## 8. Verificación ejecutada

- `npx tsc --noEmit` → sin errores.
- `npm run build` (SSR + cliente) → OK.
- `pytest api/tests/test_listing_transitions.py` → 15 passed (guard publicado↔pausado ya cubierto).
- `npm run test:realtor-e2e` → 3 passed (render de 5 secciones + deep-link + ciclo de vida).

## 9. Pendiente para prod (gate DEV-first, CLAUDE.md)

1. Desplegar a env DEV y correr `alembic upgrade head` (la migración 0126 corre sola en el CMD de `Dockerfile.api`).
2. Verificar en DEV con datos reales: pausar/reactivar/eliminar + favoritos por listing.
3. Recién entonces merge a `main` → prod.

**Fuera de alcance (acordado):** sincronizar pausar/eliminar con el cache del mapa público (fase 2); compute de servidor para "vistas perdidas" (se deriva en cliente); impresiones de pin por-listing (no hay event type; se usan aperturas + favoritos).
