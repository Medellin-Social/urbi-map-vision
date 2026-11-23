"""python -m scraping.link_checker --limit N --source X --older-than 24h --dry-run

Exit codes: 0 ok, 2 = alert raised (mass-gone brake / mass blocks) -> nothing proposed for review for braked sources. The checker never deactivates listings itself.
Never run against live portals from tests/CI.  Env: DATABASE_URL, LINK_CHECK_* (see config.py).
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import re
import sys
from datetime import timedelta

from .config import Settings
from . import store


def parse_age(s: str) -> timedelta:
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([smhd])", s.strip().lower())
    if not m:
        raise argparse.ArgumentTypeError("use e.g. 30m, 24h, 7d")
    n, u = float(m.group(1)), m.group(2)
    return timedelta(**{{"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}[u]: n})


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m scraping.link_checker", description=__doc__)
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--source", action="append", choices=list(store.SOURCES), help="repeatable; default all")
    p.add_argument("--older-than", type=parse_age, default=timedelta(hours=24))
    p.add_argument("--dry-run", action="store_true", help="fetch+classify, write NOTHING")
    p.add_argument("--retire-only", action="store_true",
                   help="skip all fetching; just run auto_retire over rows already in pending_review "
                        "(cheap seconds-long drain, independent of the heavy sweep)")
    p.add_argument("--delay", type=float, help="seconds between requests per domain (default 1.0)")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


async def amain(args) -> int:
    import asyncpg
    from .runner import run
    cfg = Settings()
    if args.delay is not None:
        cfg.domain_delay = args.delay
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        if args.retire_only:
            # auto_retire is pure SQL over pending_review rows that already meet grace+evidence; it must
            # NOT be held hostage by a full fetch sweep completing (an OOM/kill mid-sweep used to strand it).
            from api.services import link_review
            n = await link_review.auto_retire(conn)
            logging.getLogger("link_checker").info("retire-only: auto_retired=%d", n)
            return 0
        from api.utils.email import send_email   # existing Gmail-API/SMTP mechanism; only used when LINK_REVIEW_EMAILS is set
        rep = await run(conn, cfg, sources=args.source, limit=args.limit, older_than=args.older_than,
                        dry_run=args.dry_run, sender=send_email)
    finally:
        await conn.close()
    return rep.exit_code


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return asyncio.run(amain(args))


if __name__ == "__main__":
    sys.exit(main())
