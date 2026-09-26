// Wordmark "Medellín Social." — el punto de la i de "Social" es un pin de
// mapa diminuto en vez de un punto genérico (producto de mapa, no un blog).
// Tamaño sigue el font-size heredado del contenedor (unidades em), un solo
// componente para los 3 sitios que repetían este wordmark (MapNavbar,
// ComunidadNavbar x2).
// pinTop: offset vertical del pin sobre la "i". El valor visual cambia según el
// contexto (line-height) donde vive el wordmark, por eso el veil de carga lo
// sube por su cuenta (pinTop propio) y los logos usan el default. Van separados.
export function Wordmark({ teal = "#1D9E75", coral = "#D85A30", paper = "#FAF7F2", pinTop = "0.1em" }: {
  teal?: string
  coral?: string
  amarillo?: string
  paper?: string
  pinTop?: string
}) {
  // "i" normal (el pin coral cubre su punto — no usar ı U+0131 que falla en iOS).
  const pinDot = (
    <svg
      viewBox="0 0 20 20"
      overflow="visible"
      style={{ width: "0.28em", height: "0.28em", display: "inline-block", position: "absolute", left: "50%", top: pinTop, transform: "translateX(-50%)", fontSize: "inherit" }}
      aria-hidden="true"
    >
      <path
        d="M10 1 C6 1 3.5 3.5 3.5 7 C3.5 11.5 10 18 10 18 C10 18 16.5 11.5 16.5 7 C16.5 3.5 13.5 1 10 1 Z"
        fill={coral}
      />
      <circle cx="10" cy="7" r="2.2" fill={paper} />
    </svg>
  )
  const i = (
    <span data-i18n-skip style={{ position: "relative", display: "inline-block", lineHeight: "1", overflow: "visible" }}>
      i{pinDot}
    </span>
  )
  return (
    <>
      Medellín{" "}
      <span style={{ color: teal }}>
        Soc{i}al
      </span>
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
