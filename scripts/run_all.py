"""
Full pipeline runner for Valle de Aburrá data collection.

Steps:
  1. Scrape fincaraiz.com.co for all 10 municipios (venta + arriendo)
  2. Scrape rematesjudiciales.click → data/raw/remates_antioquia.json
  3. Aggregate remates → data/processed/remates_por_municipio.json
  4. Aggregate raw listings → barrio-level stats (merges remates scores)
  5. Update neighborhoods.ts + marketActivity.ts

Usage:
  python run_all.py                        # full run
  python run_all.py --skip-scrape          # aggregate + update only (use existing raw files)
  python run_all.py --skip-remates         # skip remates scrape (use existing remates data)
  python run_all.py --slug medellin        # scrape only one municipio, then aggregate + update
  python run_all.py --dry-run              # scrape + aggregate, but print TS output, don't write
"""

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def run(cmd: list[str], check: bool = True) -> int:
    print(f"\n{'='*60}")
    print(f"$ {' '.join(cmd)}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=SCRIPTS_DIR)
    if check and result.returncode != 0:
        print(f"ERROR: command failed with code {result.returncode}")
        sys.exit(result.returncode)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Run full Valle de Aburrá scraping pipeline")
    parser.add_argument("--skip-scrape", action="store_true",
                        help="Skip fincaraiz scraping, use existing raw files")
    parser.add_argument("--skip-remates", action="store_true",
                        help="Skip remates scraping, use existing remates_antioquia.json")
    parser.add_argument("--slug", help="Scrape only this municipio slug")
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't write TS files, print to stdout")
    args = parser.parse_args()

    python = sys.executable

    # Step 1: Fincaraiz scrape
    if not args.skip_scrape:
        scrape_cmd = [python, "scrape_fincaraiz.py"]
        if args.slug:
            scrape_cmd += ["--slug", args.slug]
        run(scrape_cmd)
    else:
        print("\n[SKIP] Fincaraiz scraping (--skip-scrape)")

    # Step 2: Remates scrape
    if not args.skip_remates:
        run([python, "remates/scraper.py"])
    else:
        print("\n[SKIP] Remates scraping (--skip-remates)")

    # Step 3: Aggregate remates → remates_por_municipio.json
    run([python, "remates/aggregate_remates.py"])

    # Step 4: Aggregate listings → barrios_stats.json
    run([python, "aggregate.py"])

    # Step 5: Update TS
    update_cmd = [python, "update_ts.py"]
    if args.dry_run:
        update_cmd.append("--dry-run")
    run(update_cmd)

    if not args.dry_run:
        print("\n✓ Pipeline complete. Check src/data/neighborhoods.ts and marketActivity.ts")
    else:
        print("\n✓ Dry run complete. No files written.")


if __name__ == "__main__":
    main()
