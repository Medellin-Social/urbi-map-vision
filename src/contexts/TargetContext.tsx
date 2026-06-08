import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type Target = 'buyer' | 'seller' | 'landlord' | 'renter' | 'investor'

export const TARGET_OPTIONS: { value: Target; label: string; labelEs: string; icon: string }[] = [
  { value: 'buyer',    label: 'Buyer',     labelEs: 'Comprador',   icon: '🏠' },
  { value: 'seller',   label: 'Seller',    labelEs: 'Vendedor',    icon: '💰' },
  { value: 'landlord', label: 'Landlord',  labelEs: 'Arrendador',  icon: '🏢' },
  { value: 'renter',   label: 'Renter',    labelEs: 'Arrendatario',icon: '🔑' },
  { value: 'investor', label: 'Investor',  labelEs: 'Inversor',    icon: '📈' },
]

const LS_KEY = 'medellin-social.target'

interface TargetCtx {
  target: Target
  setTarget: (t: Target) => void
}

const Ctx = createContext<TargetCtx>({ target: 'investor', setTarget: () => {} })

export function TargetProvider({ children }: { children: ReactNode }) {
  const [target, setTargetState] = useState<Target>(() => {
    try {
      const v = localStorage.getItem(LS_KEY)
      if (v && TARGET_OPTIONS.some(o => o.value === v)) return v as Target
    } catch {}
    return 'investor'
  })

  const setTarget = (t: Target) => {
    setTargetState(t)
    try { localStorage.setItem(LS_KEY, t) } catch {}
  }

  return <Ctx.Provider value={{ target, setTarget }}>{children}</Ctx.Provider>
}

export function useTarget() {
  return useContext(Ctx)
}

// What tipo_operacion should be forced for a given target (null = user can choose)
export function targetTipoOperacion(t: Target): 'venta' | 'arriendo' | null {
  if (t === 'buyer')    return 'venta'
  if (t === 'renter')   return 'arriendo'
  return null
}
