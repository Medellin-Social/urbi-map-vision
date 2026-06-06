import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/comunidad')({
  component: ComunidadRedirect,
})

function ComunidadRedirect() {
  useEffect(() => { window.location.replace('/eventos/el-poblado') }, [])
  return null
}
