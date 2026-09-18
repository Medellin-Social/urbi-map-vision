// Wordmark "Medellín Social." — el punto de la i de "Social" es un pin de
// mapa diminuto en vez de un punto genérico (producto de mapa, no un blog).
// Tamaño sigue el font-size heredado del contenedor (unidades em), un solo
// componente para los 3 sitios que repetían este wordmark (MapNavbar,
// ComunidadNavbar x2).
export function Wordmark({ teal = "#1D9E75", coral = "#D85A30", amarillo = "#ffc928", paper = "#FAF7F2" }: {
  teal?: string
  coral?: string
  amarillo?: string
  paper?: string
}) {
  const pin = (
    <svg
      viewBox="0 0 20 28"
      style={{ width: "0.34em", height: "0.48em", display: "inline-block", verticalAlign: "-0.02em" }}
      aria-hidden="true"
    >
      <path
        d="M10 2 C4 2 1 6 1 11 C1 17 10 26 10 26 C10 26 19 17 19 11 C19 6 16 2 10 2 Z"
        fill={coral}
      />
      <circle cx="10" cy="11" r="3.5" fill={paper} />
    </svg>
  )
  return (
    <>
      Medellín{" "}
      <span style={{ color: teal }}>
        Soc{pin}al
      </span>
      <span style={{ color: amarillo }}>.</span>
    </>
  )
}

// Insignia apilada (logo 05) — plaquita coral con "M" chico en ámbar arriba y
// "S" grande en paper abajo. Un solo componente, tamaño por prop, para que se
// vea igual en el header móvil de /map y en el círculo de cuenta.
export function BrandBadge({ size = 32, coral = "#D85A30", amarillo = "#ffc928", paper = "#FAF7F2" }: {
  size?: number
  coral?: string
  amarillo?: string
  paper?: string
}) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
        background: coral, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}
    >
      <span style={{ fontSize: size * 0.2, fontWeight: 700, letterSpacing: "0.05em", color: amarillo, lineHeight: 1 }}>
        M
      </span>
      <span style={{ fontFamily: "Georgia, serif", fontSize: size * 0.52, fontWeight: 900, color: paper, lineHeight: 1 }}>
        S
      </span>
    </div>
  )
}
