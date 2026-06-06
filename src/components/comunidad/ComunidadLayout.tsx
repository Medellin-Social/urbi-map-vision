import { type ReactNode } from 'react'
import { BarrioProvider, useBarrio } from './BarrioContext'
import { ComunidadNavbar } from './ComunidadNavbar'
import { ComunidadFooter } from './ComunidadFooter'

function Inner({ children }: { children: ReactNode }) {
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
      <ComunidadNavbar />
      <main style={{ flex: 1 }}>{children}</main>
      <ComunidadFooter lang={lang} />
    </div>
  )
}

export function ComunidadLayout({ children, initialSlug }: { children: ReactNode; initialSlug: string }) {
  return (
    <BarrioProvider initialSlug={initialSlug}>
      <Inner>{children}</Inner>
    </BarrioProvider>
  )
}
