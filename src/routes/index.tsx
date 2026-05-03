import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
    let goal: string | undefined;
    try {
      goal = (JSON.parse(raw) as { goal?: string }).goal;
    } catch {
      throw redirect({ to: "/login" });
    }
    if (!goal) throw redirect({ to: "/onboarding" });
    throw redirect({ to: "/map" });
  },
  component: () => null,
});
