import { useCallback, useEffect, useState } from "react";

export type AreaUnit = "m2" | "sqft";

const KEY = "medellin-social.unit";
const EVENT = "medellin-social:unit-change";

function readStored(): AreaUnit {
  if (typeof window === "undefined") return "m2";
  return (localStorage.getItem(KEY) as AreaUnit | null) ?? "m2";
}

// Cross-instance sync: multiple components call useUnit() independently (no
// context provider, like the price/lang toggles don't need one either) — a
// custom event keeps them in lockstep when one toggles.
export function useUnit() {
  const [unit, setUnitState] = useState<AreaUnit>(readStored);

  useEffect(() => {
    const onChange = () => setUnitState(readStored());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setUnit = useCallback((u: AreaUnit) => {
    localStorage.setItem(KEY, u);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const toggle = useCallback(() => setUnit(unit === "m2" ? "sqft" : "m2"), [unit, setUnit]);

  return { unit, setUnit, toggle };
}

// m² is canonical everywhere (DB, filters); sqft is display-only.
export function formatArea(m2: number, unit: AreaUnit): string {
  if (unit === "sqft") return `${Math.round(m2 * 10.7639)}ft²`;
  return `${m2}m²`;
}
