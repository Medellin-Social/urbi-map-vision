import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { BarrioProvider, useBarrio } from './BarrioContext'
import { ComunidadNavbar } from './ComunidadNavbar'
import { ComunidadFooter } from './ComunidadFooter'
import { LoadingVeil } from '../LoadingVeil'

// Etiqueta del veil según la sección → "Cargando eventos", "Cargando negocios"…
function loadingLabel(path: string): string | undefined {
  if (path.startsWith('/eventos')) return 'eventos'
  if (path.startsWith('/local-business') || path.startsWith('/negocios')) return 'negocios'
  if (path.startsWith('/real-estate')) return 'propiedades'
  if (path.startsWith('/vender') || path.startsWith('/publicar')) return 'el formulario'
  if (path.startsWith('/agentes')) return 'agentes'
  if (path.startsWith('/planes') || path.startsWith('/suscribirse')) return 'los planes'
  return undefined // → "Cargando"
}

// Muestra el veil durante la carga inicial de la página. Se oculta cuando NO
// hay fetch en vuelo (useIsFetching) Y ya pasó un mínimo visible (~750ms), para
// que TODA página lo muestre — incluso las que casi no fetchean (agentes,
// vender, planes, home) — no solo las de datos pesados. Tope duro MAX_VISIBLE_MS
// para que el backend lento/caído (fetching nunca llega a 0) no deje el veil pegado.
const MIN_VISIBLE_MS = 750
const MAX_VISIBLE_MS = 4000
function useBooting(path: string): boolean {
  const fetching = useIsFetching()
  const [booting, setBooting] = useState(true)
  const startRef = useRef(0)

  // Reinicia el veil al navegar a otra sección + tope duro por si nunca settlea.
  useEffect(() => {
    setBooting(true)
    startRef.current = performance.now()
    const cap = setTimeout(() => setBooting(false), MAX_VISIBLE_MS)
    return () => clearTimeout(cap)
  }, [path])

  useEffect(() => {
    if (fetching > 0) return // sigue cargando → mantén el veil (hasta el tope duro)
    const elapsed = performance.now() - startRef.current
    const wait = Math.max(150, MIN_VISIBLE_MS - elapsed)
    const t = setTimeout(() => setBooting(false), wait)
    return () => clearTimeout(t)
  }, [fetching, path])

  return booting
}

function Inner({ children, subNav, compact }: { children: ReactNode; subNav?: ReactNode; compact?: boolean }) {
  const { lang } = useBarrio()
  const path = useRouterState({ select: s => s.location.pathname })
  const booting = useBooting(path)
  return (
    <div style={{
      colorScheme: 'light',
      background: '#fbf9f3',
      color: '#14201d',
      fontFamily: "'Inter', system-ui, sans-serif",
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <ComunidadNavbar compact={compact} />
      {subNav}
      <main style={{ flex: 1 }}>{children}</main>
      {/* Veil a viewport (fixed) → siempre centrado y visible aunque el contenido
          sea alto/SSR. Cubre la página durante la carga y se desvanece. */}
      <LoadingVeil label={loadingLabel(path)} show={booting} className="fixed z-50" />
      <ComunidadFooter lang={lang} />
    </div>
  )
}

export function ComunidadLayout({ children, initialSlug, subNav, compact }: { children: ReactNode; initialSlug?: string; subNav?: ReactNode; compact?: boolean }) {
  return (
    <BarrioProvider initialSlug={initialSlug}>
      <Inner subNav={subNav} compact={compact}>{children}</Inner>
    </BarrioProvider>
  )
}
