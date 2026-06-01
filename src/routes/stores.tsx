import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Star } from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/stores")({
  component: StoresPage,
  head: () => ({
    meta: [{ title: "Negocios Locales · Medellín Social" }],
  }),
});

type Store = {
  id: number;
  name: string;
  type: string;
  emoji: string;
  neighborhood: string;
  rating: number;
  mapsLink: string;
  siteLink?: string;
};

const STORES: Store[] = [
  { id: 1,  name: "Pergamino Café",       type: "Café",           emoji: "☕", neighborhood: "El Poblado", rating: 4.9, mapsLink: "#", siteLink: "#" },
  { id: 2,  name: "El Cielo Restaurant",  type: "Restaurante",    emoji: "🍽️", neighborhood: "El Poblado", rating: 4.9, mapsLink: "#", siteLink: "#" },
  { id: 3,  name: "Café Velódromo",       type: "Café",           emoji: "☕", neighborhood: "Laureles",   rating: 4.8, mapsLink: "#" },
  { id: 4,  name: "La Mar Medellín",      type: "Restaurante",    emoji: "🍽️", neighborhood: "El Poblado", rating: 4.8, mapsLink: "#", siteLink: "#" },
  { id: 5,  name: "Hija Mía Coffee",      type: "Café",           emoji: "☕", neighborhood: "El Poblado", rating: 4.7, mapsLink: "#" },
  { id: 6,  name: "Blues Brothers",       type: "Bar",            emoji: "🍻", neighborhood: "Laureles",   rating: 4.7, mapsLink: "#" },
  { id: 7,  name: "Mondoñedo",            type: "Restaurante",    emoji: "🍽️", neighborhood: "Envigado",   rating: 4.7, mapsLink: "#" },
  { id: 8,  name: "Café de los Andes",    type: "Café",           emoji: "☕", neighborhood: "El Centro",  rating: 4.7, mapsLink: "#" },
  { id: 9,  name: "Salón Amador",         type: "Bar",            emoji: "🍻", neighborhood: "El Centro",  rating: 4.6, mapsLink: "#" },
  { id: 10, name: "Mercado del Río",      type: "Mercado Gourmet",emoji: "🛒", neighborhood: "El Centro",  rating: 4.6, mapsLink: "#", siteLink: "#" },
  { id: 11, name: "Cato's Club",          type: "Bar",            emoji: "🍻", neighborhood: "Envigado",   rating: 4.6, mapsLink: "#" },
  { id: 12, name: "Smart Fit El Poblado", type: "Gimnasio",       emoji: "💪", neighborhood: "El Poblado", rating: 4.5, mapsLink: "#" },
  { id: 13, name: "El Toro",              type: "Restaurante",    emoji: "🍽️", neighborhood: "Laureles",   rating: 4.5, mapsLink: "#" },
  { id: 14, name: "La Provincia",         type: "Restaurante",    emoji: "🍽️", neighborhood: "Laureles",   rating: 4.5, mapsLink: "#" },
  { id: 15, name: "Gold's Gym Sabaneta",  type: "Gimnasio",       emoji: "💪", neighborhood: "Sabaneta",   rating: 4.4, mapsLink: "#" },
];

function StoreCard({ store }: { store: Store }) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-primary/20 bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface">
      <span className="absolute right-3 top-3 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/30">
        Recomendado
      </span>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-2xl ring-1 ring-border/60">
          {store.emoji}
        </div>
        <div className="min-w-0 flex-1 pr-20">
          <div className="truncate font-display text-sm font-bold">{store.name}</div>
          <div className="text-[11px] text-muted-foreground">{store.type}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">📍 {store.neighborhood}</span>
        <span className="flex items-center gap-1 font-semibold text-warning">
          <Star className="h-3.5 w-3.5 fill-current" />
          {store.rating.toFixed(1)}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <a
          href={store.mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" /> Mapa
        </a>
        {store.siteLink && (
          <a
            href={store.siteLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Sitio web
          </a>
        )}
      </div>
    </div>
  );
}

function StoresPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />

      <main className="pt-16">
        {/* Header */}
        <section className="border-b border-border/40 bg-surface/20 px-4 py-12 text-center sm:px-6">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">🏪 Negocios Locales</span>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Negocios Locales</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Descubre los mejores lugares en cada barrio — seleccionados y recomendados por la comunidad de Medellín Social.
            </p>
          </Reveal>
        </section>

        {/* Top 15 grid */}
        <section className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">
                  ⭐ Mejores Lugares
                </h2>
                <span className="text-xs text-muted-foreground">
                  Ordenado por recomendación de la comunidad
                </span>
              </div>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STORES.map((s, i) => (
                <Reveal key={s.id} delay={i * 40}>
                  <StoreCard store={s} />
                </Reveal>
              ))}
            </div>

            <Reveal delay={200}>
              <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
                <div className="text-base font-semibold">¿Quieres tu negocio aquí?</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Obtén el badge Recomendado y llega a miles de inversores y locales cada mes.
                </p>
                <a
                  href="/register"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-cyan"
                >
                  Registra tu Negocio
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © 2026 Medellín Social · <a href="/" className="hover:text-foreground">Inicio</a>
      </footer>
    </div>
  );
}
