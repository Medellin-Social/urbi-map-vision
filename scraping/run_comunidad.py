"""Comunidad scraper orchestrator — eventos + noticias. Run daily via Railway cron."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def _run_scraper(name: str, fn, *args, **kwargs):
    print(f"[comunidad] START {name}", flush=True)
    t0 = time.time()
    try:
        result = fn(*args, **kwargs)
        print(f"[comunidad] OK    {name} — {len(result) if isinstance(result, list) else result} ({time.time()-t0:.1f}s)", flush=True)
        return result
    except Exception as exc:
        print(f"[comunidad] FAIL  {name}: {exc}", flush=True)
        return [] if True else {}


def main() -> int:
    from eventos.medellin_travel_scraper import run as medellin_travel_run
    from eventos.eventbrite_scraper import run as eventbrite_run
    from eventos.luma_scraper import run as luma_run
    from eventos.meetup_scraper import run as meetup_run
    from eventos.alcaldia_scraper import run as alcaldia_run
    from eventos.tuboleta_scraper import run as tuboleta_run
    from eventos.cultura_eterea_scraper import run as cultura_eterea_run
    from eventos.normalizer import run_todos
    from noticias.rss_scraper import run as rss_run

    # Lightweight scrapers first (no Playwright)
    medellin_travel = _run_scraper("medellin_travel", medellin_travel_run)
    cultura_eterea  = _run_scraper("cultura_eterea",  cultura_eterea_run)

    # Playwright scrapers
    eventbrite  = _run_scraper("eventbrite",  eventbrite_run)
    luma        = _run_scraper("luma",        luma_run)
    meetup      = _run_scraper("meetup",      meetup_run)
    alcaldia    = _run_scraper("alcaldia",    alcaldia_run)
    tuboleta    = _run_scraper("tuboleta",    tuboleta_run)

    # Persist all eventos via normalizer
    print("[comunidad] Persisting eventos...", flush=True)
    try:
        stats = run_todos(
            meetup_eventos=meetup,
            eventbrite_eventos=eventbrite,
            luma_eventos=luma,
            medellin_travel_eventos=medellin_travel,
            tuboleta_eventos=tuboleta,
            alcaldia_eventos=alcaldia,
            cultura_eterea_eventos=cultura_eterea,
        )
        print(f"[comunidad] eventos stats: {stats}", flush=True)
    except Exception as exc:
        print(f"[comunidad] FAIL persist eventos: {exc}", flush=True)
        return 1

    # Noticias RSS (writes to DB directly)
    print("[comunidad] START noticias RSS", flush=True)
    try:
        noticias_stats = rss_run()
        print(f"[comunidad] OK    noticias: {noticias_stats}", flush=True)
    except Exception as exc:
        print(f"[comunidad] FAIL  noticias RSS: {exc}", flush=True)

    print("[comunidad] DONE", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
