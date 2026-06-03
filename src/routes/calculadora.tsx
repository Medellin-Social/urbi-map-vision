import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/calculadora")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/simulador",
      search: location.search as Record<string, unknown>,
      replace: true,
    });
  },
});
