import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/stores')({
  component: StoresRedirect,
})

function StoresRedirect() {
  useEffect(() => { window.location.replace('/local-business/el-poblado') }, [])
  return null
}
