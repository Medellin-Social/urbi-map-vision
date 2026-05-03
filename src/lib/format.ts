export function formatCOP(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B COP`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M COP`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K COP`;
  return `$${n.toLocaleString("es-CO")} COP`;
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function yieldColor(y: number): string {
  if (y > 10) return "#10b981";
  if (y >= 7) return "#00d4ff";
  if (y >= 5) return "#f59e0b";
  return "#ef4444";
}

export function yieldLabel(y: number): string {
  if (y > 10) return "Excelente";
  if (y >= 7) return "Bueno";
  if (y >= 5) return "Moderado";
  return "Bajo";
}
