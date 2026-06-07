import { type ReactNode } from 'react'
import { BarrioProvider, useBarrio } from './BarrioContext'
import { ComunidadNavbar } from './ComunidadNavbar'
import { ComunidadFooter } from './ComunidadFooter'

function Inner({ children, subNav, compact }: { children: ReactNode; subNav?: ReactNode; compact?: boolean }) {
  const { lang } = useBarrio()
  return (
    <div style={{
      colorScheme: 'light',
      background: '#fbf9f3',
      color: '#14201d',
      fontFamily: "'Inter', system-ui, sans-serif",
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <ComunidadNavbar compact={compact} />
      {subNav}
      <main style={{ flex: 1 }}>{children}</main>
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
