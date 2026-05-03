## Overview
Build "Urbidata", a dark-themed, map-first real estate investment analytics platform for Medellín. The map is the product: a Mapbox dark-style map of Medellín with neighborhood polygons colored by yield, and a draggable floating panel on the right that updates contextually when the user clicks a neighborhood.

All data is mocked, no backend, auth is mock-only (localStorage), all copy in Spanish, numbers in Colombian pesos.

## Pages & Flow

### Auth (mock)
- `/register` — name, email, password → saves user to localStorage → redirects to onboarding
- `/login` — email, password → localStorage check → redirects to map
- Clean, minimal dark forms with cyan accent button

### Onboarding (3 steps, /onboarding)
- Step 1 — Budget (4 ranges in COP)
- Step 2 — Investment goal (Airbnb / Renta larga / Valorización / Mixto, with icons)
- Step 3 — Risk profile (Conservador / Moderado / Agresivo, each with description)
- Progress indicator, back/next buttons, framer-motion step transitions
- Saves profile to localStorage, redirects to `/map`

### Main Dashboard (/map) — THE MAP
- Top navbar: Urbidata logo (left) + "Comparador" button + user avatar with goal chip (right)
- Full-screen Mapbox dark-v11 map centered on Medellín (6.2442, -75.5812, zoom 12)
- Neighborhood polygons (from user-provided GeoJSON) colored by yield:
  - >10% green, 7–10% cyan, 5–7% amber, <5% red
- Hover: name tooltip + opacity bump
- Click: highlight polygon + update floating panel
- Zoom-aware: zoom <13 shows comuna-level grouping, ≥13 shows individual barrios

### Floating Draggable Panel (3 states)
- ~380px wide, glassmorphic dark surface, draggable anywhere via header, minimize button collapses it to a thin cyan bar on the right edge
- Mobile: becomes a bottom sheet (snap points)
- All transitions via framer-motion

**State 1 — City overview (default)**
- Header: "Medellín · Valle de Aburrá" + "Tu perfil: [goal]"
- 2×2 metric grid: yield promedio (6.8%), barrios analizados (49), precio m² mediana ($6.1M), mejor zona para perfil (El Rodeo)
- Mini bar chart: top 5 barrios by yield (Recharts)
- Cyan-bordered recommendation card personalized to onboarding goal

**State 2 — Neighborhood detail (after click)**
- Header: barrio · comuna, badges for estrato + municipio
- Key metrics: precio m² venta, arriendo promedio, yield bruto, años recupero
- Connectivity: metro / parque / mall distances with icons
- Mini line chart: 12-month price trend (mocked)
- vs Market indicator (green BAJO / red SOBRE el promedio)
- 3 listing preview cards with "buena oferta" badge when applicable
- CTA: "Ver todos los listings →"

**State 3 — Listings view**
- Replaces panel with grid of listings
- Filters: Venta/Arriendo toggle, precio range slider, área m² slider
- Back button → returns to neighborhood detail

### Comparador de barrios (/comparador)
- Select 2–3 neighborhoods from dropdowns
- Side-by-side metrics table (yield, precio m², arriendo, años recupero, conectividad, estrato)
- Recharts radar chart overlaying selected neighborhoods

## Mock Data
- 7 neighborhoods seeded with the exact data provided
- Listings generator: 3 listings per barrio with tipo_operacion, tipo_inmueble, precio, area_m2, habitaciones, baños, precio_m2, "buena oferta" flag (precio_m2 below barrio median)
- 12-month synthetic price trend per barrio

## Design System
- Background `#0a0e1a`, surface `#111827`, border `#1f2937`
- Accents: cyan `#00d4ff`, purple `#7c3aed`, success `#10b981`, warning `#f59e0b`, danger `#ef4444`
- Text: primary `#f9fafb`, secondary `#9ca3af`
- Tailwind tokens defined in `src/styles.css`; reusable Card, MetricTile, Badge, GlowBadge components
- Inter font; subtle cyan glow on interactive elements
- COP formatter: `$X.XM COP`

## Technical Notes
- TanStack Start file routes: `index.tsx` (redirects to /login or /map based on localStorage), `login.tsx`, `register.tsx`, `onboarding.tsx`, `map.tsx`, `comparador.tsx`
- Add deps: `mapbox-gl`, `recharts`, `framer-motion`, `lucide-react`
- Mapbox token: stored in `src/lib/mapboxToken.ts` (you'll provide it after approval — public `pk.` token, safe in client bundle)
- GeoJSON: you'll upload the file; I'll place it under `src/data/medellin-barrios.geojson` and join by `nombre` to the mock data
- `useAuth` hook reads/writes localStorage; route guard component redirects unauthenticated users
- Draggable panel uses framer-motion `drag` with constraints; minimize state persisted in component
- Mobile responsive: panel switches to bottom sheet under `md` breakpoint via `useMobile`

## Out of Scope
- No payments, no real backend, no notifications, no admin tools
- No SSR-time map rendering (Mapbox is client-only; render in `useEffect`)

## What I need from you after approval
1. Your Mapbox public token (`pk.…`)
2. The Medellín barrios GeoJSON file