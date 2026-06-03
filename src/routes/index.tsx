import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coffee, Calendar, ShoppingBag, BarChart3, Map as MapIcon, Users, Building2 } from "lucide-react";
import { LandingMapHeader } from "@/components/LandingMapHeader";
import { SiteNavbar } from "@/components/SiteNavbar";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Medellín Social · Where Smart Investors Meet Local Culture" },
      { name: "description", content: "The only platform that combines real estate intelligence with authentic local experiences in Medellín and the Aburrá Valley." },
      { property: "og:title", content: "Medellín Social · Where Smart Investors Meet Local Culture" },
      { property: "og:description", content: "Real estate intelligence meets local culture in Medellín." },
    ],
  }),
});

const COMMUNITY_FEATURES = [
  { icon: Coffee,       title: "Recomendaciones Locales",  body: "Lugares seleccionados por personas que realmente viven ahí — no influencers." },
  { icon: Calendar,     title: "Eventos por Barrio",       body: "Del nightlife de El Poblado a los mercados de agricultores de Laureles." },
  { icon: ShoppingBag,  title: "Apoya el Comercio Local",  body: "Descubre los lugares que hacen único a cada barrio." },
];

const INVEST_FEATURES = [
  { icon: BarChart3, title: "Inteligencia de Mercado Real", body: "Precio por m², yields y reportes CMA respaldados por +43,000 listings." },
  { icon: MapIcon,   title: "Puntuación por Barrio",        body: "Cada barrio puntuado para potencial Airbnb, renta media y renta larga." },
  { icon: Users,     title: "Agentes Certificados",         body: "Agentes verificados que garantizan todo el proceso de compra." },
];

function TwoColumnSection() {
  return (
    <section className="border-t border-border/40">
      <div className="grid lg:grid-cols-2">
        {/* Community — left */}
        <div className="border-border/40 bg-surface/10 p-10 sm:p-14 lg:border-r">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">🌎 Comunidad</span>
            <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">
              Descubre Medellín
              <br />
              <span className="text-primary">Como un Local</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Evita las trampas turísticas. Conecta con locales reales que conocen su barrio — cafés ocultos, eventos comunitarios y los lugares que solo los locales conocen.
            </p>
          </Reveal>
          <div className="mt-7 space-y-4">
            {COMMUNITY_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={80 + i * 70}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{f.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={300}>
            <a
              href="/comunidad"
              className="mt-8 inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
            >
              Explorar Comunidad <ArrowRight className="h-4 w-4" />
            </a>
          </Reveal>
        </div>

        {/* Investment — right */}
        <div className="border-border/40 border-t bg-background p-10 sm:p-14 lg:border-t-0">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">💼 Invertir</span>
            <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">
              Deja de adivinar.
              <br />
              <span className="text-primary">Empieza a invertir con datos.</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Cruza precios de mercado reales, rendimiento Airbnb, puntuaciones de seguridad y valorización histórica para encontrar exactamente dónde invertir en el Valle de Aburrá.
            </p>
          </Reveal>
          <div className="mt-7 space-y-4">
            {INVEST_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={80 + i * 70}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{f.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={300}>
            <Link
              to="/map"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
            >
              Ver Mapa de Inversión <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function MinimalFooter() {
  return (
    <footer className="border-t border-border/40 bg-background py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/20 text-primary ring-1 ring-primary/30">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <span className="font-display text-sm font-semibold">
            Medellín <span className="text-primary">Social</span>
          </span>
        </div>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {[["Invertir", "/map"], ["Comunidad", "/comunidad"], ["Tiendas", "/stores"], ["Agentes", "/real-estate"], ["Iniciar sesión", "/login"]].map(([l, h]) => (
            <a key={l} href={h} className="transition hover:text-foreground">{l}</a>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">© 2026 Medellín Social</p>
      </div>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar transparent />
      <main>
        <LandingMapHeader />
        <TwoColumnSection />
      </main>
      <MinimalFooter />
    </div>
  );
}
