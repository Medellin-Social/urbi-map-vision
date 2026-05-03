// Mapbox public token (pk.*). Safe to ship in the client bundle.
// Replace this with your own token from https://account.mapbox.com/
export const MAPBOX_TOKEN =
  (typeof window !== "undefined" && (window as unknown as { __MAPBOX_TOKEN__?: string }).__MAPBOX_TOKEN__) ||
  "pk.REPLACE_ME";
