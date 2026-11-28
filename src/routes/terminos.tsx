import { seo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { BarrioProvider } from "@/components/comunidad/BarrioContext";
import { ComunidadNavbar } from "@/components/comunidad/ComunidadNavbar";

export const Route = createFileRoute("/terminos")({
  head: () =>
    seo({
      title: "Términos y Condiciones · Medellín Social",
      description:
        "Términos y Condiciones de uso de Medellín Social (Ley 1480 de 2011, Ley 527 de 1999).",
      path: "/terminos",
    }),
  component: TerminosPage,
});

// ponytail: texto legal en castellano (Ley 1480 exige castellano). Estructura espejo
// de politica-privacidad.tsx. BORRADOR — pendiente de completar identificadores de la
// persona jurídica ([RAZÓN SOCIAL], NIT, domicilio) y de validación por abogado.
const VIGENCIA = "por definir";

type Bloque = { tipo: "p"; texto: string } | { tipo: "lista"; items: string[] };
type Seccion = { titulo: string; bloques: Bloque[] };

const SECCIONES: Seccion[] = [
  {
    titulo: "1. Identificación del proveedor",
    bloques: [
      { tipo: "p", texto: "La Plataforma https://medellin.social (el sitio y la aplicación, «la Plataforma») es operada por EASE Association, NIT [NIT — POR COMPLETAR], con domicilio en [DIRECCIÓN, CIUDAD, COLOMBIA — POR COMPLETAR] («Medellín Social», «nosotros»)." },
      { tipo: "lista", items: [
        "Contacto / PQRS: soporte@medellin.social · [TELÉFONO].",
        "Autoridad de protección al consumidor: Superintendencia de Industria y Comercio (SIC) — https://www.sic.gov.co.",
      ]},
      { tipo: "p", texto: "Al acceder, registrarte o hacer clic en «Acepto», declaras que aceptas estos Términos, que eres mayor de 18 años y que tienes capacidad para obligarte. Si no estás de acuerdo, no uses la Plataforma. Estos Términos se rigen por la Ley 1480 de 2011 (Estatuto del Consumidor), la Ley 527 de 1999 (comercio electrónico) y demás normas colombianas aplicables." },
    ],
  },
  {
    titulo: "2. Qué es la Plataforma",
    bloques: [
      { tipo: "p", texto: "Medellín Social es un portal inmobiliario e intermediario que: (i) muestra en un mapa información sobre inmuebles y barrios del Valle de Aburrá; (ii) permite a propietarios y agentes publicar avisos de inmuebles; y (iii) conecta a personas interesadas con propietarios y agentes. Medellín Social no es parte de la negociación, compraventa o arrendamiento que las partes acuerden entre sí." },
    ],
  },
  {
    titulo: "3. Cuentas",
    bloques: [
      { tipo: "p", texto: "Algunas funciones requieren registro. Debes suministrar información veraz, completa y actualizada, y mantener la confidencialidad de tus credenciales. Eres responsable de la actividad realizada bajo tu cuenta. Podemos suspender o cancelar cuentas que incumplan estos Términos o la ley." },
    ],
  },
  {
    titulo: "4. Licencia de uso y conductas prohibidas",
    bloques: [
      { tipo: "p", texto: "Te otorgamos una licencia limitada, no exclusiva, revocable e intransferible para usar la Plataforma con fines personales y no comerciales. No puedes:" },
      { tipo: "lista", items: [
        "Explotar comercialmente la Plataforma o su contenido sin autorización.",
        "Copiar, extraer masivamente (scraping) o reutilizar las bases de datos.",
        "Realizar ingeniería inversa sobre la Plataforma.",
        "Usar la Plataforma para construir un producto o servicio competidor.",
        "Publicar información falsa, engañosa o de inmuebles sobre los que no tienes derecho.",
        "Vulnerar la seguridad de la Plataforma o los derechos de terceros.",
      ]},
    ],
  },
  {
    titulo: "5. Publicación de avisos (propietarios y agentes)",
    bloques: [
      { tipo: "p", texto: "Quien publica declara y garantiza que la información del inmueble es veraz, que está facultado para ofrecerlo y que cuenta con los soportes legales (p. ej. matrícula inmobiliaria). Es el único responsable del contenido de su aviso." },
      { tipo: "p", texto: "Medellín Social puede revisar, moderar, rechazar o retirar avisos que considere inexactos, ilegales o contrarios a estos Términos, sin que ello genere responsabilidad. El aviso no constituye oferta comercial vinculante de Medellín Social; las condiciones del inmueble las fija y responde quien publica." },
    ],
  },
  {
    titulo: "6. Precios, suscripciones y derecho de retracto",
    bloques: [
      { tipo: "p", texto: "El uso general de la Plataforma es gratuito. Si se ofrecen planes o servicios pagos, su precio se informará de forma clara e incluirá impuestos y costos antes de la contratación, en pesos colombianos (COP)." },
      { tipo: "p", texto: "Derecho de retracto (Ley 1480, art. 47): en las ventas a distancia de servicios, el consumidor podrá ejercer el retracto dentro de los cinco (5) días hábiles siguientes a la celebración del contrato, salvo las excepciones legales. El procedimiento de retracto y de reversión del pago (art. 51) se informará al momento de la contratación." },
    ],
  },
  {
    titulo: "7. Propiedad intelectual",
    bloques: [
      { tipo: "p", texto: "El software, diseño, marcas, bases de datos y contenido propio de la Plataforma pertenecen a Medellín Social o a sus licenciantes. Estos Términos no transfieren derechos de propiedad; solo otorgan la licencia de uso de la sección 4. Los avisos y contenidos cargados por los usuarios siguen siendo de sus titulares, quienes conceden a Medellín Social una licencia para mostrarlos y promocionarlos dentro de la Plataforma." },
    ],
  },
  {
    titulo: "8. Suspensión y terminación",
    bloques: [
      { tipo: "p", texto: "Podemos suspender o terminar tu acceso, con o sin aviso, por incumplimiento de estos Términos o de la ley. Puedes cerrar tu cuenta en cualquier momento. Las disposiciones que por su naturaleza deban subsistir (propiedad intelectual, responsabilidad, datos personales) continuarán vigentes tras la terminación." },
    ],
  },
  {
    titulo: "9. Exención y límites de responsabilidad",
    bloques: [
      { tipo: "p", texto: "La Plataforma se ofrece «como está». No garantizamos que la información de los avisos (precios, características, disponibilidad) sea exacta o esté vigente, pues proviene de terceros o de fuentes públicas; verifica directamente con el propietario o agente antes de tomar decisiones." },
      { tipo: "p", texto: "Medellín Social no responde por los acuerdos, pagos, incumplimientos o daños derivados de la relación entre usuarios, propietarios y agentes, por ser un intermediario. Nada en estos Términos limita los derechos irrenunciables del consumidor ni la responsabilidad que la ley colombiana no permite excluir." },
    ],
  },
  {
    titulo: "10. Protección de datos personales",
    bloques: [
      { tipo: "p", texto: "El tratamiento de datos personales se rige por nuestra Política de Tratamiento de Datos Personales (/politica-privacidad) y la Política de Cookies (/politica-cookies), que forman parte integral de estos Términos." },
    ],
  },
  {
    titulo: "11. PQRS y atención al consumidor",
    bloques: [
      { tipo: "p", texto: "Las peticiones, quejas, reclamos y solicitudes se reciben en soporte@medellin.social o [TELÉFONO] y se atienden conforme a la ley. La Plataforma incluye un enlace visible a la SIC (https://www.sic.gov.co) para que el consumidor acuda a la autoridad." },
    ],
  },
  {
    titulo: "12. Ley aplicable y jurisdicción",
    bloques: [
      { tipo: "p", texto: "Estos Términos se rigen por las leyes de la República de Colombia. Las controversias se someterán a los jueces y autoridades competentes de Colombia, incluida la SIC en ejercicio de funciones jurisdiccionales de protección al consumidor. El consumidor conserva sus acciones ante la SIC y la jurisdicción ordinaria." },
    ],
  },
  {
    titulo: "13. Modificaciones e idioma",
    bloques: [
      { tipo: "p", texto: "Podemos actualizar estos Términos. Los cambios se publicarán en la Plataforma con su fecha de vigencia; los cambios relevantes se comunicarán por los canales habituales. El uso continuado tras la vigencia implica su aceptación. Estos Términos se emiten en castellano, idioma que prevalece para su interpretación." },
    ],
  },
];

function TerminosPage() {
  return (
    <BarrioProvider initialSlug="todos">
      <div className="paper-theme" style={{ minHeight: "100dvh", background: "#FAF8F3" }}>
        <ComunidadNavbar />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px", fontFamily: "'Inter', system-ui, sans-serif", color: "#111418" }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "2rem", fontWeight: 900, margin: "0 0 8px" }}>
            Términos y Condiciones de Uso
          </h1>
          <p style={{ color: "#5B5F5C", fontSize: 14, margin: "0 0 4px" }}>
            Ley 1480 de 2011 · Ley 527 de 1999
          </p>
          <p style={{ color: "#5B5F5C", fontSize: 13, margin: "0 0 20px" }}>Vigente desde: {VIGENCIA}.</p>
          <p style={{ background: "#FFF4D6", border: "0.5px solid #E7D9A8", color: "#8A6D1D", fontSize: 12.5, lineHeight: 1.55, borderRadius: 8, padding: "10px 14px", margin: "0 0 28px" }}>
            Borrador pendiente de completar los datos de la persona jurídica responsable y de validación por un abogado colombiano antes de su publicación definitiva.
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
