// Mapbox PUBLIC token (pk.*). Safe to ship in the client bundle.
// VITE_MAPBOX_TOKEN (build arg en Dockerfile) gana; el literal queda como
// fallback para dev local sin .env.
export const MAPBOX_TOKEN: string =
  import.meta.env.VITE_MAPBOX_TOKEN || "pk.eyJ1IjoidXJiaWRhdGEiLCJhIjoiY21vcGY0bXlkMDdleTJxb2lzdjh5cDh2YSJ9.QS8YJWC5kvX5JoILBUlR0w";
