export function formatCOP(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${Math.round(abs / 1_000_000).toLocaleString("es-CO")}M COP`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K COP`;
  return `${sign}$${abs.toLocaleString("es-CO")} COP`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function yieldColor(y: number | null | undefined): string {
  if (y == null) return "#6E726E";
  if (y > 10) return "#0F8A4F";
  if (y >= 7) return "#0A5C36";
  if (y >= 5) return "#8A6A00";
  return "#CE1126";
}

export function yieldLabel(y: number | null | undefined): string {
  if (y == null) return "Sin datos";
  if (y > 10) return "Excelente";
  if (y >= 7) return "Bueno";
  if (y >= 5) return "Moderado";
  return "Bajo";
}
