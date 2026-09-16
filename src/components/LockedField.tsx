import { useEffect, useState } from "react";
import { auth } from "@/lib/auth";

// No Pro plan anymore — the MLS is free for everyone. Every ex-Pro feature
// (price range, historial, yield, comparador, simulador) is now open. The only
// agent-exclusive data (buena_oferta / pct_bajo_mediana) is gated server-side
// (nulled for non-agents), so those badges hide via missing data, not this flag.
// Kept as a hook so the existing `isPro` call sites need no change.
export function useIsPro(): boolean {
  return true;
}

// True for the "agente" paid plan OR a real agent/agency row (mirrors
// api/dependencies.py:is_agente) — covers both agente y agencia accounts,
// since agency owners/members are agent rows too.
function _checkIsAgente(): boolean {
  const u = auth.get();
  return u?.plan === "agente" || u?.esAgente === true;
}

export function useIsAgente(): boolean {
  const [isAgente, setIsAgente] = useState(_checkIsAgente);
  useEffect(() => {
    const handler = () => setIsAgente(_checkIsAgente());
    window.addEventListener("medellin-social:user", handler);
    return () => window.removeEventListener("medellin-social:user", handler);
  }, []);
  return isAgente;
}
