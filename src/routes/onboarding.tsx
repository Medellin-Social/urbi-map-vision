import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { auth, type Budget, type Goal, type Risk } from "@/lib/auth";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";

const GOAL_TO_OBJETIVO: Record<Goal, string> = {
  airbnb: "airbnb",
  "renta-larga": "largo_plazo",
  valorizacion: "largo_plazo",
  nomadas: "nomadas",
};
import { Building2, Home, KeyRound, TrendingUp, Briefcase, Shield, ShieldHalf, Flame } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);

  const next = async () => {
    if (step === 2) {
      if (budget && goal && risk) {
        auth.patch({ budget, goal, risk });
        // Fire-and-forget: persist to backend, don't block navigation
        apiFetch(API_ENDPOINTS.onboarding, {
          method: "POST",
          body: JSON.stringify({
            presupuesto: budget,
            objetivo: GOAL_TO_OBJETIVO[goal],
            perfil_riesgo: risk,
          }),
        }).catch(() => {
          toast.error("No pudimos guardar tu perfil en el servidor. Puedes continuar normalmente.");
        });
        navigate({ to: "/map" });
      }
      return;
    }
    setStep((s) => s + 1);
  };

  const canNext = (step === 0 && budget) || (step === 1 && goal) || (step === 2 && risk);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(124,58,237,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,.6) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      <div className="pointer-events-none absolute -left-40 top-40 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">Urbidata</span>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-border">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: step >= i ? "100%" : "0%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <Step
                title="¿Cuál es tu presupuesto de inversión?"
                subtitle="Lo usaremos para filtrar oportunidades en el mapa."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: "<200", label: "< $200M COP", hint: "Entrada al mercado" },
                      { v: "200-500", label: "$200M – $500M COP", hint: "Apartamento típico" },
                      { v: "500-1000", label: "$500M – $1.000M COP", hint: "Premium / 2 unidades" },
                      { v: ">1000", label: "> $1.000M COP", hint: "Portafolio diversificado" },
                    ] as { v: Budget; label: string; hint: string }[]
                  ).map((o) => (
                    <Choice key={o.v} active={budget === o.v} onClick={() => setBudget(o.v)} label={o.label} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}

            {step === 1 && (
              <Step
                title="¿Cuál es tu objetivo principal?"
                subtitle="Personalizamos la analítica según tu estrategia."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: "airbnb", label: "Airbnb", hint: "Renta corta, alta rotación", Icon: KeyRound },
                      { v: "renta-larga", label: "Renta larga", hint: "Ingreso mensual estable", Icon: Home },
                      { v: "valorizacion", label: "Valorización", hint: "Apreciación a 5–10 años", Icon: TrendingUp },
                      { v: "nomadas", label: "Nómadas", hint: "Mid-term, ejecutivos", Icon: Briefcase },
                    ] as { v: Goal; label: string; hint: string; Icon: typeof Home }[]
                  ).map((o) => (
                    <Choice
                      key={o.v}
                      active={goal === o.v}
                      onClick={() => setGoal(o.v)}
                      label={o.label}
                      hint={o.hint}
                      icon={<o.Icon className="h-5 w-5" />}
                    />
                  ))}
                </div>
              </Step>
            )}

            {step === 2 && (
              <Step
                title="¿Cuál es tu perfil de riesgo?"
                subtitle="Determina qué barrios destacaremos primero."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "conservador", label: "Conservador", hint: "Zonas consolidadas con yields estables (El Poblado, Laureles).", Icon: Shield },
                      { v: "moderado", label: "Moderado", hint: "Balance entre yield y precio (Estadio, Belén).", Icon: ShieldHalf },
                      { v: "agresivo", label: "Agresivo", hint: "Mayor yield potencial en zonas emergentes (El Rodeo, Robledo).", Icon: Flame },
                    ] as { v: Risk; label: string; hint: string; Icon: typeof Shield }[]
                  ).map((o) => (
                    <Choice
                      key={o.v}
                      active={risk === o.v}
                      onClick={() => setRisk(o.v)}
                      label={o.label}
                      hint={o.hint}
                      icon={<o.Icon className="h-5 w-5" />}
                    />
                  ))}
                </div>
              </Step>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-30"
          >
            Atrás
          </button>
          <button
            onClick={next}
            disabled={!canNext}
            className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none glow-cyan"
          >
            {step === 2 ? "Ir al mapa" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  label,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
        active
          ? "border-primary bg-primary/10 glow-cyan"
          : "border-border bg-surface/60 hover:border-primary/50"
      }`}
    >
      {icon && (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? "bg-primary/20 text-primary" : "bg-background/60 text-muted-foreground"}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </div>
    </motion.button>
  );
}
