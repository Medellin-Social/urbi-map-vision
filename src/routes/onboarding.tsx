import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { auth, type Budget, type Goal, type Risk, type UserType } from "@/lib/auth";
import { apiFetch } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/config/api";
import {
  Building2, Home, KeyRound, Briefcase, Shield, ShieldHalf, Flame,
  Globe2, TrendingUp,
} from "lucide-react";

const GOAL_TO_OBJETIVO: Record<Goal, string> = {
  airbnb: "score_corto",
  "renta-larga": "score_largo",
  valorizacion: "score_largo",
  mediano_plazo: "score_mediano",
};

const BUDGET_USD: Record<Budget, string> = {
  "<200": "~$48k USD",
  "200-500": "~$48k–120k USD",
  "500-1000": "~$120k–244k USD",
  ">1000": "~$244k+ USD",
};

// Step 0 = user-type gate (no progress bar)
// Steps 1–6 = investor-only flow
const INVESTOR_STEPS = 6;

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [userType, setUserType] = useState<UserType | null>(null);

  // Investor steps
  const [budget, setBudget] = useState<Budget | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [questionA, setQuestionA] = useState<string | null>(null);
  const [questionB, setQuestionB] = useState<string | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [primeraPropiedad, setPrimeraPropiedad] = useState<boolean | null>(null);
  const [wantsAgent, setWantsAgent] = useState<boolean | null>(null);

  const handleUserType = (type: UserType) => {
    setUserType(type);
    if (type === "explorer") {
      auth.patch({ userType: "explorer" });
      navigate({ to: "/comunidad" });
    } else {
      setStep(1);
    }
  };

  const canNext = (): boolean => {
    switch (step) {
      case 1: return !!budget;
      case 2: return !!goal;
      case 3: return !!questionA;
      case 4: return !!questionB;
      case 5: return !!risk;
      case 6: return primeraPropiedad !== null && wantsAgent !== null;
      default: return false;
    }
  };

  const next = async () => {
    if (step < INVESTOR_STEPS) {
      // Reset conditional answers whenever the objective step is left
      if (step === 2) { setQuestionA(null); setQuestionB(null); }
      setStep((s) => s + 1);
      return;
    }
    // Final submit
    if (!budget || !goal || !risk || primeraPropiedad === null || wantsAgent === null) return;

    auth.patch({
      userType: userType ?? "investor",
      budget,
      goal,
      risk,
      nUnidades:         goal === "airbnb"        ? (questionA ?? undefined) : undefined,
      tipoGestion:       goal === "airbnb"        ? (questionB ?? undefined) : undefined,
      targetInquilino:   goal === "mediano_plazo" ? (questionA ?? undefined) : undefined,
      amoblado:          goal === "mediano_plazo" ? (questionB ?? undefined) : undefined,
      tipoPago:          goal === "renta-larga"   ? (questionA ?? undefined) : undefined,
      horizonteInversion:goal === "renta-larga"   ? (questionB ?? undefined) : undefined,
      primeraPropiedad,
      wantsAgent,
    });

    apiFetch(API_ENDPOINTS.onboarding, {
      method: "POST",
      body: JSON.stringify({
        presupuesto: budget,
        objetivo: GOAL_TO_OBJETIVO[goal],
        perfil_riesgo: risk,
        tipo_usuario: userType ?? "investor",
        n_unidades:          goal === "airbnb"        ? questionA : null,
        tipo_gestion:        goal === "airbnb"        ? questionB : null,
        target_inquilino:    goal === "mediano_plazo" ? questionA : null,
        amoblado:            goal === "mediano_plazo" ? questionB : null,
        tipo_pago:           goal === "renta-larga"   ? questionA : null,
        horizonte_inversion: goal === "renta-larga"   ? questionB : null,
        primera_propiedad: primeraPropiedad,
        wants_agent: wantsAgent,
      }),
    }).catch(() => {
      toast.error("No pudimos guardar tu perfil en el servidor. Puedes continuar normalmente.");
    });

    navigate({ to: "/map" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(124,58,237,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="pointer-events-none absolute -left-40 top-40 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold">Urbidata</span>
        </div>

        {/* Progress bar — only for investor steps 1–6 */}
        {step > 0 && (
          <div className="mb-8 flex items-center gap-2">
            {Array.from({ length: INVESTOR_STEPS }).map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full bg-border">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: step - 1 >= i ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            {/* ── STEP 0: User type gate ── */}
            {step === 0 && (
              <Step
                title="¿Qué te trae a Medellín Social?"
                subtitle="Personalizaremos tu experiencia según tu objetivo."
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleUserType("investor")}
                    className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface/60 p-6 text-center transition hover:border-primary/50"
                  >
                    <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary/15 text-primary">
                      <TrendingUp className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">💼 INVESTOR</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        I want to invest in real estate in the Aburrá Valley
                      </div>
                    </div>
                  </motion.button>

                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleUserType("explorer")}
                    className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface/60 p-6 text-center transition hover:border-primary/50"
                  >
                    <div className="grid h-14 w-14 place-items-center rounded-xl bg-accent/15 text-accent">
                      <Globe2 className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">🌎 EXPLORER</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        I want to discover Medellín like a local
                      </div>
                    </div>
                  </motion.button>
                </div>
              </Step>
            )}

            {/* ── STEP 1: Budget ── */}
            {step === 1 && (
              <Step
                title="¿Cuál es tu presupuesto de inversión?"
                subtitle="Lo usaremos para filtrar oportunidades en el mapa."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: "<200",    label: "< $200M COP",          hint: "Entrada al mercado" },
                      { v: "200-500", label: "$200M – $500M COP",    hint: "Apartamento típico" },
                      { v: "500-1000",label: "$500M – $1.000M COP",  hint: "Premium / 2 unidades" },
                      { v: ">1000",   label: "> $1.000M COP",        hint: "Portafolio diversificado" },
                    ] as { v: Budget; label: string; hint: string }[]
                  ).map((o) => (
                    <Choice
                      key={o.v}
                      active={budget === o.v}
                      onClick={() => setBudget(o.v)}
                      label={o.label}
                      hint={o.hint}
                      badge={BUDGET_USD[o.v]}
                    />
                  ))}
                </div>
              </Step>
            )}

            {/* ── STEP 2: Objective ── */}
            {step === 2 && (
              <Step
                title="¿Cuál es tu objetivo principal?"
                subtitle="Personalizamos la analítica según tu estrategia."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: "airbnb",       label: "Renta Corta",  hint: "Airbnb y renta corta, alta rotación",                                             Icon: KeyRound },
                      { v: "mediano_plazo",label: "Renta media",  hint: "1–6 meses: ejecutivos, nómadas digitales y profesionales en movilidad.",           Icon: Briefcase },
                      { v: "renta-larga",  label: "Renta larga",  hint: "Ingreso mensual estable",                                                          Icon: Home },
                    ] as { v: Goal; label: string; hint: string; Icon: typeof Home }[]
                  ).map((o) => (
                    <Choice
                      key={o.v}
                      active={goal === o.v}
                      onClick={() => { setGoal(o.v); setQuestionA(null); setQuestionB(null); }}
                      label={o.label}
                      hint={o.hint}
                      icon={<o.Icon className="h-5 w-5" />}
                    />
                  ))}
                </div>
              </Step>
            )}

            {/* ── STEP 3: Conditional Question A ── */}
            {step === 3 && goal === "airbnb" && (
              <Step
                title="How many units are you planning?"
                subtitle="Helps us tailor recommendations for your portfolio size."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "1 unit — personal",         hint: "Start small, learn the market" },
                      { v: "2-5 units — small portfolio",hint: "Build scale with manageable complexity" },
                      { v: "5+ units — full portfolio",  hint: "Operator-level strategy and yield targets" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionA === o.v} onClick={() => setQuestionA(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}
            {step === 3 && goal === "mediano_plazo" && (
              <Step
                title="Who is your target tenant?"
                subtitle="We'll highlight neighborhoods with the highest demand for your profile."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: "Digital nomads & remote workers",    hint: "High demand in El Poblado, Laureles" },
                      { v: "Local executives & professionals",   hint: "Stable demand, longer stays" },
                      { v: "Students",                           hint: "Lower rent, high occupancy rate" },
                      { v: "Flexible — any",                     hint: "Broader market coverage" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionA === o.v} onClick={() => setQuestionA(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}
            {step === 3 && (goal === "renta-larga" || goal === "valorizacion") && (
              <Step
                title="How are you planning to pay?"
                subtitle="This shapes which neighborhoods and deal structures we'll prioritize."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "Cash — full payment",  hint: "Maximum negotiation power, faster closing" },
                      { v: "Mortgage/financing",   hint: "Leverage to access higher-value properties" },
                      { v: "Not sure yet",          hint: "We'll show you all available options" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionA === o.v} onClick={() => setQuestionA(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}

            {/* ── STEP 4: Conditional Question B ── */}
            {step === 4 && goal === "airbnb" && (
              <Step
                title="How do you plan to manage it?"
                subtitle="Management style has a direct impact on your net yield."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "Self-managed",           hint: "Higher yield, more hands-on involvement" },
                      { v: "Hire property manager",  hint: "Passive income, lower net yield (~15–20% fee)" },
                      { v: "Not sure yet",            hint: "We'll walk you through the tradeoffs" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionB === o.v} onClick={() => setQuestionB(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}
            {step === 4 && goal === "mediano_plazo" && (
              <Step
                title="Furnished or unfurnished?"
                subtitle="Furnishing affects price, time-to-lease, and tenant type."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "Fully furnished (higher rent)",  hint: "Up to 30% premium, attracts nomads & executives" },
                      { v: "Unfurnished (easier to find)",   hint: "Lower barrier, stable long-term tenants" },
                      { v: "Flexible",                       hint: "Decide property by property" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionB === o.v} onClick={() => setQuestionB(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}
            {step === 4 && (goal === "renta-larga" || goal === "valorizacion") && (
              <Step
                title="What's your investment horizon?"
                subtitle="Your timeline shapes the risk/return profile we optimize for."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "5 years",              hint: "Focus on fastest-appreciating neighborhoods" },
                      { v: "10 years",             hint: "Balance between yield and long-term appreciation" },
                      { v: "20+ years — long term",hint: "Prioritize stability and defensive assets" },
                    ]
                  ).map((o) => (
                    <Choice key={o.v} active={questionB === o.v} onClick={() => setQuestionB(o.v)} label={o.v} hint={o.hint} />
                  ))}
                </div>
              </Step>
            )}

            {/* ── STEP 5: Risk profile ── */}
            {step === 5 && (
              <Step
                title="¿Cuál es tu perfil de riesgo?"
                subtitle="Determina qué barrios destacaremos primero."
              >
                <div className="grid grid-cols-1 gap-3">
                  {(
                    [
                      { v: "conservador", label: "Conservador", hint: "Zonas consolidadas con yields estables (El Poblado, Laureles).", Icon: Shield },
                      { v: "moderado",    label: "Moderado",    hint: "Balance entre yield y precio (Estadio, Belén).",               Icon: ShieldHalf },
                      { v: "agresivo",    label: "Agresivo",    hint: "Mayor yield potencial en zonas emergentes (El Rodeo, Robledo).", Icon: Flame },
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

            {/* ── STEP 6: Experience + Agent ── */}
            {step === 6 && (
              <div className="space-y-10">
                <Step
                  title="Is this your first property in Colombia?"
                  subtitle="We'll customize the guidance and resources we share with you."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Choice
                      active={primeraPropiedad === true}
                      onClick={() => setPrimeraPropiedad(true)}
                      label="Yes — I'm new to Colombian real estate"
                      hint="We'll assign you an agent who specializes in guiding foreign investors through the Colombian buying process."
                    />
                    <Choice
                      active={primeraPropiedad === false}
                      onClick={() => setPrimeraPropiedad(false)}
                      label="No — I've invested here before"
                      hint="Standard process, no extra hand-holding needed."
                    />
                  </div>
                </Step>

                <Step
                  title="Would you like to be contacted by a certified agent?"
                  subtitle="A local expert can help you navigate the process end-to-end."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Choice
                      active={wantsAgent === true}
                      onClick={() => setWantsAgent(true)}
                      label="Yes, connect me with an agent"
                      hint="A certified agent will reach out within 24 hours."
                    />
                    <Choice
                      active={wantsAgent === false}
                      onClick={() => setWantsAgent(false)}
                      label="No, I'll explore on my own first"
                      hint="You can always request an agent later from your profile."
                    />
                  </div>
                </Step>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation — only for investor steps */}
        {step > 0 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-30"
            >
              Atrás
            </button>
            <button
              onClick={next}
              disabled={!canNext()}
              className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none glow-cyan"
            >
              {step === INVESTOR_STEPS ? "Ir al mapa" : "Continuar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  icon?: React.ReactNode;
  badge?: string;
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
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            active ? "bg-primary/20 text-primary" : "bg-background/60 text-muted-foreground"
          }`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        {badge && (
          <div className="mt-1 text-xs font-medium text-primary/70">{badge}</div>
        )}
      </div>
    </motion.button>
  );
}
