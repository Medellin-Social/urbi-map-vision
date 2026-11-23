import { useBarrio } from './BarrioContext'
import { K as TOKENS } from '@/design/tokens'

const K = TOKENS

// Selector comuna/municipio por sección. Reemplaza al <select> que vivía en el
// navbar: cada sección (eventos, negocios) lo monta en su barra de filtros.
// Navega a /<seccion>/<slug> (recarga) — misma mecánica que el click en el mapa
// de negocios, así los dos controles de esa página se comportan igual. La sección
// sale del primer segmento de la URL.
export function ComunaSelect({ section }: { section?: string }) {
  const { barrio, barrios } = useBarrio()
  const medellin   = barrios.filter(b => b.grupo === 'Medellín')
  const valleAbura = barrios.filter(b => b.grupo === 'Valle de Aburrá')

  function onChange(slug: string) {
    const seg = section ?? window.location.pathname.split('/').filter(Boolean)[0] ?? 'eventos'
    window.location.href = `/${seg}/${slug}`
  }

  // Caret ▾ teal como background (appearance:none borra el nativo). Sin él el
  // select se leía como texto estático, no como filtro.
  const caret = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5 5 6.5 8 3.5' stroke='%23085041' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

  return (
    <select
      data-tour="barrio-select"
      aria-label="Comuna o municipio"
      value={barrio.slug}
      onChange={e => onChange(e.target.value)}
      style={{
        border: `1.5px solid ${K.teal}`, background: `${K.tealLight} ${caret} no-repeat right 11px center`,
        color: K.tealDeep,
        fontWeight: 700, fontSize: 13, padding: '8px 30px 8px 13px', borderRadius: 10,
        cursor: 'pointer', fontFamily: 'inherit', maxWidth: 220,
        WebkitAppearance: 'none', appearance: 'none',
      }}
    >
      <optgroup label="── Medellín ──">
        {medellin.map(b => (
          <option key={b.slug} value={b.slug} data-i18n-skip>📍 {b.nombre}</option>
        ))}
      </optgroup>
      <optgroup label="── Valle de Aburrá ──">
        {valleAbura.map(b => (
          <option key={b.slug} value={b.slug} data-i18n-skip>📍 {b.nombre}</option>
        ))}
      </optgroup>
    </select>
  )
}
