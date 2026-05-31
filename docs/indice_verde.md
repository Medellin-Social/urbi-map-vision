# Índice Verde (indice_verde_pct)

## Fuente de datos

**Tabla de salida:** `analytics.barrios_verde`  
**Script:** `scripts/compute_barrios_verde.py`  
**Datos de entrada:** `raw.pois` (tipo = 'parque') + `raw.barrios` (geometría)  
**Fuente original de parques:** OpenStreetMap vía Overpass API (`scripts/load_pois_overpass.py`)

---

## Metodología

```
n_parques               = COUNT de raw.pois donde tipo='parque' y ST_Within(poi, barrio)
area_barrio_m2          = ST_Area(barrio.geometry::geography)
area_parques_estimada   = n_parques × 5.000 m²  (estimado fijo por parque)
indice_verde_pct        = area_parques_estimada / area_barrio_m2 × 100
```

**Limitación:** El área de cada parque es una estimación fija de 5.000 m² (≈ 70×70 m).
No usa el polígono real del parque porque OSM clasifica muchos como puntos (nodes) sin área.
El valor real puede ser mayor o menor según el tamaño del parque.

---

## Categorías y scores

| Umbral `indice_verde_pct` | Categoría | `score_verde` |
|--------------------------|-----------|---------------|
| ≥ 20% | MUY VERDE | 15 |
| ≥ 10% | VERDE | 10 |
| ≥ 5% | MODERADO | 6 |
| < 5% | POCO VERDE | 2 |

---

## Cobertura

- 610 barrios (Medellín + Valle de Aburrá completo)
- 610/610 tienen valor (incluso si es 0%)
- Última ejecución: 2026-05-28

---

## Cómo actualizar

```bash
# 1. Actualizar POIs desde OSM (si los parques cambiaron)
python scripts/load_pois_overpass.py --tipo parque

# 2. Recalcular índice verde
python scripts/compute_barrios_verde.py

# Dry-run para preview:
python scripts/compute_barrios_verde.py --dry-run
```

---

## Limitaciones conocidas

- **OSM data freshness:** Los parques de OSM pueden estar desactualizados. Verificar con
  `SELECT MAX(scraped_at) FROM raw.pois WHERE tipo='parque'` si existe esa columna.
- **Área fija:** Parques grandes (Parque Arví, El Poblado) y pequeños reciben el mismo
  peso de 5.000 m². El índice es una proxy, no una medición GIS precisa.
- **Sin plazas ni zonas verdes privadas:** Solo cuenta parques públicos en OSM.
  Conjuntos cerrados con zonas verdes no están incluidos.
