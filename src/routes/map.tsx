import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar, ProfileChipMobile } from "@/components/Navbar";
import { MapView } from "@/components/MapView";
import { FloatingPanel } from "@/components/FloatingPanel";
import { OpportunitiesPanel } from "@/components/OpportunitiesPanel";
import type { Neighborhood } from "@/data/neighborhoods";

export const Route = createFileRoute("/map")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
  },
  component: MapPage,
});

function MapPage() {
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <MapView selectedId={selected?.id ?? null} onSelect={setSelected} />
      {/* Top gradient for readability */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background/80 to-transparent" />
      <Navbar />
      <ProfileChipMobile />
      <FloatingPanel selected={selected} onClear={() => setSelected(null)} />
      <OpportunitiesPanel onSelect={setSelected} />
    </div>
  );
}
