// Mapbox public token (pk.*). Safe to ship in the client bundle.
// Reads from VITE_MAPBOX_PUBLIC_TOKEN or MAPBOX_PUBLIC_TOKEN at build time.
const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

export const MAPBOX_TOKEN: string =
  env.VITE_MAPBOX_PUBLIC_TOKEN ||
  env.MAPBOX_PUBLIC_TOKEN ||
  (typeof window !== "undefined" && (window as unknown as { __MAPBOX_TOKEN__?: string }).__MAPBOX_TOKEN__) ||
  "pk.REPLACE_ME";
