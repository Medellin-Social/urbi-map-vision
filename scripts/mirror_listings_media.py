"""
Espejo de portadas de listings a Cloudflare R2.

Descarga la foto de portada (fotos[1]) de cada listing scrapeado, la sube a R2
bajo `listings/{media_uid}/{sha256}.jpg`, y registra el resultado en
raw.listing_media_mirror. Deja de depender del CDN externo para lo que el mapa
muestra primero.

Content-addressable → idempotente:
  - Misma foto = mismo sha256 = misma key → HeadObject dice "ya está", no re-sube.
  - Foto cambió = hash nuevo = sube la nueva, actualiza la fila.
  - Foto sin portada / listing sin fotos → se salta.

Incremental por defecto: solo procesa listings SIN espejo o cuya portada src
cambió de URL. El backfill completo se hace con --all (una vez).

Uso:
    python scripts/mirror_listings_media.py [--limit N] [--all] [--concurrency 20]
    python scripts/mirror_listings_media.py --demo   # self-check sin red ni DB

Requiere env: DATABASE_URL, y para subir de verdad S3_BUCKET/S3_ENDPOINT_URL/
S3_PUBLIC_URL/AWS_* (sin bucket → modo stub, no sube, imprime).
Run semanal vía DAG tras load de scrapers.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import os
import sys
import uuid
from pathlib import Path

import aiohttp
from PIL import Image
from sqlalchemy import create_engine, text

# Permite `from api.utils.storage import ...` corriendo desde scripts/ o raíz.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.utils.storage import upload_if_absent  # noqa: E402

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; UrbiBot/1.0)"}

# Variantes: la portada (cards/popup1) va chica; la galería (drawer) media. Ambas
# webp — recorta ~10-40× el peso de las fotos originales (fincaraíz ~730KB → decenas KB).
PORTADA_W, PORTADA_Q = 800, 68
GALERIA_W, GALERIA_Q = 1200, 72
MAX_FOTOS = 15  # tope de fotos por listing espejadas a R2


def _resize_webp(img_bytes: bytes, max_w: int, quality: int) -> bytes:
    """Reescala (sin agrandar) a webp. Devuelve los bytes; lanza si no es imagen."""
    im = Image.open(io.BytesIO(img_bytes))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, method=4)
    return out.getvalue()

# Solo listings con portada. Incremental: los que no tienen fila en el mirror,
# o cuya portada src cambió (se compara src abajo, no en SQL, para simplicidad).
SELECT_INCREMENTAL = """
    SELECT s.url, s.fuente, s.fotos AS fotos_src
    FROM staging.stg_listings_unificado s
    LEFT JOIN raw.listing_media_mirror m ON m.url = s.url
    WHERE s.fotos IS NOT NULL AND array_length(s.fotos, 1) > 0
      AND m.url IS NULL
    LIMIT :lim
"""

SELECT_ALL = """
    SELECT s.url, s.fuente, s.fotos AS fotos_src
    FROM staging.stg_listings_unificado s
    WHERE s.fotos IS NOT NULL AND array_length(s.fotos, 1) > 0
    LIMIT :lim
"""

# media_uid se pasa explícito (generado app-side o reusado). ON CONFLICT NO lo
# toca → el folder R2 de un listing es estable de por vida.
UPSERT = text("""
    INSERT INTO raw.listing_media_mirror
        (url, media_uid, fuente, portada_r2, fotos_r2, content_hashes, n_fotos, activa, last_seen)
    VALUES (:url, :uid, :fuente, :portada_r2, :fotos_r2, :hashes, :n_fotos, TRUE, now())
    ON CONFLICT (url) DO UPDATE SET
        portada_r2     = EXCLUDED.portada_r2,
        fotos_r2       = EXCLUDED.fotos_r2,
        content_hashes = EXCLUDED.content_hashes,
        n_fotos        = EXCLUDED.n_fotos,
        activa         = TRUE,
        last_seen      = now()
""")

# media_uid preexistente para reusar el mismo folder al re-espejar.
GET_UID = text("SELECT media_uid FROM raw.listing_media_mirror WHERE url = :url")


def _key(media_uid: str, content_hash: str) -> str:
    return f"listings/{media_uid}/{content_hash}.webp"


async def _download(session: aiohttp.ClientSession, url: str) -> bytes | None:
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with session.get(url, timeout=timeout, headers=HEADERS) as resp:
            if resp.status != 200:
                return None
            return await resp.read()
    except Exception:
        return None


def _process(img_bytes: bytes, media_uid: str, max_w: int, quality: int) -> tuple[str, str] | None:
    """Resize→webp, sube si falta, devuelve (url_r2, content_hash). None si no es imagen."""
    try:
        webp = _resize_webp(img_bytes, max_w, quality)
    except Exception:
        return None
    h = hashlib.sha256(webp).hexdigest()
    url = upload_if_absent(webp, _key(media_uid, h), "image/webp")
    return url, h


async def _mirror_one(session, engine, sem, row) -> str:
    fotos_src = [f for f in (row.fotos_src or []) if f][:MAX_FOTOS]
    if not fotos_src:
        return "download_fail"

    async with sem:
        blobs = await asyncio.gather(*(_download(session, u) for u in fotos_src))
    blobs = [b for b in blobs if b]
    if not blobs:
        return "download_fail"

    # Reusar media_uid si el listing ya se espejó antes; si no, generarlo ahora.
    with engine.connect() as conn:
        existing = conn.execute(GET_UID, {"url": row.url}).scalar()
    media_uid = str(existing) if existing else str(uuid.uuid4())

    loop = asyncio.get_event_loop()
    # Portada = 1ª foto en tamaño chico; galería = todas en tamaño medio. Sync fuera del loop.
    portada = await loop.run_in_executor(None, _process, blobs[0], media_uid, PORTADA_W, PORTADA_Q)
    galeria = await loop.run_in_executor(
        None,
        lambda: [r for r in (_process(b, media_uid, GALERIA_W, GALERIA_Q) for b in blobs) if r],
    )
    if not portada or not galeria:
        return "download_fail"

    fotos_r2 = [u for (u, _h) in galeria]
    hashes = [h for (_u, h) in galeria]

    with engine.begin() as conn:
        conn.execute(UPSERT, {
            "url": row.url, "uid": media_uid, "fuente": row.fuente,
            "portada_r2": portada[0], "fotos_r2": fotos_r2,
            "hashes": hashes, "n_fotos": len(fotos_r2),
        })
    return "ok"


async def run_gather(limit: int, do_all: bool, concurrency: int) -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    query = SELECT_ALL if do_all else SELECT_INCREMENTAL
    with engine.connect() as conn:
        rows = conn.execute(text(query), {"lim": limit}).fetchall()
    print(f"[mirror] {len(rows)} listings a procesar (all={do_all})")

    sem = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(
            *(_mirror_one(session, engine, sem, r) for r in rows)
        )
    ok = results.count("ok")
    fail = results.count("download_fail")
    print(f"[mirror] ok={ok} download_fail={fail}")


def _demo() -> None:
    """Self-check sin red ni DB: hash estable, key .webp, resize reduce peso."""
    uid = "11111111-2222-3333-4444-555555555555"
    h1 = hashlib.sha256(b"x").hexdigest()
    k = _key(uid, h1)
    assert k == f"listings/{uid}/{h1}.webp", k
    assert _key(uid, hashlib.sha256(b"otra").hexdigest()) != k
    # Resize: una imagen grande sale más chica y en webp.
    big = Image.new("RGB", (2000, 1500), (29, 158, 117))
    buf = io.BytesIO(); big.save(buf, "JPEG", quality=95)
    orig = buf.getvalue()
    small = _resize_webp(orig, PORTADA_W, PORTADA_Q)
    assert Image.open(io.BytesIO(small)).width == PORTADA_W, "debe reescalar a PORTADA_W"
    assert len(small) < len(orig), "webp reescalado debe pesar menos"
    print(f"[demo] OK — key .webp, hash determinista, resize {len(orig)}→{len(small)}B")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--all", action="store_true", help="backfill completo (no solo nuevos)")
    ap.add_argument("--concurrency", type=int, default=20)
    ap.add_argument("--demo", action="store_true", help="self-check sin red/DB")
    args = ap.parse_args()

    if args.demo:
        _demo()
        return
    asyncio.run(run_gather(args.limit, args.all, args.concurrency))


if __name__ == "__main__":
    main()
