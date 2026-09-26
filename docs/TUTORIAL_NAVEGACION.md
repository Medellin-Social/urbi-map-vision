# Tutorial: Cómo navegar Medellín Social

Guía breve para usuarios nuevos.

## 1. Home (`/`)

Mapa de bienvenida de fondo con dos botones:
- **🗺 Ver barrios** — abre el mapa de inmuebles (`/map`).
- **🎉 Ver comunidad** — activa selección de barrio en el mapa de fondo; al hacer click en un barrio aparece un panel con accesos a **Eventos**, **Negocios**, etc. de ese barrio.

Debajo del mapa: secciones de negocios destacados, noticias/blog y eventos de la semana.

## 2. Navbar principal

Links fijos en la barra superior:

| Link | Va a |
|---|---|
| HOME | `/` |
| EVENTOS | `/eventos/todos` |
| NEGOCIOS | `/local-business/todos` |
| REAL ESTATE | `/real-estate` |
| BLOG | `/#blog` |

En `/map`, la barra cambia a pestañas: **Comprar** / **Arrendar** / **Vender o Arrendar** (`/vender`) / **Encuentra un agente** (`/agentes`), más **Simular** y **Comparar** si el usuario es agente.

Menú de cuenta (ícono usuario): Mi perfil, Favoritos, Mis propiedades, Panel de agente (si aplica), Mi plan — o Ingresar/Registrarme si no hay sesión.

## 3. El mapa (`/map`)

Flujo: **comunas → barrio → inmuebles**.

1. Vista inicial: 16 comunas de Medellín coloreadas.
2. Click en una comuna → zoom a sus barrios, aparecen los inmuebles individuales.
3. Click en un inmueble → popup resumen; botón "ver más" → panel lateral con todo el detalle (galería, contacto del agente, agendar visita).
4. Botón de breadcrumb (⬅) vuelve a la vista de comunas.
5. Sin elegir zona, aplicar filtros busca en **todo el Valle de Aburrá**.
6. En móvil, un botón alterna entre vista **Mapa** y vista **Lista** (mismos filtros aplican a ambas).
7. Leyenda de colores explica qué representa cada color de punto (tipo de inmueble).

Hay un tour interactivo integrado: botón **"Tutorial de la página"** (arriba a la izquierda del mapa) repite esta guía paso a paso sobre la UI real.

## 4. Filtros (barra sobre el mapa)

- **Precio** — rango mín/máx (cambia según Comprar/Arrendar).
- **Habitaciones y baños** — selector rápido (1, 2, 3, 4+).
- **Tipo de inmueble** — multi-select (apartamento, casa, lote, etc.).
- **Comuna → Barrio** — cascader para acotar por zona sin usar el mapa.
- **Amenidades** — agrupadas por categoría (piscina, gimnasio, parqueadero, etc.).
- Cada filtro activo muestra un contador y botón para limpiarlo individualmente.

## 5. Páginas de comunidad (`/eventos/$barrio`, `/local-business/$barrio`)

Mismo navbar (HOME/EVENTOS/NEGOCIOS/REAL ESTATE/BLOG), listas tipo tarjeta (EventCard/BusinessCard) filtradas por el barrio activo. El selector de barrio en el navbar cambia el contexto para toda la sección.
