"""
Run all renta_media scrapers.
Usage:
  python run_all.py               # all three scrapers
  python run_all.py --only flatio
  python run_all.py --dry-run
  python run_all.py --only booking --max-pages 5
"""
import argparse
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import get_conn


def run_scraper(name: str, fn, **kwargs) -> list:
    print(f"\n{'='*60}")
    print(f"  {name.upper()}")
    print(f"{'='*60}")
    try:
        return fn(**kwargs)
    except Exception as e:
        print(f"ERROR in {name}: {e}")
        traceback.print_exc()
        return []


def report(conn) -> None:
    print(f"\n{'='*60}")
    print("RESUMEN — raw.listings_renta_media")
    print(f"{'='*60}")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                fuente,
                COUNT(*)                                    AS listings,
                ROUND(AVG(precio_mes_cop) / 1000000.0, 1)  AS precio_avg_M,
                ROUND(MIN(precio_mes_cop) / 1000000.0, 1)  AS precio_min_M,
                ROUND(MAX(precio_mes_cop) / 1000000.0, 1)  AS precio_max_M,
                COUNT(barrio_id)                            AS geocodificados
            FROM raw.listings_renta_media
            WHERE precio_mes_cop > 0
            GROUP BY fuente
            ORDER BY fuente
        """)
        rows = cur.fetchall()

    if not rows:
        print("  (no data)")
        return

    fmt = "{:<22} {:>8} {:>12} {:>12} {:>12} {:>12}"
    print(fmt.format("Fuente", "Listings", "Avg (M COP)", "Min (M COP)", "Max (M COP)", "Geocod."))
    print("-" * 82)
    total = 0
    for fuente, listings, avg, mn, mx, geo in rows:
        total += listings
        geo_pct = f"{geo}/{listings} ({100*geo//listings}%)" if listings else "0"
        print(fmt.format(
            fuente, listings,
            str(avg or "N/A"), str(mn or "N/A"), str(mx or "N/A"),
            geo_pct,
        ))
    print("-" * 82)
    print(fmt.format("TOTAL", total, "", "", "", ""))

    # Coherence check
    print(f"\n{'='*60}")
    print("COHERENCIA (mercado nomad Medellín: COP $1.5M–$10M/mes)")
    print(f"{'='*60}")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT fuente,
                   PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mes_cop) AS p25,
                   PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY precio_mes_cop) AS p50,
                   PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mes_cop) AS p75
            FROM raw.listings_renta_media
            WHERE precio_mes_cop > 0
            GROUP BY fuente
        """)
        for fuente, p25, p50, p75 in cur.fetchall():
            def m(v):
                return f"COP {v/1e6:.1f}M" if v else "N/A"
            coherent = 1_500_000 <= (p50 or 0) <= 10_000_000
            flag = "✓" if coherent else "⚠ REVISAR"
            print(f"  {fuente:<22} p25={m(p25)} p50={m(p50)} p75={m(p75)}  {flag}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run renta_media scrapers")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    parser.add_argument(
        "--only",
        choices=["nomadbarrio", "flatio", "booking"],
        help="Run only one scraper",
    )
    parser.add_argument("--max-pages", type=int, default=3, help="Booking: max pages (default 3)")
    args = parser.parse_args()

    import nomadbarrio_scraper
    import flatio_scraper
    import booking_scraper

    # Priority order: NomadBarrio → Flatio → Booking
    scrapers = [
        ("nomadbarrio", nomadbarrio_scraper.scrape, {"dry_run": args.dry_run}),
        ("flatio",      flatio_scraper.scrape,      {"dry_run": args.dry_run}),
        ("booking",     booking_scraper.scrape,     {"dry_run": args.dry_run, "max_pages": args.max_pages}),
    ]

    if args.only:
        scrapers = [(n, fn, kw) for n, fn, kw in scrapers if n == args.only]

    all_counts: dict[str, int] = {}
    for name, fn, kwargs in scrapers:
        results = run_scraper(name, fn, **kwargs)
        all_counts[name] = len(results)

    # Quick summary
    print(f"\n{'='*60}")
    print("SCRAPERS — listings parsed this run")
    print(f"{'='*60}")
    for name, count in all_counts.items():
        print(f"  {name:<22} {count}")

    # DB summary (only if we actually wrote)
    if not args.dry_run:
        try:
            conn = get_conn()
            report(conn)
            conn.close()
        except Exception as e:
            print(f"Report error: {e}")


if __name__ == "__main__":
    main()
