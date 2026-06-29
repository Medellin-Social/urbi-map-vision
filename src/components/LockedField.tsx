import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { auth } from "@/lib/auth";

const _PLAN_ORDEN = ["free", "pro", "agente"] as const;
type PlanId = (typeof _PLAN_ORDEN)[number];

function planGte(planUsuario: string, planMinimo: PlanId): boolean {
  const idx = _PLAN_ORDEN.indexOf(planUsuario as PlanId);
  const req = _PLAN_ORDEN.indexOf(planMinimo);
  return idx >= req && idx !== -1;
}

// No Pro plan anymore — the MLS is free for everyone. Every ex-Pro feature
// (price range, historial, yield, comparador, simulador) is now open. The only
// agent-exclusive data (buena_oferta / pct_bajo_mediana) is gated server-side
// (nulled for non-agents), so those badges hide via missing data, not this flag.
// Kept as a hook so the ~40 existing `isPro` call sites need no change.
export function useIsPro(): boolean {
  return true;
}

export function useIsAgente(): boolean {
  const [isAgente, setIsAgente] = useState(
    () => auth.get()?.plan === "agente"
  );
  useEffect(() => {
    const handler = () => setIsAgente(auth.get()?.plan === "agente");
    window.addEventListener("medellin-social:user", handler);
    return () => window.removeEventListener("medellin-social:user", handler);
  }, []);
  return isAgente;
}

const _PLAN_LABEL: Record<PlanId, string> = {
  free: "Free",
  pro: "MLS Pro",
  agente: "Plan Agente",
};

type Props = {
  label: string;
  preview?: string;
  className?: string;
  planRequerido?: PlanId;
};

export function LockedField({ label, preview, className, planRequerido = "pro" }: Props) {
  const planLabel = _PLAN_LABEL[planRequerido];
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className ?? ""}`}
      style={{ border: "0.5px solid #E8E0D0", background: "#F5F0E8", minHeight: 40 }}
      title={`Disponible en ${planLabel}`}
    >
      {/* Blurred content */}
      <div className="flex items-center justify-between px-3 py-2.5 text-sm" style={{ filter: "blur(3px)", userSelect: "none" }}>
        <span className="text-[#6B5B45]">{label}</span>
        <span className="font-semibold text-[#1A1208]">{preview ?? "———"}</span>
      </div>
      {/* Compact lock overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-3 bg-white/60 backdrop-blur-[1px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock className="h-3 w-3 shrink-0 text-[#9B8B75]" />
          <span className="text-[11px] text-[#6B5B45] truncate">{label}</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9B8B75] shrink-0 ml-2">
          {planLabel}
        </span>
      </div>
    </div>
  );
}

/** Render children if user has the required plan, otherwise show LockedField */
export function ProGate({
  label,
  preview,
  children,
  planRequerido = "pro",
}: {
  label: string;
  preview?: string;
  children: React.ReactNode;
  planRequerido?: PlanId;
}) {
  const plan = auth.get()?.plan ?? "free";
  const [hasPlan, setHasPlan] = useState(() => planGte(plan, planRequerido));
  useEffect(() => {
    const handler = () => setHasPlan(planGte(auth.get()?.plan ?? "free", planRequerido));
    window.addEventListener("medellin-social:user", handler);
    return () => window.removeEventListener("medellin-social:user", handler);
  }, [planRequerido]);

  if (hasPlan) return <>{children}</>;
  return <LockedField label={label} preview={preview} planRequerido={planRequerido} />;
}
