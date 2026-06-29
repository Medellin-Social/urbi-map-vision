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
