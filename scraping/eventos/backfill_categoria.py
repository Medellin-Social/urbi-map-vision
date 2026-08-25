"""
One-off: recompute categoria for eventos currently tagged 'tech' via the
fixed word-boundary _infer_categoria(). The old substring matcher tagged
anything containing "ia"/"ai" as tech (e.g. "social", "colombia" both
contain "ia") — see normalizer.py fix. Only touches categoria='tech' rows,
the bucket reported broken; leaves other categorias untouched.

Run against prod separately after reviewing this diff (same substring bug
exists there — see project_prod_data_pipeline_gap memory pattern).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import get_conn
from normalizer import _infer_categoria

conn = get_conn()
cur = conn.cursor()
cur.execute("SELECT id, titulo, descripcion FROM eventos WHERE categoria = 'tech' AND activo = true")
rows = cur.fetchall()

changes = []
for id_, titulo, descripcion in rows:
    nueva = _infer_categoria(titulo or "", descripcion or "")
    if nueva != "tech":
        changes.append((id_, titulo, nueva))

print(f"{len(rows)} eventos categoria=tech, {len(changes)} cambian:\n")
for id_, titulo, nueva in changes:
    print(f"  [{id_}] {titulo!r} -> {nueva}")

if changes:
    cur.executemany(
        "UPDATE eventos SET categoria = %s, updated_at = NOW() WHERE id = %s",
        [(nueva, id_) for id_, _, nueva in changes],
    )
    conn.commit()
    print(f"\n{len(changes)} filas actualizadas.")
else:
    print("\nNada que actualizar.")

cur.close()
conn.close()
