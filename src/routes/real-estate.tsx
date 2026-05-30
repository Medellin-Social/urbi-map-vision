import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Map as MapIcon } from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/real-estate")({
  component: RealEstatePage,
  head: () => ({
    meta: [{ title: "Certified Agents · Medellín Social" }],
  }),
});

type Agent = {
  name: string;
  agency: string;
  specialty: string;
  neighborhoods: string[];
  transactions: number;
  initials: string;
  avatarColor: string;
  whatsapp: string;
  email: string;
};

const AGENTS: Agent[] = [
  {
    name: "Ken Richardson",
    agency: "Medellín Realty Group",
    specialty: "Airbnb / Short-term Rental",
    neighborhoods: ["El Poblado", "Laureles", "Boston"],
    transactions: 47,
    initials: "KR",
    avatarColor: "bg-blue-700",
    whatsapp: "+1 305 555 0142",
    email: "ken@medellinrealty.co",
  },
  {
    name: "Carlos Rodríguez",
    agency: "Invest Medellín",
    specialty: "Long-term Rental",
    neighborhoods: ["Robledo", "El Rodeo", "Aranjuez"],
    transactions: 82,
    initials: "CR",
    avatarColor: "bg-emerald-700",
    whatsapp: "+57 300 555 0183",
    email: "carlos@investmedellin.co",
  },
  {
    name: "María F. Gómez",
    agency: "Valle Real Estate",
    specialty: "Mid-term / Digital Nomads",
    neighborhoods: ["Envigado", "Sabaneta", "Itagüí"],
    transactions: 35,
    initials: "MG",
    avatarColor: "bg-purple-700",
    whatsapp: "+57 312 555 0271",
    email: "maria@vallerealstate.co",
  },
  {
    name: "David Park",
    agency: "Medellín Realty Group",
    specialty: "Airbnb / New Construction",
    neighborhoods: ["El Poblado", "Boston", "Manila"],
    transactions: 61,
    initials: "DP",
    avatarColor: "bg-amber-700",
    whatsapp: "+82 10 5555 0194",
    email: "david@medellinrealty.co",
  },
];

const HOW_IT_WORKS = [
  {
    emoji: "🗺️",
    title: "Choose your neighborhood on the map",
    body: "Browse 606 neighborhoods across the Aburrá Valley, each scored for investment potential.",
  },
  {
    emoji: "🤝",
    title: "Get matched with a certified agent",
    body: "We connect you with a verified local agent who specializes in your target neighborhood.",
  },
  {
    emoji: "✅",
    title: "Your investment is guaranteed",
    body: "Certified agents guide you through legal, notarial and financial steps — end to end.",
  },
];

function AgentCard({ agent }: { agent: Agent }) {
  const waLink = `https://wa.me/${agent.whatsapp.replace(/\D/g, "")}`;
  const mailLink = `mailto:${agent.email}`;

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-surface/50 p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface">
      <div className="flex items-start gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${agent.avatarColor} font-display text-lg font-bold text-white`}>
          {agent.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-bold">{agent.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success ring-1 ring-success/30">
              <CheckCircle2 className="h-3 w-3" /> Certified
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{agent.agency}</div>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20 shrink-0">Specialty</span>
          <span className="text-xs">{agent.specialty}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20 shrink-0">Areas</span>
          <span className="text-xs">{agent.neighborhoods.join(" · ")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20 shrink-0">Deals</span>
          <span className="text-xs font-semibold text-primary">{agent.transactions} transactions</span>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success/15 py-2 text-xs font-semibold text-success ring-1 ring-success/30 transition hover:bg-success/25"
        >
          💬 WhatsApp
        </a>
        <a
          href={mailLink}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          ✉️ Email
        </a>
      </div>
    </div>
  );
}

function RealEstatePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />

      <main className="pt-16">
        {/* Header */}
        <section className="border-b border-border/40 bg-surface/20 px-4 py-12 text-center sm:px-6">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-success">🏠 Real Estate</span>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Certified Real Estate Agents</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Work with verified professionals who guarantee your entire buying process —
              from neighborhood selection to signing the deed.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <Link
              to="/map"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 glow-cyan"
            >
              <MapIcon className="h-4 w-4" /> View Investment Map <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </section>

        {/* Agents grid */}
        <section className="px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <h2 className="font-display text-xl font-bold">Our Certified Agents</h2>
            </Reveal>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {AGENTS.map((a, i) => (
                <Reveal key={a.name} delay={i * 80}>
                  <AgentCard agent={a} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border/40 bg-surface/10 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <Reveal className="text-center">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">How It Works</h2>
            </Reveal>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {HOW_IT_WORKS.map((s, i) => (
                <Reveal key={s.title} delay={i * 100}>
                  <div className="text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-2xl shadow-[0_0_24px_-8px_rgba(0,212,255,0.4)]">
                      {s.emoji}
                    </div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Step {i + 1}</div>
                    <h3 className="mt-2 text-sm font-bold">{s.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Apply CTA */}
        <section className="border-t border-border/40 px-4 py-14 text-center sm:px-6">
          <Reveal>
            <h2 className="font-display text-xl font-bold">Are you a local agent?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Join our network. Get a certified badge, enriched listings with automatic CMA reports
              and direct access to global investors.
            </p>
            <Link
              to="/register"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-success/50 bg-success/10 px-5 py-2.5 text-sm font-semibold text-success transition hover:bg-success/20"
            >
              Apply as Agent <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © 2026 Medellín Social · <a href="/" className="hover:text-foreground">Home</a>
      </footer>
    </div>
  );
}
