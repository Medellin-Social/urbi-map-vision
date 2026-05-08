import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Building2, ArrowRight, MapPin, TrendingUp, Shield, Database,
  ClipboardList, Globe2, Target, User, Map as MapIcon, BarChart3,
  Home, Briefcase, Landmark, Calculator, Mail,
} from "lucide-react";
import { MapView } from "@/components/MapView";
import { LanguageToggle } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Urbidata · Invierte en Medellín con datos reales" },
      { name: "description", content: "El primer motor de decisión inmobiliaria para el Valle de Aburrá. Yields, precios justos, seguridad y oportunidades por barrio." },
      { property: "og:title", content: "Urbidata · Invierte en Medellín con datos reales" },
      { property: "og:description", content: "Motor de decisión inmobiliaria para el Valle de Aburrá." },
    ],
  }),
});

function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && (setVisible(true), io.disconnect()),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function LandingNavbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-surface text-primary ring-1 ring-border glow-cyan">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">
            Urbi<span className="text-primary">data</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <a href="#como-funciona" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">Cómo funciona</a>
          <a href="#perfiles" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">Para inversores</a>
          <a href="#datos" className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">Datos</a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link to="/login" className="hidden rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex">
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
          >
            Comenzar gratis <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [c1Start, setC1Start] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setC1Start(true), 400);
    return () => clearTimeout(t);
  }, []);
  const props = useCountUp(2478, 1600, c1Start);
  const barrios = useCountUp(65, 1400, c1Start);
  const valor = useCountUp(10.6, 1400, c1Start);

  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-32 md:pb-24">
      {/* gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[55fr_45fr] lg:gap-12">
        {/* LEFT */}
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <MapPin className="h-3 w-3" /> Medellín · Valle de Aburrá
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Deja de adivinar.
              <br />
              Empieza a invertir
              <br />
              <span className="text-glow-cyan text-primary">con datos reales.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Urbidata cruza precios de mercado, rendimiento Airbnb, seguridad,
              conectividad y valorización histórica para decirte exactamente
              dónde y cómo invertir en Medellín.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/map"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
              >
                Explorar el mapa <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#solucion"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:bg-surface"
              >
                Ver demo
              </a>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-8 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
                <div className="font-display text-xl font-bold text-primary">
                  {Math.round(props).toLocaleString("es-CO")}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">📊 propiedades analizadas</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
                <div className="font-display text-xl font-bold text-primary">{Math.round(barrios)}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">🏘️ barrios con datos</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
                <div className="font-display text-xl font-bold text-success">{valor.toFixed(1)}%</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">📈 valorización anual</div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* RIGHT — Live map */}
        <Reveal delay={200}>
          <div className="relative h-[420px] overflow-hidden rounded-2xl border border-primary/30 bg-surface shadow-[0_0_60px_-15px_rgba(0,212,255,0.35)] sm:h-[520px]">
            <MapView onSelect={() => {}} selectedId={null} />
            <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_120px_rgba(10,14,26,0.85)]" />
            <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/80 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-primary backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Datos actualizados · Mayo 2026
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Problem() {
  const cards = [
    { icon: ClipboardList, title: "Precios sin contexto", body: "Fincaraíz y Metrocuadrado muestran precios de oferta. Nadie te dice si ese precio es justo o un 30% inflado." },
    { icon: Globe2, title: "Información dispersa", body: "El dato de Airbnb está en una plataforma, la seguridad en otra, la valorización en otra. Nadie los cruza." },
    { icon: Target, title: "Sin personalización", body: "Un inversor Airbnb necesita datos distintos que uno de arriendo largo. Los portales tratan a todos igual." },
  ];
  return (
    <section className="relative border-t border-border/40 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">El problema</span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
            El mercado inmobiliario en Medellín es opaco.
            <span className="text-primary"> Hasta ahora.</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 100}>
              <div className="group h-full rounded-2xl border border-border/60 bg-surface/50 p-6 transition hover:-translate-y-1 hover:border-primary/40 hover:bg-surface">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Solution() {
  const steps = [
    { icon: User, title: "Define tu perfil", body: "Presupuesto, objetivo (Airbnb, renta larga, nómadas) y perfil de riesgo. El mapa se personaliza para ti." },
    { icon: MapIcon, title: "Explora el mapa", body: "Cada barrio muestra su score de inversión según TU perfil. Verde = oportunidad. Rojo = evitar." },
    { icon: BarChart3, title: "Toma decisiones con datos", body: "Yield real, precio justo (PBN), años de recupero, proyección a 5 años y comparación vs CDT bancario." },
  ];
  return (
    <section id="solucion" className="relative border-t border-border/40 bg-gradient-to-b from-background to-surface/30 py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Cómo funciona Urbidata</span>
            <h2 id="como-funciona" className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
              Un motor de decisión,
              <br />
              <span className="text-primary">no un portal de listados.</span>
            </h2>
          </Reveal>
          <div className="relative mt-10 space-y-6">
            <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <div className="relative flex gap-4">
                  <div className="z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground glow-cyan">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Paso {i + 1}</div>
                    <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Floating panel mockup */}
        <Reveal delay={150}>
          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-accent/15 blur-2xl" />
            <div className="relative rounded-2xl border border-primary/30 bg-surface p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Robledo · Medellín</div>
                  <div className="font-display text-xl font-bold">El Rodeo</div>
                </div>
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success ring-1 ring-success/40">
                  88 EXCELENTE
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Yield largo plazo</div>
                  <div className="mt-1 font-display text-xl font-bold text-success">12.62%</div>
                </div>
                <div className="rounded-lg bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recupero</div>
                  <div className="mt-1 font-display text-xl font-bold">7.9 <span className="text-xs text-muted-foreground">años</span></div>
                </div>
                <div className="col-span-2 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
                  <Target className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Precio bajo mercado · 43% oportunidad</span>
                </div>
                <div className="col-span-2 rounded-lg bg-background/60 p-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Liquidez</span><span className="text-primary">78/100 · ALTA</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-primary to-success" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DataSources() {
  const sources = [
    { emoji: "🏠", name: "Fincaraíz" },
    { emoji: "🏢", name: "Metrocuadrado" },
    { emoji: "🌙", name: "Airbnb / AirROI" },
    { emoji: "📊", name: "DANE Colombia" },
    { emoji: "🔒", name: "Alcaldía MDE" },
    { emoji: "🗺️", name: "OpenStreetMap" },
  ];
  return (
    <section id="datos" className="relative border-t border-border/40 py-24">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <Reveal>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Datos que usamos</span>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Construido sobre <span className="text-primary">datos reales</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sources.map((s, i) => (
            <Reveal key={s.name} delay={i * 60}>
              <div className="rounded-xl border border-border/60 bg-surface/50 px-4 py-5 transition hover:border-primary/40 hover:bg-surface">
                <div className="text-2xl">{s.emoji}</div>
                <div className="mt-2 text-sm font-semibold">{s.name}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mx-auto mt-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Cruzamos <span className="font-semibold text-foreground">+2,400 listings activos</span>,
            <span className="font-semibold text-foreground"> 3,239 puntos de interés urbano</span>,
            10 años de datos de valorización y criminalidad por barrio — todo en tiempo real.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Profiles() {
  const cards = [
    {
      icon: Home, term: "Corto plazo", title: "Airbnb",
      body: "Maximiza ingresos con renta corta. Analizamos ocupación real, ADR por barrio y demanda turística para identificar las zonas con mayor potencial Airbnb.",
      metric: "Hasta 12.6% yield anual",
      tags: "El Poblado · Boston · Manila",
      highlight: false,
    },
    {
      icon: Briefcase, term: "Mediano plazo", title: "Nómadas digitales",
      body: "Apunta al mercado de nómadas y ejecutivos. Medimos cafés, coworking, zonas verdes, seguridad percibida y disponibilidad de apartamentos amoblados.",
      metric: "Demanda creciendo 151% anual",
      tags: "El Poblado · Laureles · Estadio",
      highlight: true,
    },
    {
      icon: Landmark, term: "Largo plazo", title: "Arriendo tradicional",
      body: "Ingreso estable con menor gestión. Identificamos barrios donde el precio está bajo el valor justo (PBN) con alta seguridad residencial.",
      metric: "El Rodeo: 88/100 score",
      tags: "El Rodeo · Robledo · Aranjuez",
      highlight: false,
    },
  ];
  return (
    <section id="perfiles" className="relative border-t border-border/40 bg-gradient-to-b from-surface/30 to-background py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Tres perfiles, un mapa</span>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Elige tu estrategia. <span className="text-primary">Nosotros mostramos los datos.</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 100}>
              <div className={`relative flex h-full flex-col rounded-2xl border p-6 transition hover:-translate-y-1 ${
                c.highlight
                  ? "border-primary/60 bg-surface shadow-[0_0_50px_-10px_rgba(0,212,255,0.35)] lg:scale-[1.03]"
                  : "border-border/60 bg-surface/50 hover:border-primary/40"
              }`}>
                {c.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    Más popular
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.term}</div>
                    <h3 className="font-display text-xl font-bold">{c.title}</h3>
                  </div>
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                <div className="mt-5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
                  <TrendingUp className="mr-1.5 inline h-4 w-4" />{c.metric}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{c.tags}</div>
                <Link to="/map" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  Explorar <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalculatorPreview() {
  return (
    <section className="relative border-t border-border/40 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Calculadora de inversión</span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">
            Simula tu inversión <span className="text-primary">en segundos.</span>
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            Ingresa tu presupuesto y zona objetivo. Urbidata calcula yield neto,
            proyección de valorización y retorno total a 5 años — comparado contra
            un CDT bancario.
          </p>
          <Link to="/calculadora" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground glow-cyan transition hover:opacity-90">
            <Calculator className="h-4 w-4" /> Prueba la calculadora <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Zona</label>
                <div className="mt-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-semibold">El Rodeo</div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
                <div className="mt-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-semibold">Arriendo largo</div>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Presupuesto</label>
                <div className="mt-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-display text-lg font-bold text-primary">
                  $350.000.000 COP
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Yield neto</span>
                <span className="font-display text-lg font-bold text-success">8.1%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Retorno 5 años</span>
                <span className="font-display text-lg font-bold text-primary">+$353M</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">vs CDT bancario</span>
                <span className="font-semibold text-warning">+2.1% adicional</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-border/40 py-28">
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: "radial-gradient(circle at 30% 50%, #00d4ff 0%, transparent 40%), radial-gradient(circle at 70% 60%, #7c3aed 0%, transparent 35%)",
      }} />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <h2 className="font-display text-3xl font-bold leading-tight sm:text-5xl">
            Medellín crece.
            <br />
            ¿Estás invirtiendo con datos
            <br />
            <span className="text-primary">o con intuición?</span>
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-5 text-base text-muted-foreground">
            Accede gratis durante el beta. Sin tarjeta de crédito.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-4 text-base font-bold text-primary-foreground transition hover:opacity-90 glow-cyan"
          >
            Comenzar ahora — Es gratis <ArrowRight className="h-5 w-5" />
          </Link>
        </Reveal>
        <Reveal delay={280}>
          <p className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">
            Ya analizamos +65 barrios del Valle de Aburrá
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 bg-surface/30 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:px-6 md:flex-row">
        <div>Urbidata © 2026 · Medellín, Colombia</div>
        <div className="flex items-center gap-3">
          <a href="#" aria-label="LinkedIn" className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition hover:bg-surface hover:text-foreground">LinkedIn</a>
          <a href="#" aria-label="GitHub" className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition hover:bg-surface hover:text-foreground">GitHub</a>
          <a href="#" className="rounded-md p-1.5 transition hover:bg-surface hover:text-foreground"><Mail className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="mx-auto mt-4 max-w-7xl px-4 text-center text-[11px] text-muted-foreground/70 sm:px-6">
        Datos con fines informativos. No constituye asesoría financiera.
      </div>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background scroll-smooth">
      <LandingNavbar />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <DataSources />
        <Profiles />
        <CalculatorPreview />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
