import { seo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { BarrioProvider } from "@/components/comunidad/BarrioContext";
import { ComunidadNavbar } from "@/components/comunidad/ComunidadNavbar";

export const Route = createFileRoute("/politica-cookies")({
  head: () =>
    seo({
      title: "Política de Cookies · Medellín Social",
      description: "Cómo Medellín Social usa cookies y tecnologías similares.",
      path: "/politica-cookies",
    }),
  component: PoliticaCookiesPage,
});

// ponytail: espejo de politica-privacidad.tsx / terminos.tsx. Castellano. Ajustar la
// tabla de cookies al inventario real de proveedores antes de publicar.
type Bloque = { tipo: "p"; texto: string } | { tipo: "lista"; items: string[] };
type Seccion = { titulo: string; bloques: Bloque[] };

const SECCIONES: Seccion[] = [
  {
    titulo: "1. Qué son las cookies",
    bloques: [
      { tipo: "p", texto: "Las cookies son pequeños archivos que el sitio guarda en tu dispositivo para que funcione, recordar tus preferencias y entender cómo se usa. Incluye tecnologías similares (local storage, píxeles)." },
    ],
  },
  {
    titulo: "2. Tipos de cookies que usamos",
    bloques: [
      { tipo: "lista", items: [
        "Estrictamente necesarias: sesión, autenticación, seguridad y funcionamiento del mapa y los filtros. No requieren consentimiento (son indispensables).",
        "De preferencias: recordar idioma, zonas y búsquedas guardadas (historial del mapa).",
        "Analíticas: medir el uso de forma agregada para mejorar la Plataforma. Requieren consentimiento.",
        "De mercadeo (si se habilitan): medir campañas o publicidad. Requieren consentimiento.",
      ]},
      { tipo: "p", texto: "Pendiente: ajustar esta lista al inventario real de cookies y proveedores (analítica, mapas, CRM) y mantenerla actualizada." },
    ],
  },
  {
    titulo: "3. Tu control",
    bloques: [
      { tipo: "lista", items: [
        "Puedes aceptar o rechazar las cookies no esenciales desde el banner de cookies al ingresar, y cambiar tu elección después.",
        "Puedes borrar o bloquear cookies desde la configuración de tu navegador. Si bloqueas las necesarias, algunas funciones (sesión, favoritos) podrían no operar.",
        "El historial de búsquedas del mapa se guarda localmente en tu dispositivo (local storage); puedes eliminarlo desde tu perfil o limpiando los datos del navegador.",
      ]},
    ],
  },
  {
    titulo: "4. Cookies de terceros",
    bloques: [
      { tipo: "p", texto: "Algunos proveedores (analítica, mapas, CRM) pueden instalar sus propias cookies, regidas por sus propias políticas. Pendiente listar los terceros reales." },
    ],
  },
  {
    titulo: "5. Cambios y contacto",
    bloques: [
      { tipo: "p", texto: "Actualizaremos esta Política cuando cambien nuestras cookies o la normativa; la versión vigente estará siempre disponible en la Plataforma con su fecha. Dudas: privacidad@medellin.social." },
    ],
  },
];

function PoliticaCookiesPage() {
  return (
    <BarrioProvider initialSlug="todos">
      <div className="paper-theme" style={{ minHeight: "100dvh", background: "#FAF8F3" }}>
        <ComunidadNavbar />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px", fontFamily: "'Inter', system-ui, sans-serif", color: "#111418" }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "2rem", fontWeight: 900, margin: "0 0 8px" }}>
            Política de Cookies
          </h1>
          <p style={{ color: "#5B5F5C", fontSize: 13, margin: "0 0 20px" }}>
            Complementa la <a href="/politica-privacidad" style={{ color: "#085041" }}>Política de Tratamiento de Datos</a>.
          </p>
          <p style={{ background: "#FFF4D6", border: "0.5px solid #E7D9A8", color: "#8A6D1D", fontSize: 12.5, lineHeight: 1.55, borderRadius: 8, padding: "10px 14px", margin: "0 0 28px" }}>
            Borrador — ajustar el inventario real de cookies y validar antes de publicar.
          </p>

          {SECCIONES.map((s) => (
            <section key={s.titulo} style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 8px" }}>{s.titulo}</h2>
              {s.bloques.map((b, i) =>
                b.tipo === "p" ? (
                  <p key={i} style={{ fontSize: 14, lineHeight: 1.65, color: "#3a3f3c", margin: "0 0 10px" }}>{b.texto}</p>
                ) : (
                  <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 20 }}>
                    {b.items.map((it, j) => (
                      <li key={j} style={{ fontSize: 14, lineHeight: 1.6, color: "#3a3f3c", marginBottom: 5 }}>{it}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </div>
      </div>
    </BarrioProvider>
  );
}
