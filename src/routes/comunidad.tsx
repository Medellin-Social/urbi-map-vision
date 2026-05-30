import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/comunidad")({
  component: ComunidadPage,
  head: () => ({
    meta: [{ title: "Medellín Community · Events & Local Culture" }],
  }),
});

type Event = {
  id: number;
  title: string;
  venue: string;
  neighborhood: string;
  date: string;
  time: string;
  featured: boolean;
  link: string;
};

const EVENTS: Event[] = [
  { id: 1, title: "Friday Salsa Night",          venue: "Parque Lleras",         neighborhood: "El Poblado", date: "2026-05-29", time: "9:00 PM",  featured: true,  link: "#" },
  { id: 2, title: "Laureles Organic Market",      venue: "Parque Laureles",       neighborhood: "Laureles",   date: "2026-05-31", time: "8:00 AM",  featured: true,  link: "#" },
  { id: 3, title: "Street Art Tour El Centro",    venue: "Museo de Antioquia",    neighborhood: "El Centro",  date: "2026-06-01", time: "10:00 AM", featured: true,  link: "#" },
  { id: 4, title: "Coffee Tasting at Pergamino",  venue: "Pergamino Café",        neighborhood: "El Poblado", date: "2026-05-30", time: "3:00 PM",  featured: false, link: "#" },
  { id: 5, title: "Sunset Rooftop Drinks",        venue: "Azul Rooftop",          neighborhood: "Envigado",   date: "2026-05-31", time: "6:00 PM",  featured: false, link: "#" },
  { id: 6, title: "Robledo Community Fair",       venue: "Plaza Principal",       neighborhood: "Robledo",    date: "2026-06-01", time: "10:00 AM", featured: false, link: "#" },
  { id: 7, title: "Morning Yoga in the Park",     venue: "Parque El Poblado",     neighborhood: "El Poblado", date: "2026-06-07", time: "7:00 AM",  featured: false, link: "#" },
  { id: 8, title: "Live Jazz Night",              venue: "Blues Brothers Bar",    neighborhood: "Laureles",   date: "2026-06-06", time: "8:00 PM",  featured: false, link: "#" },
  { id: 9, title: "Sabaneta Food Festival",       venue: "Parque Principal",      neighborhood: "Sabaneta",   date: "2026-06-13", time: "12:00 PM", featured: false, link: "#" },
];

const TODAY = new Date("2026-05-28");
const WEEK_END = new Date("2026-06-04");
const MONTH_END = new Date("2026-06-28");

const TIME_TABS = [
  { id: "all",   label: "Upcoming" },
  { id: "week",  label: "This Week" },
  { id: "month", label: "This Month" },
] as const;

const HOOD_TABS = [
  { id: "all",        label: "All" },
  { id: "El Poblado", label: "El Poblado" },
  { id: "Laureles",   label: "Laureles" },
  { id: "Envigado",   label: "Envigado" },
  { id: "other",      label: "Other" },
] as const;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function EventCard({ event, prominent = false }: { event: Event; prominent?: boolean }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5 ${
        prominent
          ? "border-primary/40 bg-surface shadow-[0_0_40px_-12px_rgba(0,212,255,0.3)]"
          : "border-border/50 bg-surface/40 hover:border-border/80"
      }`}
    >
      {event.featured && (
        <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground glow-cyan">
          Featured
        </span>
      )}
      <div className="text-[10px] font-bold uppercase tracking-wider text-primary">{event.neighborhood}</div>
      <h3 className="mt-1.5 font-display text-base font-bold leading-snug pr-16">{event.title}</h3>
      <div className="mt-2 text-xs text-muted-foreground">{event.venue}</div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">📅 {formatDate(event.date)}</span>
        <span>🕐 {event.time}</span>
      </div>
      <a
        href={event.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition hover:underline"
      >
        View details <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function ComunidadPage() {
  const [timeFilter, setTimeFilter] = useState<"all" | "week" | "month">("all");
  const [hoodFilter, setHoodFilter] = useState("all");

  const featured = EVENTS.filter((e) => e.featured);

  const regular = EVENTS.filter((e) => {
    if (e.featured) return false;
    const d = new Date(e.date);
    if (timeFilter === "week"  && d > WEEK_END)  return false;
    if (timeFilter === "month" && d > MONTH_END) return false;
    if (d < TODAY) return false;
    if (hoodFilter !== "all" && hoodFilter !== "other" && e.neighborhood !== hoodFilter) return false;
    if (hoodFilter === "other" && ["El Poblado", "Laureles", "Envigado"].includes(e.neighborhood)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />

      <main className="pt-16">
        {/* Header */}
        <section className="border-b border-border/40 bg-surface/20 px-4 py-12 text-center sm:px-6">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">🌎 Community</span>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Medellín Community</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Events, meetups and local experiences across the Aburrá Valley — curated by
              people who actually live here.
            </p>
          </Reveal>
        </section>

        {/* Featured Events */}
        <section className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="font-display text-xl font-bold">
                ✨ Featured Events
                <span className="ml-2 text-sm font-normal text-muted-foreground">— sponsored spots</span>
              </h2>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((e, i) => (
                <Reveal key={e.id} delay={i * 80}>
                  <EventCard event={e} prominent />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* All Events */}
        <section className="border-t border-border/40 px-4 pb-20 pt-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="font-display text-xl font-bold">All Events</h2>
            </Reveal>

            {/* Filters */}
            <div className="mt-5 flex flex-wrap gap-2">
              {TIME_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTimeFilter(t.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    timeFilter === t.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <div className="h-5 w-px self-center bg-border/60 mx-1" />
              {HOOD_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setHoodFilter(t.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    hoodFilter === t.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {regular.length === 0 ? (
              <div className="mt-16 text-center text-sm text-muted-foreground">
                No events match the current filters.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {regular.map((e, i) => (
                  <Reveal key={e.id} delay={i * 60}>
                    <EventCard event={e} />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © 2026 Medellín Social · <a href="/" className="hover:text-foreground">Home</a>
      </footer>
    </div>
  );
}
