import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("urbidata.user");
    if (!raw) throw redirect({ to: "/login" });
    try {
      const u = JSON.parse(raw) as { goal?: string };
      if (!u.goal) throw redirect({ to: "/onboarding" });
      throw redirect({ to: "/map" });
    } catch (e) {
      throw e;
    }
  },
  component: () => null,
});
