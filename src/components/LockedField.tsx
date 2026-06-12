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

export function useIsPro(): boolean {
  const [isPro, setIsPro] = useState(
    () => planGte(auth.get()?.plan ?? "free", "pro")
  );
  useEffect(() => {
    const handler = () => setIsPro(planGte(auth.get()?.plan ?? "free", "pro"));
    window.addEventListener("medellin-social:user", handler);
    return () => window.removeEventListener("medellin-social:user", handler);
  }, []);
  return isPro;
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
      className={`relative overflow-hidden rounded-xl ${className ?? ""}`}
      style={{ border: "0.5px solid #1D9E75", background: "#F5FFF9" }}
      title={`Disponible en ${planLabel}`}
    >
      {/* Blurred preview value */}
      <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ filter: "blur(4px)", userSelect: "none" }}>
        <span className="text-[#6B5B45]">{label}</span>
        <span className="font-semibold text-[#1A1208]">{preview ?? "——————"}</span>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70 backdrop-blur-[1px]">
        <Lock className="h-3.5 w-3.5 text-[#1D9E75]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1D9E75]">
          {planLabel}
        </span>
      </div>

      {/* CTA */}
      <a
        href="/planes"
        onClick={(e) => e.stopPropagation()}
        className="block w-full py-1.5 text-center text-[11px] font-semibold transition hover:opacity-90"
        style={{ background: "#1D9E75", color: "#FFFFFF" }}
      >
        Desbloquear
      </a>
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
