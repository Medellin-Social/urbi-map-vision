#!/usr/bin/env bash
# Corre el scraper de Metrocuadrado para todos los municipios del Valle de Aburrá.
# Ejecutar desde urbi-map-vision/ — requiere que /home/edwlearn/urbi/ esté presente.
#
# Uso:
#   bash scripts/scrape_metrocuadrado_todos.sh           # scrape completo
#   bash scripts/scrape_metrocuadrado_todos.sh --dry-run # sin escritura a DB

set -euo pipefail

URBI_DIR="/home/edwlearn/urbi"
DRY_RUN="${1:-}"

MUNICIPIOS=(medellin bello envigado itagui sabaneta la-estrella)

cd "$URBI_DIR"

for MUN in "${MUNICIPIOS[@]}"; do
  echo ""
  echo "══════════════════════════════════════"
  echo "  Scraping: $MUN"
  echo "══════════════════════════════════════"
  if [ "$DRY_RUN" = "--dry-run" ]; then
    python -m scraping.metrocuadrado.scraper --city "$MUN" --max-pages 200 --dry-run
  else
    python -m scraping.metrocuadrado.scraper --city "$MUN" --max-pages 200
  fi
  echo "  ✓ $MUN completado"
  # Brief pause between cities
  sleep 10
done

echo ""
echo "══════════════════════════════════════"
echo "  Todos los municipios completados"
echo "══════════════════════════════════════"

if [ "$DRY_RUN" != "--dry-run" ]; then
  echo ""
  echo "Siguiente paso — geocodificar y exportar:"
  echo "  cd $URBI_DIR && python scripts/geocode_listings.py --table raw.listings_metrocuadrado"
  echo "  cd /home/edwlearn/urbi-map-vision && python scripts/enrich_barrios_stats.py"
fi
