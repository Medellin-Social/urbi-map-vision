import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar, ProfileChipMobile } from "@/components/Navbar";
import { MapView } from "@/components/MapView";
import { FloatingPanel } from "@/components/FloatingPanel";
import { OpportunitiesPanel } from "@/components/OpportunitiesPanel";
import type { Neighborhood } from "@/lib/adapters";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: MapPage,
});

const GOAL_TO_PERFIL: Record<string, string> = {
  airbnb: "airbnb",
  "renta-larga": "largo_plazo",
  valorizacion: "largo_plazo",
  mediano_plazo: "mediano_plazo",
  nomadas: "mediano_plazo", // legacy alias
};

function MapPage() {
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [mostrarOportunidades, setMostrarOportunidades] = useState(
    () => auth.get()?.mostrarOportunidades ?? false
  );
  const perfil = GOAL_TO_PERFIL[auth.get()?.goal ?? ""] as string | undefined;

  // Sync when user changes the preference in Settings
  useEffect(() => {
    const sync = () => setMostrarOportunidades(auth.get()?.mostrarOportunidades ?? false);
    window.addEventListener("urbidata:user", sync);
    return () => window.removeEventListener("urbidata:user", sync);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <MapView
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        perfil={perfil}
        mostrarOportunidades={mostrarOportunidades}
      />
      {/* Top gradient for readability */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background/80 to-transparent" />
      <Navbar />
      <ProfileChipMobile />
      <FloatingPanel selected={selected} onClear={() => setSelected(null)} onSelect={setSelected} />
      <OpportunitiesPanel onSelect={setSelected} perfil={perfil} mostrarOportunidades={mostrarOportunidades} />
    </div>
  );
}
