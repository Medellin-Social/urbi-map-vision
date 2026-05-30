import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { LanguageProvider } from "@/lib/i18n";
import { refreshIfExpiringSoon } from "@/lib/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist on Medellín Social.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Medellín Social · Where Smart Investors Meet Local Culture" },
      { name: "description", content: "The only platform that combines real estate intelligence with authentic local experiences in Medellín and the Aburrá Valley." },
      { name: "author", content: "Medellín Social" },
      { property: "og:title", content: "Medellín Social · Where Smart Investors Meet Local Culture" },
      { property: "og:description", content: "Real estate intelligence meets local culture in Medellín and the Aburrá Valley." },
      { property: "og:image", content: "https://urbidata.co/og-image.png" },
      { name: "twitter:image", content: "https://urbidata.co/og-image.png" },
      { property: "og:url", content: "https://urbidata.co" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => { refreshIfExpiringSoon(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Outlet />
        <Toaster />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
